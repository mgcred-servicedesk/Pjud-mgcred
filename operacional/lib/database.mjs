import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export const ORG = 'mgcred';
export const iso = () => new Date().toISOString();
export function openDatabase(dir) {
  mkdirSync(dir,{recursive:true,mode:0o700}); mkdirSync(join(dir,'files'),{recursive:true,mode:0o700});
  const db = new DatabaseSync(join(dir,'portal.sqlite'));
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL);
  INSERT INTO schema_version SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM schema_version);
  CREATE TABLE IF NOT EXISTS organizations(id TEXT PRIMARY KEY,name TEXT NOT NULL);
  INSERT OR IGNORE INTO organizations VALUES('mgcred','MG Cred');
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,org TEXT NOT NULL REFERENCES organizations(id),email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,department TEXT NOT NULL DEFAULT '',role TEXT NOT NULL CHECK(role IN('admin','client')),password TEXT,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL,last_seen INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS invitations(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS rates(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sequences(year INTEGER PRIMARY KEY,value INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,org TEXT NOT NULL REFERENCES organizations(id),subject TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,priority TEXT NOT NULL,status TEXT NOT NULL,creator TEXT NOT NULL REFERENCES users(id),owner TEXT REFERENCES users(id),department TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
  CREATE INDEX IF NOT EXISTS req_creator ON requests(org,creator);
  CREATE TABLE IF NOT EXISTS request_access(request_id TEXT NOT NULL REFERENCES requests(id),user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(request_id,user_id));
  CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES requests(id),user_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES requests(id),name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,uploaded_by TEXT NOT NULL REFERENCES users(id),created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY,org TEXT NOT NULL REFERENCES organizations(id),number TEXT NOT NULL,title TEXT NOT NULL,party TEXT NOT NULL DEFAULT '',opponent TEXT NOT NULL DEFAULT '',court TEXT NOT NULL DEFAULT '',division TEXT NOT NULL DEFAULT '',phase TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Ativo',risk TEXT NOT NULL DEFAULT 'Não avaliado',value_cents INTEGER NOT NULL DEFAULT 0,next_due TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',client_visible INTEGER NOT NULL DEFAULT 0 CHECK(client_visible IN(0,1)),created TEXT NOT NULL,updated TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,UNIQUE(org,number));
  CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,org TEXT NOT NULL REFERENCES organizations(id),title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',due TEXT NOT NULL,priority TEXT NOT NULL,assignee TEXT REFERENCES users(id),request_id TEXT REFERENCES requests(id),case_id TEXT REFERENCES cases(id),done INTEGER NOT NULL DEFAULT 0 CHECK(done IN(0,1)),created TEXT NOT NULL,updated TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,org TEXT NOT NULL,user_id TEXT,action TEXT NOT NULL,entity TEXT NOT NULL,entity_id TEXT NOT NULL,details TEXT NOT NULL,created TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS audit_entity ON audit(entity,entity_id,id);
  CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'audit is append only'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'audit is append only'); END;
  CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,org TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),count INTEGER NOT NULL,created TEXT NOT NULL);
  `);
  if (db.prepare('SELECT version FROM schema_version').get().version !== 1) throw Error('Versão de banco incompatível.');
  return db;
}
export function transaction(db, fn) { db.exec('BEGIN IMMEDIATE'); try { const result=fn();db.exec('COMMIT');return result; } catch(e){db.exec('ROLLBACK');throw e;} }
export function audit(db,user,action,entity,id,details={}) { db.prepare('INSERT INTO audit(org,user_id,action,entity,entity_id,details,created) VALUES(?,?,?,?,?,?,?)').run(ORG,user?.id||null,action,entity,id,JSON.stringify(details),iso()); }
export function publicUser(u) { return {id:u.id,name:u.name,email:u.email,department:u.department,role:u.role,active:!!u.active}; }
export function createUser(db,{email,name,department='',role='client',password=null}) {
  const id=randomUUID(); db.prepare('INSERT INTO users(id,org,email,name,department,role,password,created) VALUES(?,?,?,?,?,?,?,?)').run(id,ORG,email,name,department,role,password,iso()); return db.prepare('SELECT * FROM users WHERE id=?').get(id);
}
