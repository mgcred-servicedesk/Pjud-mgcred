import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { makeBackup } from './backup.mjs';
const source=resolve(process.env.DATA_DIR||'data'),destination=resolve(process.env.BACKUP_DIR||'backups');
const interval=Math.max(3600,Number(process.env.BACKUP_INTERVAL_SECONDS||86400))*1000;
const keep=Math.max(2,Number(process.env.KEEP_BACKUPS||14));
async function run(){
  try{
    const created=await makeBackup(source,destination);
    const entries=(await readdir(destination,{withFileTypes:true})).filter(e=>e.isDirectory()&&/^mgcred-\d{4}-\d{2}-\d{2}T[0-9-]+Z$/.test(e.name)).map(e=>e.name).sort().reverse();
    for(const name of entries.slice(keep)){const target=resolve(destination,name);if(!target.startsWith(destination+sep)||target===destination)throw Error('Destino de retenção inválido.');await readFile(join(target,'COMPLETO.txt'));await rm(target,{recursive:true,force:false});}
    await writeFile(join(destination,'last-success.json'),JSON.stringify({time:new Date().toISOString(),backup:created}),{mode:0o600});console.log(JSON.stringify({event:'backup.ok',time:new Date().toISOString()}));
  }catch(e){console.error(JSON.stringify({event:'backup.failed',time:new Date().toISOString(),message:e.message}));}
}
await run();setInterval(run,interval);
