import type { FastifyInstance } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { priorities } from '@mgcred/shared';
import { tasks } from '../db/schema.ts';
import { fail } from '../lib/errors.ts';
import { body, bool, choice, date, isUuid, optionalText, optionalUuid, text, version } from '../lib/validate.ts';
import { activeActor, requirePermission } from '../services/actor.ts';
import { audit } from '../services/audit.ts';
import { canSeeTask } from '../services/visibility.ts';
import { currentActor, type AppContext } from '../context.ts';
import { visibleRequest } from './requests.ts';
import { visibleCase } from './cases.ts';

export async function taskRoutes(app: FastifyInstance, { db }: AppContext) {
  app.post('/tasks', async (req, reply) => {
    const actor = currentActor(req);
    requirePermission(actor, 'tasks.manage');
    const b = body(req.body);
    const title = text(b.title, 'Título', 200);
    const description = optionalText(b.description, 'Descrição', 3000);
    const dueDate = date(b.dueDate, false);
    const priority = choice(b.priority, priorities, 'Prioridade');
    const assigneeId = optionalUuid(b.assigneeId, 'Responsável');
    const requestId = optionalUuid(b.requestId, 'Solicitação');
    const caseId = optionalUuid(b.caseId, 'Processo');
    const assignee = assigneeId ? await activeActor(db, assigneeId) : null;
    for (const who of assignee ? [actor, assignee] : [actor]) {
      if (requestId) await visibleRequest(db, who, requestId);
      if (caseId) await visibleCase(db, who, caseId);
    }
    const id = await db.transaction(async tx => {
      const [t] = await tx.insert(tasks).values({ title, description, dueDate, priority, assigneeId, requestId, caseId, createdBy: actor.id }).returning({ id: tasks.id });
      await audit(tx, actor.id, 'tarefa.criada', 'task', t!.id);
      return t!.id;
    });
    return reply.status(201).send({ id });
  });

  app.patch('/tasks/:id', async req => {
    const actor = currentActor(req);
    const id = (req.params as { id: string }).id;
    if (!isUuid(id)) fail(404, 'Tarefa não encontrada.');
    const [t] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, id), canSeeTask(actor)));
    if (!t) fail(404, 'Tarefa não encontrada.');
    const b = body(req.body);
    const v = version(b.version);
    const done = bool(b.done, 'Situação');
    await db.transaction(async tx => {
      const [updated] = await tx.update(tasks)
        .set({ status: done ? 'concluida' : 'pendente', completedAt: done ? sql`now()` : null, updatedAt: sql`now()`, version: sql`${tasks.version} + 1` })
        .where(and(eq(tasks.id, t.id), eq(tasks.version, v))).returning({ id: tasks.id });
      if (!updated) fail(409, 'Este registro foi alterado. Atualize a página e tente novamente.');
      await audit(tx, actor.id, done ? 'tarefa.concluída' : 'tarefa.reaberta', 'task', t.id);
    });
    return { ok: true };
  });
}
