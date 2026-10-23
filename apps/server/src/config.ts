import { fileURLToPath } from 'node:url';

export interface AppConfig {
  dbPath: string;
  /** Mark the session cookie Secure. Enable when serving over HTTPS. */
  cookieSecure: boolean;
  /** Built client to serve, if present. */
  clientDist: string | null;
  logger: boolean;
  rateLimit: boolean;
}

const resolve = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export function loadConfig(env = process.env) {
  const config: AppConfig = {
    dbPath: env.DB_PATH ?? resolve('../data/game.db'),
    cookieSecure: env.COOKIE_SECURE === 'true',
    clientDist: env.CLIENT_DIST ?? resolve('../../client/dist'),
    logger: env.LOG !== 'false',
    rateLimit: true,
  };
  return { ...config, port: Number(env.PORT ?? 3000), host: env.HOST ?? '0.0.0.0' };
}
