export interface Config {
  production: boolean;
  origin: string;
  databaseUrl: string;
  clientIpHeader: string | null;
  maxStorageBytes: number;
  webDist: string | null;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const production = overrides.production ?? process.env.NODE_ENV === 'production';
  const origin = overrides.origin ?? process.env.APP_ORIGIN ?? (production ? '' : 'http://127.0.0.1:4320');
  let valid = false;
  try { valid = new URL(origin).origin === origin; } catch { /* inválida */ }
  if (!valid || (production && !origin.startsWith('https://'))) throw new Error('APP_ORIGIN deve conter a origem exata; HTTPS é obrigatório em produção.');
  const databaseUrl = overrides.databaseUrl ?? process.env.DATABASE_URL ?? '';
  if (!databaseUrl) throw new Error('DATABASE_URL não configurada.');
  return {
    production,
    origin,
    databaseUrl,
    clientIpHeader: (overrides.clientIpHeader !== undefined ? overrides.clientIpHeader : process.env.CLIENT_IP_HEADER || null)?.toLowerCase() ?? null,
    maxStorageBytes: overrides.maxStorageBytes ?? Number(process.env.MAX_STORAGE_BYTES || 2 * 1024 ** 3),
    webDist: overrides.webDist !== undefined ? overrides.webDist : process.env.WEB_DIST || null,
  };
}
