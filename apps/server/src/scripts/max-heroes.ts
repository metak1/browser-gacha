/**
 * Dev command: max out every hero a player owns — level, ascension, skill and
 * ultimate levels, and constellation C6. Nothing is ever lowered.
 *
 *   npm run max-heroes                              # the most recently active player
 *   npm run max-heroes -- <username|id>             # a specific player
 *   npm run max-heroes -- <who> --no-constellation  # leave constellations as they are
 *
 * Only heroes already owned are touched; run grant-all first to own everyone.
 * Writes straight to the database, so it works while the server is running.
 */
import { MAX_CONSTELLATION, maxAscension, maxSkillLevel } from '@gacha/shared';
import { findPlayer, playerName, run } from './cli';

run((ctx) => {
  const argv = process.argv.slice(2);
  const keepConstellation = argv.includes('--no-constellation');
  const who = argv.find((a) => !a.startsWith('--'));
  const user = findPlayer(ctx, who);

  const { maxLevel, progression } = ctx.content.current.settings;
  const rank = maxAscension(progression);
  const skill = maxSkillLevel(progression);
  const copies = MAX_CONSTELLATION + 1;
  const known = ctx.content.current.charactersById;
  const owned = ctx.roster.list(user.id).filter((c) => known[c.id]);

  ctx.db.transaction(() => {
    for (const c of owned) {
      ctx.roster.setLevel(user.id, c.id, Math.max(c.level, maxLevel));
      ctx.roster.setAscension(user.id, c.id, Math.max(c.ascension, rank));
      ctx.roster.setSkillLevel(user.id, c.id, 'skill', Math.max(c.skillLevel, skill));
      ctx.roster.setSkillLevel(user.id, c.id, 'ultimate', Math.max(c.ultLevel, skill));
      if (!keepConstellation) ctx.roster.setCopies(user.id, c.id, Math.max(c.copies, copies));
    }
  });

  console.log(
    `Maxed ${owned.length} hero(es) for ${playerName(user)}: level ${maxLevel}, ascension ${rank}, skills ${skill}` +
      (keepConstellation ? '.' : `, C${MAX_CONSTELLATION}.`),
  );
  console.log('Reload the game to see them.');
});
