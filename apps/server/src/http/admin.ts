import type { AdminPlayerDTO, ContentBundle, SimulateResponse } from '@gacha/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, HttpError } from '../errors';
import { isContentKind } from '../services/content';
import { requireUser } from './session';

const kindParams = z.object({ kind: z.string(), id: z.string().max(40) });
const playerParams = z.object({ playerId: z.string().max(64) });
const playersQuery = z.object({ q: z.string().max(64).default('') });
const grantBody = z.object({
  gems: z.number().int().min(-10_000_000).max(10_000_000).optional(),
  gold: z.number().int().min(-10_000_000).max(10_000_000).optional(),
  stardust: z.number().int().min(-10_000_000).max(10_000_000).optional(),
  allCharacters: z.boolean().optional(),
  level: z.number().int().min(1).max(999).optional(),
  materialsEach: z.number().int().min(1).max(100_000).optional(),
});
const roleBody = z.object({ role: z.enum(['player', 'admin']) });
const simulateBody = z.object({
  stageId: z.string().max(40),
  team: z.array(z.string().max(40)).min(1).max(6),
  level: z.number().int().min(1).max(999),
  runs: z.number().int().min(1).max(500),
});

/**
 * Admin API: content editing, player tools and balance simulation.
 * Every route requires a signed-in user with the admin role.
 * Content writes return the full updated bundle so the editor can refresh in one step.
 */
export async function adminRoutes(app: FastifyInstance) {
  const { content, admin } = app.services;

  app.addHook('preHandler', async (request) => {
    const userId = requireUser(request);
    if (!admin.isAdmin(userId)) throw new HttpError(403, 'forbidden', 'Admins only');
  });

  const contentKind = (kind: string) => {
    if (!isContentKind(kind)) throw badRequest('unknown_kind', `Unknown content type "${kind}"`);
    return kind;
  };

  // ---------- content ----------

  app.put('/content/settings', async (request): Promise<ContentBundle> => content.saveSettings(request.body));

  app.put('/content/:kind/:id', async (request): Promise<ContentBundle> => {
    const { kind, id } = kindParams.parse(request.params);
    const body = request.body as { id?: unknown } | null;
    if (!body || String(body.id) !== id) throw badRequest('id_mismatch', 'The document id must match the URL');
    return content.save(contentKind(kind), body);
  });

  app.delete('/content/:kind/:id', async (request): Promise<ContentBundle> => {
    const { kind, id } = kindParams.parse(request.params);
    return content.remove(contentKind(kind), id);
  });

  app.post('/content/import', { bodyLimit: 5 * 1024 * 1024 }, async (request): Promise<ContentBundle> => {
    const body = request.body as Record<string, unknown> | null;
    // Imports may come from an export with a stale version; the server assigns the next one.
    return content.replaceAll({ ...body, version: content.bundle().version });
  });

  app.post('/content/reset', async (): Promise<ContentBundle> => content.reset());

  // ---------- players ----------

  app.get('/players', async (request): Promise<AdminPlayerDTO[]> => admin.players(playersQuery.parse(request.query).q));

  app.post('/players/:playerId/grant', async (request): Promise<AdminPlayerDTO> =>
    admin.grant(playerParams.parse(request.params).playerId, grantBody.parse(request.body)),
  );

  app.put('/players/:playerId/role', async (request): Promise<AdminPlayerDTO> => {
    const { playerId } = playerParams.parse(request.params);
    const { role } = roleBody.parse(request.body);
    if (playerId === request.userId && role !== 'admin') {
      throw badRequest('self_demote', "You can't remove your own admin role");
    }
    return admin.setRole(playerId, role);
  });

  // ---------- tools ----------

  app.post('/simulate', async (request): Promise<SimulateResponse> => admin.simulate(simulateBody.parse(request.body)));
}
