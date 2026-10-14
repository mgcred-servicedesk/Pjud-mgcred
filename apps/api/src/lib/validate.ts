import { fail } from './errors.ts';

const control = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function text(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || control.test(value)) fail(400, `${label}: valor inválido.`);
  return value.trim();
}

export function optionalText(value: unknown, label: string, max = 200): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max || control.test(value)) fail(400, `${label}: valor inválido.`);
  return value.trim() || null;
}

export function email(value: unknown): string {
  const v = text(value, 'E-mail', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(400, 'E-mail inválido.');
  return v;
}

export function choice<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) fail(400, `${label}: opção inválida.`);
  return value as T;
}

export function date(value: unknown, optional: true): string | null;
export function date(value: unknown, optional: false): string;
export function date(value: unknown, optional: boolean): string | null {
  if ((value === undefined || value === null || value === '') && optional) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(400, 'Data inválida.');
  return value;
}

export function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 14 || value.length > 128 || value.trim().length < 14) fail(400, 'Use uma senha ou frase-senha de 14 a 128 caracteres.');
  return value;
}

export function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) fail(400, `${label}: identificador inválido.`);
  return value;
}

export function optionalUuid(value: unknown, label: string): string | null {
  return value === undefined || value === null || value === '' ? null : uuid(value, label);
}

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(400, `${label}: valor inválido.`);
  return value;
}

export function version(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1) fail(409, 'Este registro foi alterado. Atualize a página e tente novamente.');
  return value as number;
}

export function body(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'JSON inválido.');
  return value as Record<string, unknown>;
}
