import { fail, text, date, choice } from './security.mjs';
export const columns=['numero','assunto','parte','parte_contraria','tribunal','vara','fase','status','risco','valor','proximo_prazo','observacoes'];
export function parseCSV(raw) {
  if(typeof raw!=='string'||raw.length>1024*1024)fail(400,'CSV deve ter no máximo 1 MB.');
  raw=raw.replace(/^\uFEFF/,''); const first=raw.split(/\r?\n/)[0]; const sep=first.includes(';')?';':',';
  const rows=[];let row=[],field='',quoted=false,closed=false;
  for(let i=0;i<raw.length;i++) {const c=raw[i];
    if(quoted){if(c==='"'){if(raw[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c==='"'){if(field||closed)fail(400,'CSV com aspas inválidas.');quoted=true;continue;}
    if(c===sep||c==='\n'||c==='\r'){row.push(field);field='';closed=false;if(c!==sep){if(c==='\r'&&raw[i+1]==='\n')i++;if(row.some(x=>x!==''))rows.push(row);row=[];}continue;}
    if(closed&&c!==' ')fail(400,'CSV inválido após aspas.');if(!closed)field+=c;
  }
  if(quoted)fail(400,'CSV com aspas não fechadas.');if(field||row.length){row.push(field);rows.push(row);}
  if(rows.length<2||rows.length>501)fail(400,'Importe entre 1 e 500 processos por arquivo.');
  const headers=rows.shift().map(x=>x.trim().toLowerCase());
  if(headers.length!==new Set(headers).size||!headers.includes('numero')||!headers.includes('assunto')||headers.some(h=>!columns.includes(h)))fail(400,'Use as colunas do modelo CSV: numero e assunto são obrigatórias.');
  const errors=[],items=[],seen=new Set();
  rows.forEach((r,i)=>{try{if(r.length!==headers.length)fail(400,'Quantidade de colunas diferente do cabeçalho.');const item=normalizeCase(Object.fromEntries(headers.map((h,j)=>[h,r[j]])));if(seen.has(item.number))fail(400,'Número repetido no arquivo.');seen.add(item.number);items.push(item);}catch(e){errors.push({line:i+2,message:e.message});}});
  return {items,errors,total:rows.length};
}
export function normalizeCase(v) {
  let amount=String(v.valor??v.value??'0').trim().replace(/^R\$\s*/,'');
  if(amount==='')amount='0';if(amount.includes(','))amount=amount.replace(/\./g,'').replace(',','.');
  if(!/^\d+(\.\d{1,2})?$/.test(amount))fail(400,'Valor monetário inválido.');
  const cents=Math.round(Number(amount)*100);if(!Number.isSafeInteger(cents)||cents>1e14)fail(400,'Valor monetário fora do limite.');
  const number=text(v.numero??v.number,'Número',40);if(!/^[A-Za-z0-9./ -]+$/.test(number))fail(400,'Número do processo inválido.');
  return {number,title:text(v.assunto??v.title,'Assunto',200),party:text(v.parte??v.party??'','Parte',150,true),opponent:text(v.parte_contraria??v.opponent??'','Parte contrária',150,true),court:text(v.tribunal??v.court??'','Tribunal',80,true),division:text(v.vara??v.division??'','Vara',120,true),phase:text(v.fase??v.phase??'','Fase',80,true),status:choice(v.status||'Ativo',['Ativo','Suspenso','Encerrado'],'Status'),risk:choice(v.risco??v.risk??'Não avaliado',['Não avaliado','Baixo','Médio','Alto'],'Risco'),value_cents:cents,next_due:date(v.proximo_prazo??v.next_due??''),notes:text(v.observacoes??v.notes??'','Observações',5000,true),client_visible:v.client_visible===true?1:0};
}
