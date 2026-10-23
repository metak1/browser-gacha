/**
 * Dev command: give a player the admin role (unlocks the Admin panel).
 *
 *   npm run make-admin                    # the most recently active player
 *   npm run make-admin -- <username|id>   # a specific player
 *   npm run make-admin -- <who> --revoke  # back to a normal player
 *
 * Reload the game afterwards; an "Admin" tab appears in the navigation.
 */
import { findPlayer, playerName, run } from './cli';

run((ctx) => {
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const who = args.find((a) => !a.startsWith('--'));
  const user = findPlayer(ctx, who);
  ctx.users.setRole(user.id, revoke ? 'player' : 'admin');
  console.log(revoke ? `${playerName(user)} is no longer an admin.` : `${playerName(user)} is now an admin.`);
  console.log('Reload the game to see the change.');
});
