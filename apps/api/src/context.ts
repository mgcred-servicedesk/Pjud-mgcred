import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.ts';
import type { Db } from './db/client.ts';
import type { Actor } from './services/actor.ts';
import type { Storage } from './services/storage.ts';

export interface AppContext {
  db: Db;
  config: Config;
  storage: Storage;
  cookieName: string;
}

export interface Session { tokenHash: string; csrf: string }

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null;
    session: Session | null;
  }
}

export function currentActor(req: FastifyRequest): Actor {
  if (!req.actor) throw new Error('Rota protegida sem sessão.');
  return req.actor;
}

export function clientIp(ctx: AppContext, req: FastifyRequest) {
  const header = ctx.config.clientIpHeader ? req.headers[ctx.config.clientIpHeader] : undefined;
  const value = Array.isArray(header) ? header[0] : header;
  return value?.split(',')[0]?.trim() || req.socket.remoteAddress || 'desconhecido';
}

export function sessionCookie(ctx: AppContext, reply: FastifyReply, value: string, maxAge: number) {
  reply.header('Set-Cookie', `${ctx.cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${ctx.config.production ? '; Secure' : ''}`);
}

export function readSessionCookie(ctx: AppContext, req: FastifyRequest) {
  const raw = (req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(ctx.cookieName + '='))?.slice(ctx.cookieName.length + 1);
  return raw && raw.length <= 100 ? raw : null;
}
