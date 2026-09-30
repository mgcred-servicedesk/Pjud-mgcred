// Ambiente descartável de homologação visual. Não usado no servidor de produção.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPortal } from '../server.mjs';
import { createUser } from '../lib/database.mjs';
import { hashPassword } from '../lib/security.mjs';
const dir=await mkdtemp(join(tmpdir(),'mgcred-ui-test-'));
const app=await createPortal({dataDir:dir,origin:'http://127.0.0.1:4320',production:false});
createUser(app.db,{email:'qa@example.test',name:'Administrador de teste',role:'admin',department:'Jurídico',password:await hashPassword('Teste-local-descartavel-2026!')});
app.server.listen(4320,'127.0.0.1',()=>console.log('QA local http://127.0.0.1:4320 · qa@example.test · senha de teste definida no fixture'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
