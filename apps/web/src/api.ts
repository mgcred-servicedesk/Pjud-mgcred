export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let csrf = '';
let onUnauthorized: () => void = () => {};

export const setCsrf = (value: string) => { csrf = value; };
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T = { ok: true }>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !['/login', '/activate', '/me'].includes(path)) onUnauthorized();
    throw new ApiError(res.status, result.error || 'Falha de comunicação.');
  }
  return result as T;
}
