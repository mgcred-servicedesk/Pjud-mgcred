import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fail } from './errors.ts';
import { password } from './validate.ts';

const derive = promisify(scrypt) as (pw: string, salt: string, len: number, opts: object) => Promise<Buffer>;

export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

let working = 0;
async function hashWork(pw: string, salt: string) {
  if (working >= 2) fail(429, 'Autenticação ocupada. Tente novamente em instantes.');
  working++;
  try { return await derive(pw, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }); }
  finally { working--; }
}

export async function hashPassword(pw: string) {
  password(pw);
  const salt = randomBytes(16).toString('hex');
  return `scrypt1:${salt}:${(await hashWork(pw, salt)).toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string | null | undefined) {
  const [kind, salt, expected] = (stored ?? '').split(':');
  if (kind !== 'scrypt1' || !salt || !/^[0-9a-f]{128}$/.test(expected ?? '')) {
    await hashWork(pw, 'unregistered-user');
    return false;
  }
  const actual = await hashWork(pw, salt);
  return timingSafeEqual(actual, Buffer.from(expected!, 'hex'));
}
