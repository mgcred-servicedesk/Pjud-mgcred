import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, copyFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function restoreBackup(source,target){
  source=resolve(source);target=resolve(target);if(source===target)throw Error('Origem e destino devem ser diferentes.');
  await readFile(join(source,'COMPLETO.txt'));const manifest=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));if(manifest.version!==1)throw Error('Formato de backup incompatível.');
  if(hash(await readFile(join(source,'portal.sqlite')))!==manifest.databaseHash)throw Error('Banco do backup corrompido.');
  for(const f of manifest.documents){if(!/^[a-f0-9-]{36}$/.test(f.id))throw Error('Identificador inválido no backup.');if(hash(await readFile(join(source,'files',f.id)))!==f.sha256)throw Error('Documento do backup corrompido.');}
  await mkdir(target,{recursive:true,mode:0o700});if((await readdir(target)).length)throw Error('Restaure somente em uma pasta vazia. O banco existente não será sobrescrito.');
  await mkdir(join(target,'files'),{mode:0o700});await copyFile(join(source,'portal.sqlite'),join(target,'portal.sqlite'));
  for(const f of manifest.documents)await copyFile(join(source,'files',f.id),join(target,'files',f.id));
  const db=new DatabaseSync(join(target,'portal.sqlite'));try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Falha na integridade do banco.');db.exec('DELETE FROM sessions; DELETE FROM invitations;');}finally{db.close();}return target;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error('Uso: node scripts/restore.mjs PASTA_BACKUP PASTA_DESTINO_VAZIA');console.log('Restauração concluída: '+await restoreBackup(process.argv[2],process.argv[3]));}
