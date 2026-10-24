import {
  act,
  chooseAction,
  currentActor,
  getUnit,
  livingUnits,
  opposite,
  skillFor,
  SPRITES,
  startBattle,
  STATUS_INFO,
  validateAction,
  type BattleAction,
  type BattleEvent,
  type BattleSetup,
  type BattleState,
  type ElementId,
  type Side,
  type SpriteClip,
} from '@gacha/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx } from '../audio/sfx';
import type { BattleSpeed } from '../state/settings';
import { applyEvent } from './display';
import { describeEvent, mechanicAlert, popupFor, type PopupKind } from './format';
import { formation, lungeOffset, stageAspect, type Slot } from './formation';
import type { SpellFx } from './SpellFx';

export type AnimName = 'enter' | 'lunge' | 'cast' | 'hit' | 'die' | 'victory';

export interface UnitAnim {
  name: AnimName;
  key: number;
  dx?: number;
  dy?: number;
  /** Sprite clip to play with this animation (attack variant, hurt, death...). */
  clip?: SpriteClip;
}

export type FxKind = ElementId | 'burn' | 'heal' | 'shield' | 'buff' | 'debuff';

export interface FxItem {
  id: number;
  uid: string;
  kind: FxKind;
  crit?: boolean;
}

export interface Popup {
  id: number;
  uid: string;
  text: string;
  kind: PopupKind;
}

export interface Cutin {
  id: number;
  side: Side;
  element: ElementId;
  emoji: string;
  sprite: string | null;
  actorName: string;
  skillName: string;
}

export interface LogLine {
  id: number;
  text: string;
}

/** What each unit did over a battle, for the results screen. */
export interface UnitTally {
  dealt: number;
  /** HP actually lost (damage soaked by a shield isn't counted). */
  taken: number;
  healed: number;
  shielded: number;
}

/** Adds one event to the per-unit tally. Burn and poison ticks have no source, so they only count as taken. */
function tallyEvent(tally: Record<string, UnitTally>, e: BattleEvent) {
  const of = (uid: string) => (tally[uid] ??= { dealt: 0, taken: 0, healed: 0, shielded: 0 });
  if (e.type === 'damage') {
    if (e.source) of(e.source).dealt += e.amount;
    of(e.target).taken += e.amount - e.absorbed;
  } else if (e.type === 'heal') of(e.source).healed += e.amount;
  else if (e.type === 'shield') of(e.source).shielded += e.amount;
}

export type Banner = 'start' | 'victory' | 'defeat' | { wave: number; of: number } | null;

/** A boss mechanic announcement across the top of the stage. */
export interface BossAlert {
  id: number;
  kind: 'charge' | 'break' | 'enrage' | 'adds';
  title: string;
  text: string;
}

/** Full-screen ultimate cinematic. */
export interface UltimateShow {
  id: number;
  side: Side;
  element: ElementId;
  emoji: string;
  sprite: string | null;
  actorName: string;
  skillName: string;
}

// Base timings in ms at 1x speed.
const T = {
  intro: 1400,
  turn: 260,
  cutin: 760,
  ultimate: 1500,
  lungeImpact: 270,
  cast: 320,
  hit: 150,
  crit: 280,
  minor: 120,
  stunned: 750,
  defeated: 520,
  end: 400,
  aiThink: 260,
  fxWindup: 220,
  missile: 260,
  fxFrame: 70,
  wave: 1300,
  alert: 1100,
  alertShow: 2600,
  summon: 650,
  fx: 900,
  popup: 1150,
};

const hasEffect = (state: BattleState, uid: string, kind: BattleAction['kind'], effect: string) => {
  const unit = getUnit(state, uid);
  const skill = unit && skillFor(unit, kind);
  return Boolean(skill?.effects.some((e) => e.kind === effect && e.to === 'target'));
};

/**
 * Drives a battle on the client.
 *
 * The shared engine resolves each action instantly and returns its events.
 * A "director" then plays those events back one by one: animating sprites,
 * spawning effects, playing sounds and updating the on-screen state, before
 * handing control to the next actor. Ally actions are recorded for the
 * server, which replays them to verify the result.
 */
