import { eq } from 'drizzle-orm';
import type { Executor } from '../db/client.ts';
import { documentContents } from '../db/schema.ts';

// Armazenamento do conteúdo dos anexos. No MVP fica no PostgreSQL;
// trocar por S3 exige apenas outra implementação desta interface.
export interface Storage {
  put(exec: Executor, key: string, bytes: Buffer): Promise<void>;
  get(exec: Executor, key: string): Promise<Buffer | null>;
}

export const postgresStorage: Storage = {
  async put(exec, key, bytes) {
    await exec.insert(documentContents).values({ storageKey: key, content: bytes });
  },
  async get(exec, key) {
    const [row] = await exec.select({ content: documentContents.content }).from(documentContents).where(eq(documentContents.storageKey, key));
    return row?.content ?? null;
  },
};
