import { resolve } from 'node:path';
import { openDatabase, createUser, transaction, audit, ORG } from '../lib/database.mjs';
import { email, text, token, digest } from '../lib/security.mjs';
const args=process.argv.slice(2);const arg=k=>args[args.indexOf(k)+1];
if(!args.includes('--email')){console.error('Uso: node scripts/admin.mjs --email administrador@empresa.com.br --name "Administrador Jurídico" [--recover]');process.exit(1);}
const mail=email(arg('--email')),name=text(args.includes('--name')?arg('--name'):'Administrador Jurídico','Nome',100);
const origin=process.env.APP_ORIGIN||'http://127.0.0.1:4320';if(new URL(origin).origin!==origin)throw Error('APP_ORIGIN inválida.');
if(process.env.NODE_ENV==='production'&&!origin.startsWith('https://'))throw Error('HTTPS é obrigatório em produção.');
try{
const db=openDatabase(resolve(process.env.DATA_DIR||'data'));const secret=token();
transaction(db,()=>{let user=db.prepare('SELECT * FROM users WHERE email=?').get(mail);const admins=db.prepare("SELECT count(*) n FROM users WHERE org=? AND role='admin'").get(ORG).n;
  if(user){if(!args.includes('--recover'))throw Error('Usuário já existe. Use --recover para emitir um novo link de recuperação.');if(user.role!=='admin'||user.org!==ORG)throw Error('Recuperação por este comando permitida apenas para administradores.');}
  else {if(admins&&!args.includes('--recover'))throw Error('Já existe administrador. Cadastre usuários pela interface.');user=createUser(db,{email:mail,name,role:'admin'});}
  db.prepare('UPDATE users SET active=1 WHERE id=?').run(user.id);db.prepare('UPDATE invitations SET used=1 WHERE user_id=?').run(user.id);db.prepare('INSERT INTO invitations(hash,user_id,expires) VALUES(?,?,?)').run(digest(secret),user.id,Date.now()+86400000);audit(db,null,'ativação.emitida.pela.ti','user',user.id);
});
db.close();console.log(`Administrador: ${mail}\nAbra este link pessoal para definir a senha (validade de 24 horas):\n${origin}/#ativar=${secret}\nNão envie o link a terceiros nem o salve em arquivos públicos.`);
}catch(e){console.error('Erro: '+e.message);process.exit(1);}
