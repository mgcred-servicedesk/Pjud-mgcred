import { extname } from 'node:path';
import { upload } from '@mgcred/shared';
import { fail } from './errors.ts';
import { text } from './validate.ts';

const mimeTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function validateFileName(raw: unknown) {
  const name = text(raw, 'Nome do arquivo', 180);
  if (/[\\/\r\n]/.test(name)) fail(400, 'Nome de arquivo inválido.');
  const extension = extname(name).toLowerCase();
  if (!(upload.extensions as readonly string[]).includes(extension)) fail(400, 'Formato permitido: PDF, DOCX, XLSX, TXT, CSV, PNG ou JPG.');
  return { name, extension, mimeType: mimeTypes[extension]! };
}

export function validateFileContent(extension: string, bytes: Buffer) {
  if (!bytes.length || bytes.length > upload.maxBytes) fail(400, 'Arquivo vazio ou maior que 5 MB.');
  const header = bytes.subarray(0, 8).toString('hex');
  const mismatch =
    (extension === '.pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) ||
    (['.docx', '.xlsx'].includes(extension) && !header.startsWith('504b0304')) ||
    (extension === '.png' && !header.startsWith('89504e470d0a1a0a')) ||
    (['.jpg', '.jpeg'].includes(extension) && !header.startsWith('ffd8ff')) ||
    (['.txt', '.csv'].includes(extension) && bytes.includes(0));
  if (mismatch) fail(400, 'Conteúdo incompatível com a extensão.');
}

export function contentDisposition(name: string) {
  const ascii = `documento${extname(name).replace(/[^.a-zA-Z0-9]/g, '')}`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, '%27')}`;
}
