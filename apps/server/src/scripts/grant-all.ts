/**
 * Dev command: give a player every character.
 *
 *   npm run grant-all                     # the most recently active player
 *   npm run grant-all -- <username|id>    # a specific player
 *   npm run grant-all -- <who> --level 40 # also raise everyone to a level
 *
 * Writes straight to the database, so it works while the server is running.
 * Reload the game afterwards to see the new roster. (Admins can do the same
 * from the Players tab of the admin panel.)
 */
import { findPlayer, playerName, run } from './cli';

run((ctx) => {
  const { maxLevel } = ctx.content.current.settings;
  const characters = ctx.content.current.bundle.characters;
  let who: string | undefined;
  let level: number | undefined;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--level') {
      level = Number(argv[++i]);
      if (!Number.isInteger(level) || level < 1 || level > maxLevel) {
        throw new Error(`--level must be a whole number from 1 to ${maxLevel}`);
      }
    } else if (!who) who = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }

  const user = findPlayer(ctx, who);
  let added = 0;
  ctx.db.transaction(() => {
    for (const c of characters) {
      if (!ctx.roster.get(user.id, c.id)) {
        ctx.roster.addCopy(user.id, c.id, Date.now());
        added++;
      }
      if (level) ctx.roster.setLevel(user.id, c.id, level);
    }
  });

  console.log(`Gave ${added} new character(s) to ${playerName(user)}; they now own all ${characters.length}.`);
  if (level) console.log(`Set every character to level ${level}.`);
  console.log('Reload the game to see them.');
});
