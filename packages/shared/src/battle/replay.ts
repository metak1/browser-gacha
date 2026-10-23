import { chooseAction } from './ai';
import { act, currentActor, startBattle, validateAction } from './engine';
import type { BattleAction, BattleSetup, BattleState, Outcome } from './types';

export interface ReplayResult {
  outcome: Outcome;
  state: BattleState;
  /** Set when the action log is not a legal playthrough. */
  error?: string;
}

/**
 * Re-runs a battle from its setup using the player's recorded actions, with
 * enemy turns chosen by the AI. This is how the server verifies a result.
 */
export function replayBattle(setup: BattleSetup, actions: BattleAction[]): ReplayResult {
  const { state } = startBattle(setup);
  let i = 0;
  while (state.outcome === 'ongoing') {
    const actor = currentActor(state)!;
    if (actor.side === 'enemy') {
      act(state, chooseAction(state));
      continue;
    }
    const action = actions[i];
    if (!action) break;
    const error = validateAction(state, action);
    if (error) return { outcome: state.outcome, state, error: `Action ${i + 1}: ${error}` };
    act(state, action);
    i++;
  }
  if (i < actions.length) return { outcome: state.outcome, state, error: 'Actions continue after the battle ended' };
  return { outcome: state.outcome, state };
}

/** Plays a whole battle with the AI on both sides. Returns the ally actions it took. */
export function autoBattle(setup: BattleSetup): { state: BattleState; actions: BattleAction[] } {
  const { state } = startBattle(setup);
  const actions: BattleAction[] = [];
  while (state.outcome === 'ongoing') {
    const actor = currentActor(state)!;
    const action = chooseAction(state);
    if (actor.side === 'ally') actions.push(action);
    act(state, action);
  }
  return { state, actions };
}
