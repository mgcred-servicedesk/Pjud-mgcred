import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const token = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export function text(value, label, max = 200, optional = false) {
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(400, `${label}: valor inválido.`);
  return value.trim();
}
export function email(value) {
  const v = text(value, 'E-mail', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(400, 'E-mail inválido.');
  return v;
}
export function choice(value, options, label) { if (!options.includes(value)) fail(400, `${label}: opção inválida.`); return value; }
export function date(value, optional = true) {
  if (!value && optional) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) fail(400,'Data inválida.');
  return value;
}
export function password(value) {
  if (typeof value !== 'string' || value.length < 14 || value.length > 128 || value.trim().length < 14) fail(400, 'Use uma senha ou frase-senha de 14 a 128 caracteres.');
  return value;
}
let working = 0;
async function hashWork(pw, salt) {
  if (working >= 2) fail(429, 'Autenticação ocupada. Tente novamente em instantes.');
  working++;
  try { return await derive(pw, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }); }
  finally { working--; }
}
export async function hashPassword(pw) {
  password(pw); const salt = randomBytes(16).toString('hex');
  return `scrypt1:${salt}:${(await hashWork(pw, salt)).toString('hex')}`;
}
export async function verifyPassword(pw, stored) {
  const [kind, salt, expected] = (stored || '').split(':');
  if (kind !== 'scrypt1' || !/^[0-9a-f]{128}$/.test(expected || '')) { await hashWork(pw, 'unregistered-user'); return false; }
  const actual = await hashWork(pw, salt);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
export const categories = ['Contratos','Trabalhista','Consumidor','Cível','Societário','Compliance','LGPD','Notificação','Parecer','Consultivo','Processo judicial','Outros'];
export const statuses = ['Nova','Em análise','Aguardando Jurídico','Aguardando MG Cred','Em andamento','Concluída','Arquivada'];
export const priorities = ['Normal','Alta','Urgente'];
