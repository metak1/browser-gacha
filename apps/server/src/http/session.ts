import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../errors';
import { SESSION_TTL_MS } from '../services/auth';

export const SESSION_COOKIE = 'sid';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null;
  }
}

/** Resolves the session cookie on every request into request.userId. */
export function registerSessionHook(app: FastifyInstance) {
  app.decorateRequest('userId', null);
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    request.userId = token ? app.services.auth.resolveSession(token) : null;
  });
}

export function requireUser(request: FastifyRequest): string {
  if (!request.userId) throw unauthorized();
  return request.userId;
}

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