export function useBattle(setup: BattleSetup | null, speed: BattleSpeed, autoStart = false) {
  const [view, setView] = useState<BattleState | null>(null);
  const [busy, setBusy] = useState(true);
  const [anims, setAnims] = useState<Record<string, UnitAnim>>({});
  const [fx, setFx] = useState<FxItem[]>([]);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [spells, setSpells] = useState<SpellFx[]>([]);
  const [cutin, setCutin] = useState<Cutin | null>(null);
  const [ultimate, setUltimate] = useState<UltimateShow | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [alert, setAlert] = useState<BossAlert | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [auto, setAuto] = useState(autoStart);

  const speedRef = useRef<number>(speed);
  speedRef.current = speed;

  const director = useMemo(() => {
    const engine = { current: null as BattleState | null };
    const display = { current: null as BattleState | null };
    const actions: BattleAction[] = [];
    let tally: Record<string, UnitTally> = {};
    let slots: Record<string, Slot> = {};
    let run = 0;
    let nextId = 0;
    let busyNow = true;
    const lastSound: Record<string, number> = {};
    let onShake: () => void = () => {};

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms / speedRef.current));
    const id = () => ++nextId;

    /** Plays a sound at most once per burst (e.g. one heal chime for an AoE heal). */
    const sound = (name: string, play: () => void) => {
      const now = performance.now();
      if (now - (lastSound[name] ?? 0) < 90) return;
      lastSound[name] = now;
      play();
    };

    const animate = (uid: string, name: AnimName, extra: Partial<UnitAnim> = {}) => setAnims((a) => ({ ...a, [uid]: { name, key: id(), ...extra } }));

    const spawnFx = (item: Omit<FxItem, 'id'>) => {
      const fxId = id();
      setFx((f) => [...f, { ...item, id: fxId }]);
      setTimeout(() => setFx((f) => f.filter((x) => x.id !== fxId)), T.fx);
    };

    const spawnPopup = (e: BattleEvent) => {
      const p = popupFor(e);
      if (!p) return;
      const popupId = id();
      setPopups((list) => [...list, { ...p, id: popupId }]);
      setTimeout(() => setPopups((list) => list.filter((x) => x.id !== popupId)), T.popup);
    };

    const setBusyBoth = (v: boolean) => {
      busyNow = v;
      setBusy(v);
    };

    async function present(e: BattleEvent, state: BattleState) {
      const text = describeEvent(e, state);
      if (text) setLog((l) => [...l, { id: id(), text }].slice(-80));
      spawnPopup(e);

      switch (e.type) {
        case 'turnStart': {
          if (getUnit(state, e.actor)?.side === 'ally') sfx.turn();
          return sleep(T.turn);
        }
        case 'action': {
          const actor = getUnit(state, e.actor)!;
          if (e.kind === 'ultimate') {
            setUltimate({
              id: id(),
              side: actor.side,
              element: actor.element,
              emoji: actor.emoji,
              sprite: actor.sprite,
              actorName: actor.name,
              skillName: e.skill,
            });
            sfx.ultimate();
            await sleep(T.ultimate);
            setUltimate(null);
            onShake();
            sfx.boom();
          } else if (e.kind === 'skill') {
            setCutin({
              id: id(),
              side: actor.side,
              element: actor.element,
              emoji: actor.emoji,
              sprite: actor.sprite,
              actorName: actor.name,
              skillName: e.skill,
            });
            sfx.skill();
            await sleep(T.cutin);
            setCutin(null);
          }
          const target = e.target ? getUnit(state, e.target) : null;
          const clip: SpriteClip = e.kind === 'ultimate' ? 'attack3' : e.kind === 'skill' ? 'attack2' : 'attack1';
          // Casters with a projectile or spell effect for this attack fight from where they stand.
          const fxDef = actor.sprite ? SPRITES[actor.sprite]?.fx?.[clip as 'attack1'] : undefined;
          if (fxDef && actor.sprite) {
            animate(actor.uid, 'cast', { clip });
            await sleep(T.fxWindup);
            const skill = skillFor(actor, e.kind);
            const to = skill?.effects[0]?.to ?? 'target';
            const hits = target
              ? [target]
              : to === 'allEnemies'
                ? livingUnits(state, opposite(actor.side))
                : to === 'allAllies' || to === 'lowestAlly'
                  ? livingUnits(state, actor.side)
                  : [actor];
            const height = actor.boss ? '12cqw' : '8cqw';
            const from = slots[actor.uid]!;
            const durationMs = (fxDef.kind === 'missile' ? T.missile : fxDef.frames * T.fxFrame) / speedRef.current;
            for (const h of hits) {
              const at = slots[h.uid];
              if (!at) continue;
              const fxId = id();
              setSpells((list) => [
                ...list,
                {
                  id: fxId,
                  sprite: actor.sprite!,
                  clip: clip as 'attack1',
                  kind: fxDef.kind,
                  frames: fxDef.frames,
                  at,
                  from,
                  dx: at.x - from.x,
                  dy: (at.y - from.y) * stageAspect(),
                  flip: actor.side === 'enemy',
                  height,
                  durationMs,
                },
              ]);
              setTimeout(() => setSpells((list) => list.filter((x) => x.id !== fxId)), durationMs + 60);
            }
            sound('spell', fxDef.kind === 'missile' ? sfx.swing : sfx.skill);
            // Land the hit as the arrow arrives, or part-way through the spell.
            return sleep(fxDef.kind === 'missile' ? T.missile : Math.min(fxDef.frames * T.fxFrame * 0.6, 450));
          }
          if (target && target.side !== actor.side && hasEffect(state, actor.uid, e.kind, 'damage')) {
            animate(actor.uid, 'lunge', { ...lungeOffset(slots[actor.uid]!, slots[target.uid]!), clip });
            sfx.swing();
            return sleep(T.lungeImpact);
          }
          animate(actor.uid, 'cast', { clip });
          return sleep(T.cast);
        }
        case 'damage': {
          const source = e.source ? getUnit(state, e.source) : null;
          animate(e.target, 'hit', { clip: 'hurt' });
          spawnFx({ uid: e.target, kind: e.status === 'burn' ? 'burn' : e.status === 'poison' ? 'debuff' : (source?.element ?? 'stone'), crit: e.crit });
          if (e.crit) {
            onShake();
            sfx.crit();
          } else sound('hit', sfx.hit);
          return sleep(e.crit ? T.crit : T.hit);
        }
        case 'heal':
          spawnFx({ uid: e.target, kind: 'heal' });
          sound('heal', sfx.heal);
          return sleep(T.minor);
        case 'shield':
          spawnFx({ uid: e.target, kind: 'shield' });
          sound('shield', sfx.shield);
          return sleep(T.minor);
        case 'statusApplied': {
          const buff = STATUS_INFO[e.status].buff;
          spawnFx({ uid: e.target, kind: buff ? 'buff' : 'debuff' });
          sound(buff ? 'buff' : 'debuff', buff ? sfx.buff : sfx.debuff);
          return sleep(T.minor);
        }
        case 'statusResisted':
          sound('resist', sfx.resist);
          return sleep(T.minor);
        case 'advance':
          spawnFx({ uid: e.target, kind: 'buff' });
          return sleep(T.minor);
        case 'delay':
          spawnFx({ uid: e.target, kind: 'debuff' });
          sound('debuff', sfx.debuff);
          return sleep(T.minor);
        case 'statusRemoved': {
          const buffs = STATUS_INFO[e.statuses[0]!].buff;
          spawnFx({ uid: e.target, kind: buffs ? 'debuff' : 'heal' });
          sound(buffs ? 'debuff' : 'heal', buffs ? sfx.debuff : sfx.heal);
          return sleep(T.minor);
        }
        case 'revive':
          animate(e.target, 'enter');
          spawnFx({ uid: e.target, kind: 'heal' });
          sfx.buff();
          return sleep(T.summon);
        case 'passive':
          spawnFx({ uid: e.unit, kind: 'buff' });
          sound('buff', sfx.buff);
          return sleep(T.minor);
        case 'spawn': {
          // Re-lay out the side that grew; defeated units keep their spot until they fade.
          const side = e.units[0]?.side;
          const fresh = formation(state.units.filter((u) => u.side === side && u.hp > 0));
          slots = { ...slots, ...fresh };
          setAnims((a) => ({ ...a, ...Object.fromEntries(e.units.map((u) => [u.uid, { name: 'enter' as const, key: id() }])) }));
          if (e.reason === 'wave') {
            setBanner({ wave: e.wave, of: state.waves });
            sfx.battleStart();
            await sleep(T.wave);
            setBanner(null);
            return;
          }
          sfx.buff();
          return sleep(T.summon);
        }
        case 'mechanic': {
          if (e.kind === 'unleash') return sleep(T.minor);
          const shown = mechanicAlert(e, state);
          if (shown) {
            const alertId = id();
            setAlert({ id: alertId, kind: e.kind, ...shown });
            setTimeout(() => setAlert((a) => (a?.id === alertId ? null : a)), T.alertShow / speedRef.current);
          }
          if (e.kind === 'break') {
            onShake();
            sfx.crit();
          } else if (e.kind === 'charge') sfx.ultimate();
          else if (e.kind === 'enrage') sfx.boom();
          else sfx.buff();
          spawnFx({ uid: e.unit, kind: e.kind === 'break' ? 'debuff' : 'buff' });
          return sleep(T.alert);
        }
        case 'stunned':
          sfx.stun();
          return sleep(T.stunned);
        case 'defeated':
          animate(e.target, 'die', { clip: 'death' });
          sfx.defeat();
          return sleep(T.defeated);
        case 'end':
          setBanner(e.outcome);
          if (e.outcome === 'victory') {
            sfx.victory();
            for (const u of state.units) if (u.side === 'ally' && u.hp > 0) animate(u.uid, 'victory');
          } else sfx.lose();
          return sleep(T.end);
      }
    }

    async function play(events: BattleEvent[], final: BattleState, myRun: number) {
      for (const e of events) {
        if (myRun !== run) return false;
        display.current = applyEvent(display.current!, e);
        tallyEvent(tally, e);
        setView(display.current);
        await present(e, display.current);
      }
      if (myRun !== run) return false;
      display.current = final;
      setView(final);
      return true;
    }

    return {
      actions,
      setShake(fn: () => void) {
        onShake = fn;
      },
      get engine() {
        return engine.current;
      },
      get slots() {
        return slots;
      },
      /** Damage dealt and taken, healing and shields per unit, for what has played so far. */
      get tally() {
        return tally;
      },

      start(s: BattleSetup) {
        const myRun = ++run;
        const { state, events } = startBattle(s);
        engine.current = state;
        actions.length = 0;
        tally = {};
        slots = formation(state.units);
        display.current = { ...structuredClone(state), actorUid: null };
        setView(display.current);
        setLog([]);
        setFx([]);
        setSpells([]);
        setPopups([]);
        setAlert(null);
        setAnims(Object.fromEntries(state.units.map((u) => [u.uid, { name: 'enter' as const, key: id() }])));
        setBusyBoth(true);
        setBanner('start');
        sfx.battleStart();
        void (async () => {
          await sleep(T.intro);
          if (myRun !== run) return;
          setBanner(null);
          if (await play(events, structuredClone(state), myRun)) setBusyBoth(false);
        })();
      },

      stop() {
        run++;
      },

      async perform(action: BattleAction) {
        const current = engine.current;
        if (!current || busyNow || validateAction(current, action)) return;
        if (currentActor(current)!.side === 'ally') actions.push(action);
        const events = act(current, action);
        setBusyBoth(true);
        const ok = await play(events, structuredClone(current), run);
        if (ok) setBusyBoth(false);
      },
    };
  }, []);

  useEffect(() => {
    if (!setup) return;
    director.start(setup);
    return () => director.stop();
  }, [setup, director]);

  // Enemy turns (and ally turns on auto) are taken once the previous step has finished playing.
  useEffect(() => {
    const current = director.engine;
    if (busy || !current || current.outcome !== 'ongoing') return;
    const actor = currentActor(current);
    if (!actor || (actor.side === 'ally' && !auto)) return;
    const t = setTimeout(() => void director.perform(chooseAction(current)), T.aiThink / speedRef.current);
    return () => clearTimeout(t);
  }, [busy, auto, director]);

  return {
    view,
    busy,
    anims,
    fx,
    spells,
    popups,
    cutin,
    ultimate,
    banner,
    alert,
    log,
    auto,
    setAuto,
    director,
  };
}
