export const dateStr = (s: string | null | undefined) => (s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('pt-BR') : '—');
export const datetime = (s: string) => new Date(s).toLocaleString('pt-BR');
export const money = (value: string | number) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const today = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
export const daysLeft = (d: string) => Math.round((new Date(d + 'T12:00:00').getTime() - new Date(today() + 'T12:00:00').getTime()) / 86_400_000);
export const kb = (bytes: number) => `${Math.ceil(bytes / 1024)} KB`;
export const actionLabel = (action: string) => action.replaceAll('.', ' ');
export const initials = (name: string) => name.split(' ').filter(Boolean).map(s => s[0]).slice(0, 2).join('');
