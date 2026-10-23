/**
 * Dev command: set a new password for a linked account.
 *
 *   npm run reset-password -- <username|id> <new password>
 *
 * Existing sessions stay signed in; the new password works for the next login.
 */
import { hashPassword, verifyPassword } from '../services/password';
import { findPlayer, openContext, playerName } from './cli';

async function main() {
  const [who, password] = process.argv.slice(2);
  if (!who || !password) throw new Error('Usage: npm run reset-password -- <username|id> <new password>');
  if (password.length < 8) throw new Error('Passwords need at least 8 characters.');
  const ctx = openContext();
  try {
    const user = findPlayer(ctx, who);
    if (!user.username) throw new Error(`${playerName(user)} is a guest account with no login to reset.`);
    const hash = await hashPassword(password);
    ctx.users.setCredentials(user.id, user.username, hash);
    const saved = ctx.users.findById(user.id)?.passwordHash;
    if (!saved || !(await verifyPassword(password, saved))) throw new Error('The new password did not save correctly.');
    console.log(`Password updated for ${user.username}.`);
  } finally {
    ctx.db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
