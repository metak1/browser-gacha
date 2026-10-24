/**
 * Browser smoke test: starts the server on a throwaway database, then drives a real browser
 * through the main flows (roster, gear bag, a dungeon fight, the loot screen, auto-equip) at
 * desktop and phone sizes. Fails on any broken step or page error.
 *
 * Usage: npm run e2e (builds the client first). Uses the installed Edge; set E2E_CHANNEL=chrome
 * (or another Playwright channel) to use something else, E2E_HEADED=1 to watch it, and
 * E2E_SHOTS=<folder> to save a screenshot of each phone page.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium, type Page } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'gacha-e2e-'));
const dbPath = join(dir, 'game.db');

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.listen(0, () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => ok(port));
    });
    s.on('error', fail);
  });
}

function startServer(port: number): ChildProcess {
  // node --import tsx (not npx), so killing the child stops the server itself.
  return spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: join(ROOT, 'apps/server'),
    env: { ...process.env, DB_PATH: dbPath, PORT: String(port), HOST: '127.0.0.1', LOG: 'false', CLIENT_DIST: join(ROOT, 'apps/client/dist') },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

async function waitFor(url: string) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server didn't start: ${url}`);
}

const results: { name: string; ok: boolean; detail: string }[] = [];
async function step(name: string, run: () => Promise<string | void>) {
  try {
    const detail = (await run()) ?? '';
    results.push({ name, ok: true, detail });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    results.push({ name, ok: false, detail: String(err) });
    const lines = String(err).split('\n');
    console.log(`  ✗ ${name} — ${lines[0]}`);
    // Playwright's call log says what blocked an action (covered, disabled, moving...); E2E_VERBOSE prints all of it.
    const log = process.env.E2E_VERBOSE ? lines.slice(1) : lines.filter((x) => /intercepts|not stable|not enabled|not visible|detached/.test(x)).slice(-3);
    for (const l of log) console.log(`      ${l.trim()}`);
  }
}
function expect(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = startServer(port);
let exitCode = 1;
try {
  await waitFor(`${base}/api/content`);
  console.log(`server on ${base}, db ${dbPath}`);

  // A guest with a summoned team, the early campaign cleared and level 30 heroes.
  const signup = await fetch(`${base}/api/auth/guest`, { method: 'POST' });
  const sid = signup.headers.get('set-cookie')!.match(/sid=([^;]+)/)![1]!;
  const me = (await signup.json()) as { user: { id: string } };
  const api = async <T>(method: string, url: string, body?: object) => {
    const res = await fetch(`${base}/api${url}`, {
      method,
      headers: { cookie: `sid=${sid}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await res.json()) as T;
  };
  const content = await api<{ bundle?: { banners: { id: string; active: boolean }[] }; banners?: { id: string; active: boolean }[] }>('GET', '/content');
  const banners = (content.bundle ?? content).banners!;
  await api('POST', '/me/flags', { flag: 'guide-done' });
  const pulled = await api<{ results: { id: string }[] }>('POST', '/gacha/summon', { bannerId: banners.find((b) => b.active)!.id, count: 10 });
  await api('PUT', '/team', { team: [...new Set(pulled.results.map((r) => r.id))].slice(0, 4) });
  const db = new DatabaseSync(dbPath);
  for (const s of ['1-1', '1-2', '1-3', '1-4', '2-1']) {
    db.prepare('INSERT OR IGNORE INTO stage_clears (user_id, stage_id, clears, first_cleared_at, stars) VALUES (?, ?, 1, 0, 3)').run(me.user.id, s);
  }
  db.prepare('UPDATE characters SET level = 30 WHERE user_id = ?').run(me.user.id);
  db.close();

  const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: !process.env.E2E_HEADED });
  const errors: string[] = [];
  const open = async (width: number, height: number) => {
    const ctx = await browser.newContext({ viewport: { width, height } });
    await ctx.addCookies([{ name: 'sid', value: sid, url: base }]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    return page;
  };
  const noSideScroll = async (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  console.log('desktop');
  const page = await open(1400, 1000);
  await step('home loads', async () => {
    await page.goto(base + '/');
    await page.waitForSelector('nav, .nav', { timeout: 15000 });
  });
  await step('roster lists the team', async () => {
    await page.goto(base + '/roster');
    await page.waitForSelector('.page-head');
    await page.waitForTimeout(500);
    const cards = await page.locator('.roster-body .card').count();
    expect(cards > 0, 'no hero cards');
    return `${cards} cards`;
  });
  await step('auto-equip from the hero sheet', async () => {
    const button = page.locator('.gear-head button', { hasText: 'Auto-equip' });
    await button.waitFor({ timeout: 5000 });
    return (await button.innerText()).replace(/\s+/g, ' ');
  });
  await step('gear bag has filters', async () => {
    await page.locator('.page-head .chip', { hasText: 'Gear' }).first().click();
    await page.waitForSelector('.gear-filters', { timeout: 5000 });
    expect((await page.locator('.gear-filters select').count()) === 4, 'expected 4 filter selects');
  });
  await step('dungeons page shows both tabs', async () => {
    await page.goto(base + '/dungeons');
    await page.waitForSelector('.dungeon-grid');
    const gear = await page.locator('section.dungeon h2').allInnerTexts();
    expect(gear.includes('The Armory'), `gear tab: ${gear.join(', ')}`);
    await page.locator('.filters .chip', { hasText: 'Essence' }).click();
    await page.waitForTimeout(300);
    const essence = await page.locator('section.dungeon').count();
    expect(essence > 0, 'no essence dungeons');
    return `${gear.length} gear, ${essence} essence`;
  });
  await step('win an Armory run and get loot', async () => {
    await page.goto(base + '/dungeons');
    await page.waitForSelector('.dungeon-grid');
    await page.locator('section.dungeon', { hasText: 'The Armory' }).locator('.tier').first().locator('button', { hasText: 'Enter' }).click();
    await page.waitForSelector('.icon-btn', { timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.locator('.icon-btn', { hasText: 'AUTO' }).click();
    for (let i = 0; i < 2; i++) await page.locator('.icon-btn', { hasText: /×/ }).first().click();
    await page.waitForSelector('.modal-actions', { timeout: 180000 });
    await page.waitForTimeout(1500);
    const title = await page.locator('.modal.result h2').innerText();
    expect(title === 'Victory!', `result: ${title}`);
    const loot = await page.locator('.modal.result .loot-gear .gear-chip').count();
    expect(loot > 0, 'no loot');
    return `${loot} items`;
  });
  await step('inspect, compare and sell a drop', async () => {
    const modal = page.locator('.modal.result');
    await modal.locator('.loot-gear .gear-chip').first().click();
    await modal.locator('.loot-compare').waitFor({ timeout: 5000 });
    const before = (await api<{ wallet: { gold: number } }>('GET', '/me')).wallet.gold;
    // The panel animates in; wait until Sell is enabled before clicking it.
    const sell = modal.locator('.loot-inspect button', { hasText: 'Sell' });
    await sell.waitFor({ state: 'visible' });
    await page.waitForFunction((el) => el && !(el as HTMLButtonElement).disabled, await sell.elementHandle());
    await sell.click();
    await modal.locator('.loot-gear .sold').waitFor({ timeout: 5000 });
    const after = (await api<{ wallet: { gold: number } }>('GET', '/me')).wallet.gold;
    expect(after > before, `gold ${before} → ${after}`);
    return `gold ${before} → ${after}`;
  });

  console.log('phone');
  const phone = await open(390, 860);
  for (const [path, ready] of [
    ['/dungeons', '.dungeon-grid'],
    ['/roster', '.page-head'],
    ['/campaign', 'main'],
  ] as const) {
    await step(`${path} fits the screen`, async () => {
      await phone.goto(base + path);
      await phone.waitForSelector(ready, { timeout: 15000 });
      await phone.waitForTimeout(500);
      expect(await noSideScroll(phone), 'page scrolls sideways');
      if (process.env.E2E_SHOTS) await phone.screenshot({ path: join(process.env.E2E_SHOTS, `phone${path.replaceAll('/', '-')}.png`) });
    });
  }

  await step('no page errors', async () => {
    expect(!errors.length, errors.join('\n'));
  });
  await browser.close();
  exitCode = results.every((r) => r.ok) ? 0 : 1;
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} steps passed`);
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true });
}
process.exit(exitCode);
