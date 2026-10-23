import { REFERENCE_TEAM } from '@gacha/shared';
import { buildApp, type BuildOptions } from './app';
import type { AppConfig } from './config';

/**
 * Builds the app for tests, with new players starting on the reference team
 * so tests can battle without summoning first. (By default they start with no heroes.)
 */
export async function buildTestApp(config: AppConfig, options: BuildOptions = {}) {
  const app = await buildApp(config, options);
  const { content } = app.services;
  content.saveSettings({ ...content.bundle().settings, starterCharacters: REFERENCE_TEAM });
  return app;
}
