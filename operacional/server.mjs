import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, transaction, audit, createUser, publicUser, ORG, iso } from './lib/database.mjs';
import { fail, text, email, choice, date, password, hashPassword, verifyPassword, token, digest, categories, statuses, priorities } from './lib/security.mjs';
import { parseCSV, normalizeCase, columns } from './lib/csv.mjs';

const root=resolve(fileURLToPath(new URL('./public/',import.meta.url)));
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const maxFile=5*1024*1024;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf'};
const allowedFiles={'.pdf':'application/pdf','.txt':'text/plain','.csv':'text/csv','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
async function jsonBody(req,max=128*1024){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'Envie JSON.');
  const chunks=[];let bytes=0;
  for await(const part of req){bytes+=part.length;if(bytes>max)fail(413,'Envio acima do limite.');chunks.push(part);}
  try {const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v;}catch{fail(400,'JSON inválido.');}
}
function output(res,status,body,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(body));}
function version(v,current){if(!Number.isInteger(v)||v!==current)fail(409,'Este registro foi alterado. Atualize a página e tente novamente.');}
export async function createPortal(options={}){
  const production=options.production??process.env.NODE_ENV==='production';
  const origin=options.origin??process.env.APP_ORIGIN??(production?'':'http://127.0.0.1:4320');
  if(!origin||new URL(origin).origin!==origin||(production&&!origin.startsWith('https://')))throw Error('APP_ORIGIN deve conter a origem exata; HTTPS é obrigatório em produção.');
  const dir=resolve(options.dataDir??process.env.DATA_DIR??'data');
  const db=openDatabase(dir);const cookieName=production?'__Host-mgcred':'mgcred_session';
  const trustProxy=options.trustProxy??process.env.TRUST_PROXY==='1';
  const maxStorage=Number(process.env.MAX_STORAGE_BYTES||2*1024**3);
  const ipOf=req=>trustProxy?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress;
  function rate(key,limit,windowMs=900000){const t=Date.now();db.prepare('DELETE FROM rates WHERE expires<?').run(t);const item=db.prepare('SELECT * FROM rates WHERE key=?').get(key);if(item&&item.count>=limit)fail(429,'Muitas tentativas. Aguarde 15 minutos.');db.prepare('INSERT INTO rates(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,t+windowMs);}
  function session(req){const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!raw||raw.length>100)return null;const h=digest(raw);const s=db.prepare('SELECT s.*,u.org,u.name,u.email,u.department,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=?').get(h);if(!s||!s.active||s.org!==ORG||s.expires<Date.now()||s.last_seen<Date.now()-30*60000){if(s)db.prepare('DELETE FROM sessions WHERE hash=?').run(h);return null;}db.prepare('UPDATE sessions SET last_seen=? WHERE hash=?').run(Date.now(),h);return {id:s.user_id,...publicUser({...s,id:s.user_id}),sessionHash:h,csrf:s.csrf};}
  function admin(u){if(u.role!=='admin')fail(403,'Ação exclusiva do administrador jurídico.');}
  function requestRow(id,u){const r=db.prepare('SELECT * FROM requests WHERE id=? AND org=?').get(id,ORG);if(!r||(u.role!=='admin'&&r.creator!==u.id&&!db.prepare('SELECT 1 FROM request_access WHERE request_id=? AND user_id=?').get(id,u.id)))fail(404,'Solicitação não encontrada.');return r;}
  function caseRow(id,u){const r=db.prepare('SELECT * FROM cases WHERE id=? AND org=?').get(id,ORG);if(!r||(u.role!=='admin'&&!r.client_visible))fail(404,'Processo não encontrado.');return r;}
  function taskRow(id,u){const r=db.prepare('SELECT * FROM tasks WHERE id=? AND org=?').get(id,ORG);if(!r||(u.role!=='admin'&&r.assignee!==u.id))fail(404,'Tarefa não encontrada.');if(u.role!=='admin'){if(r.request_id)requestRow(r.request_id,u);if(r.case_id)caseRow(r.case_id,u);}return r;}
  function activeUser(id){if(id===null||id==='')return null;const u=db.prepare('SELECT * FROM users WHERE id=? AND org=? AND active=1').get(id,ORG);if(!u)fail(400,'Usuário indisponível.');return u;}
  function listRequests(u){return db.prepare(`SELECT r.*,c.name AS requester,COALESCE(o.name,'Jurídico') AS owner_name FROM requests r JOIN users c ON c.id=r.creator LEFT JOIN users o ON o.id=r.owner WHERE r.org=? AND (?='admin' OR r.creator=? OR EXISTS(SELECT 1 FROM request_access a WHERE a.request_id=r.id AND a.user_id=?)) ORDER BY r.updated DESC LIMIT 1001`).all(ORG,u.role,u.id,u.id);}
  function mappedRequest(r){return {...r,files:db.prepare('SELECT id,name,mime,size,created FROM documents WHERE request_id=? ORDER BY created').all(r.id).map(f=>({...f,url:'/api/documents/'+f.id}))};}
  function invitation(userId,actor){const secret=token();transaction(db,()=>{db.prepare('UPDATE invitations SET used=1 WHERE user_id=?').run(userId);db.prepare('INSERT INTO invitations(hash,user_id,expires) VALUES(?,?,?)').run(digest(secret),userId,Date.now()+86400000);audit(db,actor,'convite.emitido','user',userId);});return `${origin}/#ativar=${secret}`;}
  function storeCase(c,actor,id=null,v=null){
    if(id){const old=caseRow(id,actor);version(v,old.version);db.prepare('UPDATE cases SET number=?,title=?,party=?,opponent=?,court=?,division=?,phase=?,status=?,risk=?,value_cents=?,next_due=?,notes=?,client_visible=?,updated=?,version=version+1 WHERE id=?').run(c.number,c.title,c.party,c.opponent,c.court,c.division,c.phase,c.status,c.risk,c.value_cents,c.next_due,c.notes,c.client_visible,iso(),id);}
    else{id=randomUUID();db.prepare('INSERT INTO cases(id,org,number,title,party,opponent,court,division,phase,status,risk,value_cents,next_due,notes,client_visible,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,ORG,c.number,c.title,c.party,c.opponent,c.court,c.division,c.phase,c.status,c.risk,c.value_cents,c.next_due,c.notes,c.client_visible,iso(),iso());}
    audit(db,actor,'processo.salvo','case',id,{number:c.number,client_visible:!!c.client_visible});return id;
  }
  async function handle(req,res){
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
    const url=new URL(req.url,origin),path=url.pathname,method=req.method;
    if(method==='GET'&&path==='/healthz'){db.prepare('SELECT 1').get();return output(res,200,{ok:true});}
    if(!path.startsWith('/api/')){
      if(!['GET','HEAD'].includes(method))fail(405,'Método não permitido.');
      let clean;try{clean=decodeURIComponent(path);}catch{fail(400,'Caminho inválido.');}
      const target=resolve(root,'.'+(clean==='/'?'/index.html':clean));if(!target.startsWith(root+sep)&&target!==join(root,'index.html'))fail(404,'Não encontrado.');
      if(!mime[extname(target)]||clean.includes('\\')||clean.split('/').some(x=>x.startsWith('.')))fail(404,'Não encontrado.');
      let bytes;try{bytes=await readFile(target);}catch{fail(404,'Não encontrado.');}res.writeHead(200,{'Content-Type':mime[extname(target)]});return res.end(method==='HEAD'?undefined:bytes);
    }
    if(!['GET','POST','PATCH'].includes(method))fail(405,'Método não permitido.');
    if(method!=='GET'&&req.headers.origin!==origin)fail(403,'Origem da requisição não autorizada.');
    if(path==='/api/login'&&method==='POST'){
      rate('auth-ip:'+digest(ipOf(req)),40);const body=await jsonBody(req);const e=email(body.email);rate('auth-user:'+digest(e),10);const pw=typeof body.password==='string'&&body.password.length<=128?body.password:'';
      const u=db.prepare('SELECT * FROM users WHERE email=? AND org=?').get(e,ORG);
      const valid=await verifyPassword(pw,u?.password);
      const current=u&&db.prepare('SELECT * FROM users WHERE id=?').get(u.id);
      if(!valid||!current?.active||current.password!==u.password){audit(db,null,'login.recusado','session','',{account:digest(e)});fail(401,'E-mail ou senha inválidos.');}
      const raw=token(),csrf=token();transaction(db,()=>{db.prepare('DELETE FROM sessions WHERE expires<? OR last_seen<?').run(Date.now(),Date.now()-1800000);db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(digest(raw),u.id,csrf,Date.now()+8*3600000,Date.now());audit(db,u,'login.realizado','session','');});
      return output(res,200,{user:publicUser(current),csrf},{'Set-Cookie':`${cookieName}=${raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${production?'; Secure':''}`});
    }
    if(path==='/api/activate'&&method==='POST'){
      rate('activate:'+digest(ipOf(req)),20);const b=await jsonBody(req);const secret=text(b.token,'Convite',100);password(b.password);
      const found=db.prepare('SELECT i.*,u.active FROM invitations i JOIN users u ON u.id=i.user_id WHERE i.hash=?').get(digest(secret));if(!found||found.used||!found.active||found.expires<Date.now())fail(400,'Convite inválido ou expirado. Solicite um novo ao administrador.');
      const hashed=await hashPassword(b.password);
      transaction(db,()=>{const row=db.prepare('SELECT * FROM invitations WHERE hash=? AND used=0 AND expires>?').get(digest(secret),Date.now());const user=db.prepare('SELECT * FROM users WHERE id=?').get(found.user_id);if(!row||!user.active)fail(400,'Convite indisponível.');db.prepare('UPDATE users SET password=? WHERE id=?').run(hashed,row.user_id);db.prepare('UPDATE invitations SET used=1 WHERE user_id=?').run(row.user_id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);audit(db,user,'senha.definida','user',user.id);});return output(res,200,{ok:true});
    }
    const user=session(req);if(!user)fail(401,'Entre para acessar o portal.');
    if(method!=='GET'&&req.headers['x-csrf-token']!==user.csrf)fail(403,'Sessão desatualizada. Recarregue a página.');
    if(method!=='GET')rate('write:'+user.id,600);
    if(path==='/api/me'&&method==='GET')return output(res,200,{user:publicUser(user),csrf:user.csrf});
    if(path==='/api/logout'&&method==='POST'){db.prepare('DELETE FROM sessions WHERE hash=?').run(user.sessionHash);audit(db,user,'logout','session','');return output(res,200,{ok:true},{'Set-Cookie':`${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${production?'; Secure':''}`});}
    if(path==='/api/password'&&method==='POST'){const b=await jsonBody(req);rate('password:'+user.id,5);const u=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);if(!await verifyPassword(text(b.current,'Senha atual',128),u.password))fail(400,'Senha atual incorreta.');const hash=await hashPassword(password(b.password));transaction(db,()=>{if(db.prepare('SELECT password FROM users WHERE id=?').get(user.id).password!==u.password)fail(409,'Senha alterada em outra sessão.');db.prepare('UPDATE users SET password=? WHERE id=?').run(hash,user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);db.prepare('UPDATE invitations SET used=1 WHERE user_id=?').run(user.id);audit(db,user,'senha.alterada','user',user.id);});return output(res,200,{ok:true});}
    if(path==='/api/state'&&method==='GET'){
      const requests=listRequests(user);const cases=db.prepare("SELECT * FROM cases WHERE org=? AND (?='admin' OR client_visible=1) ORDER BY updated DESC LIMIT 1001").all(ORG,user.role);
      const tasks=db.prepare("SELECT t.*,COALESCE(u.name,'Jurídico') assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assignee WHERE t.org=? AND (?='admin' OR t.assignee=?) ORDER BY t.done,t.due LIMIT 1001").all(ORG,user.role,user.id).filter(t=>{try{taskRow(t.id,user);return true;}catch{return false;}});
      const ids=new Set(requests.map(r=>r.id));const activity=db.prepare("SELECT a.*,u.name actor FROM audit a LEFT JOIN users u ON u.id=a.user_id WHERE a.org=? AND a.entity='request' ORDER BY a.id DESC LIMIT 500").all(ORG).filter(a=>ids.has(a.entity_id)).slice(0,20);
      return output(res,200,{user:publicUser(user),requests:requests.slice(0,1000).map(mappedRequest),cases:cases.slice(0,1000),tasks:tasks.slice(0,1000),activity,truncated:requests.length>1000||cases.length>1000||tasks.length>1000,categories,statuses,priorities});
    }
    if(path==='/api/requests'&&method==='POST'){
      const b=await jsonBody(req);const subject=text(b.subject,'Assunto',140),description=text(b.description,'Descrição',5000),category=choice(b.category,categories,'Categoria'),priority=choice(b.priority,priorities,'Prioridade');
      const department=user.role==='admin'?text(b.department??user.department,'Setor',80,true):user.department;
      const id=transaction(db,()=>{const year=new Date().getUTCFullYear();db.prepare('INSERT INTO sequences(year,value) VALUES(?,1) ON CONFLICT(year) DO UPDATE SET value=value+1').run(year);const n=db.prepare('SELECT value FROM sequences WHERE year=?').get(year).value;const id=`JUR-${year}-${String(n).padStart(3,'0')}`;const owner=db.prepare("SELECT id FROM users WHERE org=? AND role='admin' AND active=1 ORDER BY created LIMIT 1").get(ORG)?.id||null;db.prepare('INSERT INTO requests(id,org,subject,category,description,priority,status,creator,owner,department,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,ORG,subject,category,description,priority,'Nova',user.id,owner,department,iso(),iso());audit(db,user,'solicitação.criada','request',id);return id;});return output(res,201,{id});
    }
    const requestMatch=path.match(/^\/api\/requests\/([A-Za-z0-9-]+)(?:\/(messages|files|access))?$/);
    if(requestMatch){const id=requestMatch[1],action=requestMatch[2];const r=requestRow(id,user);
      if(!action&&method==='GET'){const history=db.prepare('SELECT a.*,u.name actor FROM audit a LEFT JOIN users u ON u.id=a.user_id WHERE a.org=? AND a.entity=\'request\' AND a.entity_id=? ORDER BY a.id DESC').all(ORG,id);const messages=db.prepare('SELECT m.*,u.name author FROM messages m JOIN users u ON u.id=m.user_id WHERE request_id=? ORDER BY m.created').all(id);const access=user.role==='admin'?db.prepare('SELECT u.id,u.name,u.email FROM request_access a JOIN users u ON u.id=a.user_id WHERE a.request_id=?').all(id):[];return output(res,200,{...mappedRequest(r),history,messages,access});}
      if(!action&&method==='PATCH'){admin(user);const b=await jsonBody(req);version(b.version,r.version);const status=choice(b.status??r.status,statuses,'Status'),priority=choice(b.priority??r.priority,priorities,'Prioridade'),owner=own(b,'owner')?activeUser(b.owner)?.id??null:r.owner;if(owner&&activeUser(owner).role!=='admin')fail(400,'Responsável deve ser administrador jurídico.');transaction(db,()=>{version(b.version,requestRow(id,user).version);db.prepare('UPDATE requests SET status=?,priority=?,owner=?,updated=?,version=version+1 WHERE id=?').run(status,priority,owner,iso(),id);audit(db,user,'solicitação.atualizada','request',id,{status,priority,owner});});return output(res,200,{ok:true});}
      if(action==='messages'&&method==='POST'){const b=await jsonBody(req);const body=text(b.body,'Mensagem',5000);transaction(db,()=>{db.prepare('INSERT INTO messages VALUES(?,?,?,?,?)').run(randomUUID(),id,user.id,body,iso());db.prepare('UPDATE requests SET updated=? WHERE id=?').run(iso(),id);audit(db,user,'mensagem.registrada','request',id);});return output(res,201,{ok:true});}
      if(action==='access'&&method==='POST'){admin(user);const b=await jsonBody(req);const target=activeUser(b.user_id);if(!target)fail(400,'Selecione um usuário.');if(typeof b.allow!=='boolean')fail(400,'Permissão inválida.');transaction(db,()=>{if(b.allow)db.prepare('INSERT OR IGNORE INTO request_access VALUES(?,?)').run(id,target.id);else db.prepare('DELETE FROM request_access WHERE request_id=? AND user_id=?').run(id,target.id);audit(db,user,b.allow?'acesso.concedido':'acesso.removido','request',id,{user_id:target.id});});return output(res,200,{ok:true});}
      if(action==='files'&&method==='POST'){
        rate('upload:'+user.id,40);const b=await jsonBody(req,8*1024*1024);const name=text(b.name,'Nome do arquivo',180);if(/[\\/\r\n]/.test(name))fail(400,'Nome de arquivo inválido.');const extension=extname(name).toLowerCase();if(!allowedFiles[extension])fail(400,'Formato permitido: PDF, DOCX, XLSX, TXT, CSV, PNG ou JPG.');
        // Validação linear (sem retrocesso): a expressão anterior estourava a pilha acima de ~3,5 MB.
        if(typeof b.base64!=='string'||b.base64.length>Math.ceil(maxFile/3)*4||b.base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64))fail(400,'Arquivo inválido ou maior que 5 MB.');
        const bytes=Buffer.from(b.base64,'base64');if(bytes.toString('base64')!==b.base64)fail(400,'Arquivo inválido ou maior que 5 MB.');if(!bytes.length||bytes.length>maxFile)fail(400,'Arquivo vazio ou maior que 5 MB.');
        const header=bytes.subarray(0,8).toString('hex');if((extension==='.pdf'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))||(['.docx','.xlsx'].includes(extension)&&!header.startsWith('504b0304'))||(extension==='.png'&&!header.startsWith('89504e470d0a1a0a'))||(['.jpg','.jpeg'].includes(extension)&&!header.startsWith('ffd8ff'))||(['.txt','.csv'].includes(extension)&&bytes.includes(0)))fail(400,'Conteúdo incompatível com a extensão.');
        const fileId=randomUUID(),filePath=join(dir,'files',fileId);await writeFile(filePath,bytes,{flag:'wx',mode:0o600});
        try{transaction(db,()=>{requestRow(id,user);if(db.prepare('SELECT count(*) n FROM documents WHERE request_id=?').get(id).n>=25)fail(400,'Limite de 25 anexos por solicitação.');const total=db.prepare('SELECT coalesce(sum(size),0) n FROM documents').get().n;if(total+bytes.length>maxStorage)fail(507,'Limite de armazenamento atingido. Contate o administrador.');db.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?)').run(fileId,id,name,allowedFiles[extension],bytes.length,digest(bytes),user.id,iso());audit(db,user,'documento.anexado','request',id,{document_id:fileId,name});});}catch(e){await unlink(filePath).catch(()=>{});throw e;}
        return output(res,201,{id:fileId});
      }
    }
    const docMatch=path.match(/^\/api\/documents\/([a-f0-9-]{36})$/);
    if(docMatch&&method==='GET'){const f=db.prepare('SELECT * FROM documents WHERE id=?').get(docMatch[1]);if(!f)fail(404,'Documento não encontrado.');requestRow(f.request_id,user);const bytes=await readFile(join(dir,'files',f.id));if(digest(bytes)!==f.sha256)fail(500,'Integridade do documento não confirmada.');audit(db,user,'documento.baixado','request',f.request_id,{document_id:f.id});res.writeHead(200,{'Content-Type':f.mime,'Content-Disposition':`attachment; filename="documento${extname(f.name).replace(/[^.a-zA-Z0-9]/g,'')}"; filename*=UTF-8''${encodeURIComponent(f.name).replace(/'/g,'%27')}`,'Content-Length':bytes.length});return res.end(bytes);}
    if(path==='/api/users'&&method==='GET'){admin(user);return output(res,200,{users:db.prepare('SELECT * FROM users WHERE org=? ORDER BY name').all(ORG).map(publicUser)});}
    if(path==='/api/users'&&method==='POST'){admin(user);const b=await jsonBody(req);const data={email:email(b.email),name:text(b.name,'Nome',100),department:text(b.department??'','Setor',80,true),role:choice(b.role,['admin','client'],'Perfil')};if(db.prepare('SELECT 1 FROM users WHERE email=?').get(data.email))fail(409,'E-mail já cadastrado.');const u=transaction(db,()=>{const u=createUser(db,data);audit(db,user,'usuário.criado','user',u.id);return u;});return output(res,201,{user:publicUser(u),activation_url:invitation(u.id,user)});}
    const userMatch=path.match(/^\/api\/users\/([a-f0-9-]{36})(?:\/(invite))?$/);
    if(userMatch){admin(user);const target=db.prepare('SELECT * FROM users WHERE id=? AND org=?').get(userMatch[1],ORG);if(!target)fail(404,'Usuário não encontrado.');if(userMatch[2]==='invite'&&method==='POST'){if(!target.active)fail(400,'Usuário desativado.');return output(res,200,{activation_url:invitation(target.id,user)});}if(method==='PATCH'&&!userMatch[2]){const b=await jsonBody(req);if(typeof b.active!=='boolean')fail(400,'Situação inválida.');if(target.id===user.id)fail(400,'Não é possível desativar sua própria conta.');transaction(db,()=>{db.prepare('UPDATE users SET active=? WHERE id=?').run(b.active?1:0,target.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);db.prepare('UPDATE invitations SET used=1 WHERE user_id=?').run(target.id);audit(db,user,b.active?'usuário.ativado':'usuário.desativado','user',target.id);});return output(res,200,{ok:true});}}
    if(path==='/api/cases'&&method==='POST'){admin(user);const b=await jsonBody(req);const c=normalizeCase(b);if(db.prepare('SELECT 1 FROM cases WHERE org=? AND number=?').get(ORG,c.number))fail(409,'Processo já cadastrado.');const id=transaction(db,()=>storeCase(c,user));return output(res,201,{id});}
    const caseMatch=path.match(/^\/api\/cases\/([a-f0-9-]{36})$/);
    if(caseMatch&&method==='PATCH'){admin(user);const b=await jsonBody(req);const c=normalizeCase(b);const id=transaction(db,()=>storeCase(c,user,caseMatch[1],b.version));return output(res,200,{id});}
    if(path==='/api/import/preview'&&method==='POST'){admin(user);const b=await jsonBody(req,2*1024*1024);const parsed=parseCSV(b.csv);for(const [i,c] of parsed.items.entries())if(db.prepare('SELECT 1 FROM cases WHERE org=? AND number=?').get(ORG,c.number))parsed.errors.push({line:null,message:`Processo ${c.number} já cadastrado. Nenhuma linha será importada.`});return output(res,200,{...parsed,hash:digest(b.csv)});}
    if(path==='/api/import/confirm'&&method==='POST'){admin(user);const b=await jsonBody(req,2*1024*1024);if(typeof b.csv!=='string'||digest(b.csv)!==b.hash)fail(400,'Arquivo alterado. Valide novamente.');const p=parseCSV(b.csv);if(p.errors.length)fail(400,'Corrija as linhas inválidas antes de importar.');const id=transaction(db,()=>{for(const c of p.items){if(db.prepare('SELECT 1 FROM cases WHERE org=? AND number=?').get(ORG,c.number))fail(409,`Processo ${c.number} já cadastrado. Importação cancelada.`);storeCase(c,user);}const id=randomUUID();db.prepare('INSERT INTO imports VALUES(?,?,?,?,?)').run(id,ORG,user.id,p.items.length,iso());audit(db,user,'importação.concluída','import',id,{count:p.items.length});return id;});return output(res,201,{id,count:p.items.length});}
    if(path==='/api/import/template'&&method==='GET'){admin(user);res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="modelo-processos.csv"'});return res.end('\uFEFF'+columns.join(';')+'\r\n');}
    if(path==='/api/tasks'&&method==='POST'){admin(user);const b=await jsonBody(req);const title=text(b.title,'Título',200),description=text(b.description??'','Descrição',3000,true),due=date(b.due,false),priority=choice(b.priority,priorities,'Prioridade'),assignee=activeUser(b.assignee)?.id??null,request_id=b.request_id||null,case_id=b.case_id||null;if(request_id)requestRow(request_id,user);if(case_id)caseRow(case_id,user);if(request_id&&assignee){const target=activeUser(assignee);requestRow(request_id,target);}if(case_id&&assignee)caseRow(case_id,activeUser(assignee));const id=randomUUID();transaction(db,()=>{db.prepare('INSERT INTO tasks(id,org,title,description,due,priority,assignee,request_id,case_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,ORG,title,description,due,priority,assignee,request_id,case_id,iso(),iso());audit(db,user,'tarefa.criada','task',id);});return output(res,201,{id});}
    const taskMatch=path.match(/^\/api\/tasks\/([a-f0-9-]{36})$/);
    if(taskMatch&&method==='PATCH'){const t=taskRow(taskMatch[1],user);const b=await jsonBody(req);version(b.version,t.version);if(typeof b.done!=='boolean')fail(400,'Situação inválida.');transaction(db,()=>{version(b.version,taskRow(t.id,user).version);db.prepare('UPDATE tasks SET done=?,updated=?,version=version+1 WHERE id=?').run(b.done?1:0,iso(),t.id);audit(db,user,b.done?'tarefa.concluída':'tarefa.reaberta','task',t.id);});return output(res,200,{ok:true});}
    if(path==='/api/audit'&&method==='GET'){admin(user);const before=Math.max(0,Number(url.searchParams.get('before')||0));const rows=db.prepare('SELECT a.*,u.name actor FROM audit a LEFT JOIN users u ON u.id=a.user_id WHERE a.org=? AND (?=0 OR a.id<?) ORDER BY a.id DESC LIMIT 100').all(ORG,before,before);return output(res,200,{events:rows,next:rows.length===100?rows.at(-1).id:null});}
    fail(404,'Recurso não encontrado.');
  }
  const server=createServer((req,res)=>handle(req,res).catch(e=>{if(res.headersSent){res.destroy();return;}const status=e.status||((e.code||'').startsWith('ERR_SQLITE')?409:500);if(status>=500)console.error(JSON.stringify({level:'error',requestId:randomUUID(),code:e.code||'internal'}));output(res,status,{error:e.status?e.message:status===409?'Registro duplicado ou operação conflitante.':'Não foi possível concluir. Contate o administrador.'});}));
  server.requestTimeout=30000;server.headersTimeout=15000;server.maxHeadersCount=50;
  return {server,db,origin,dir,async close(){await new Promise((r,j)=>server.close(e=>e?j(e):r()));db.close();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=await createPortal();const port=Number(process.env.PORT||4320),host=process.env.HOST||'127.0.0.1';
  app.server.listen(port,host,()=>console.log(`Portal MG Cred: ${app.origin}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
