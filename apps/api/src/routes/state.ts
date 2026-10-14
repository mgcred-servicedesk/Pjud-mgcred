import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';
import type { PortalState } from '@mgcred/shared';
import { departments, requestCategories } from '../db/schema.ts';
import { toMe } from '../services/actor.ts';
import { auditEvents, LIST_LIMIT, listCases, listRequests, listTasks, requestHistoryFilter } from '../services/queries.ts';
import { currentActor, type AppContext } from '../context.ts';

export async function stateRoutes(app: FastifyInstance, { db }: AppContext) {
  app.get('/state', async (req): Promise<PortalState> => {
    const actor = currentActor(req);
    const [requests, cases, tasks, activity, categories, depts] = await Promise.all([
      listRequests(db, actor),
      listCases(db, actor),
      listTasks(db, actor),
      auditEvents(db, requestHistoryFilter(actor), 20),
      db.select({ id: requestCategories.id, name: requestCategories.name, isGovernance: requestCategories.isGovernance })
        .from(requestCategories).where(eq(requestCategories.active, true)).orderBy(asc(requestCategories.sortOrder)),
      db.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.active, true)).orderBy(asc(departments.name)),
    ]);
    return {
      user: toMe(actor),
      requests: requests.slice(0, LIST_LIMIT),
      cases: cases.slice(0, LIST_LIMIT),
      tasks: tasks.slice(0, LIST_LIMIT),
      activity,
      truncated: [requests, cases, tasks].some(l => l.length > LIST_LIMIT),
      categories,
      departments: depts,
    };
  });
}
