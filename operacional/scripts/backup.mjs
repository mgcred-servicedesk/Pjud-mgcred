import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export async function makeBackup(dataDir,backupRoot){
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');const target=join(resolve(backupRoot),'mgcred-'+stamp);await mkdir(join(target,'files'),{recursive:true,mode:0o700});
  const db=new DatabaseSync(join(resolve(dataDir),'portal.sqlite'),{readOnly:true});try{await backup(db,join(target,'portal.sqlite'));}finally{db.close();}
  const snapshot=new DatabaseSync(join(target,'portal.sqlite'),{readOnly:true});const entries=snapshot.prepare('SELECT id,sha256,size FROM documents').all();snapshot.close();
  for(const f of entries){const source=join(dataDir,'files',f.id);const bytes=await readFile(source);if(createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Integridade do anexo não confirmada: '+f.id);await copyFile(source,join(target,'files',f.id));}
  const databaseHash=createHash('sha256').update(await readFile(join(target,'portal.sqlite'))).digest('hex');
  await writeFile(join(target,'manifest.json'),JSON.stringify({version:1,created:new Date().toISOString(),databaseHash,documents:entries},null,2),{mode:0o600});
  await writeFile(join(target,'COMPLETO.txt'),'Backup concluído. Banco e anexos conferidos.\n',{mode:0o600});return target;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const dir=await makeBackup(resolve(process.env.DATA_DIR||'data'),resolve(process.env.BACKUP_DIR||'backups'));console.log('Backup concluído: '+dir);}
