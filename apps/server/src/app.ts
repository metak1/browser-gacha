import { existsSync } from 'node:fs';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { AppConfig } from './config';
import { Database } from './db/database';
import { HttpError } from './errors';
import { adminRoutes } from './http/admin';
import { apiRoutes } from './http/routes';
import { registerSessionHook } from './http/session';
import { createServices, type Services } from './services';
import type { ContextOverrides } from './services/context';

declare module 'fastify' {
  interface FastifyInstance {
    services: Services;
  }
}

export interface BuildOptions {
  /** Test hooks for a deterministic clock and RNG. */
  overrides?: ContextOverrides;
}

export async function buildApp(config: AppConfig, options: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.logger ? { level: 'info' } : false });

  const db = new Database(config.dbPath);
  app.addHook('onClose', async () => db.close());
  app.decorate('services', createServices(db, options.overrides));

  await app.register(cookie);
  if (config.rateLimit) await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
  registerSessionHook(app);

  app.setErrorHandler((err: FastifyError, request, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.code, message: err.message });
    }
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
      return reply.status(400).send({ error: 'invalid_request', message });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: err.code ?? 'request_error', message: err.message });
    }
    request.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Something went wrong' });
  });

  await app.register(apiRoutes, { prefix: '/api', config });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  // In production the server also hosts the built client as a single-page app.
  const serveClient = Boolean(config.clientDist && existsSync(config.clientDist));
  if (serveClient) await app.register(fastifyStatic, { root: config.clientDist! });

  app.setNotFoundHandler((request, reply) => {
    if (serveClient && request.method === 'GET' && !request.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({ error: 'not_found', message: `No route for ${request.method} ${request.url}` });
  });

  return app;
}
