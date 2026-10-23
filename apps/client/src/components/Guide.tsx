import { firstSummonFree, GUIDE_FLAGS, guideStep, type GuideStep } from '@gacha/shared';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { sfx } from '../audio/sfx';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import '../battle/tutorial.css';
import './guide.css';

interface Card {
  title: string;
  text: string;
  /** Selectors for the element to highlight; the first visible one wins. */
  target?: string[];
  /** A centered card that blocks the page until answered. */
  modal?: boolean;
  /** Shows a Next button that moves on within the same screen. */
  next?: () => void;
  /** Buttons that finish the step. */
  actions?: { label: string; primary?: boolean; run: () => void }[];
}

const navLink = (to: string) => [`.main-nav a[href="${to}"]`, `.mobile-tabs a[href="${to}"]`];

function visible(selectors: string[] | undefined): Element | null {
  for (const s of selectors ?? []) {
    for (const el of document.querySelectorAll(s)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

/**
 * The new-player tutorial: welcome → the free first 10× summon → first
 * battle → level up a hero. It follows the player around: each step points at
 * the next thing to tap on whatever screen they are on. Progress is kept in
 * account flags, so it resumes on any device.
 */
export function Guide() {
  const { profile, setProfile } = useProfile();
  const content = useContent();
  const location = useLocation();
  const navigate = useNavigate();
  const step = guideStep(content, profile);
  const path = location.pathname;

  const flag = (f: string) => api.addFlag(f).then(setProfile, () => {});

  // Level-up step: done once any hero gains a level after the step begins.
  const levels = profile.roster.reduce((n, c) => n + c.level, 0);
  const base = useRef<number | null>(null);
  useEffect(() => {
    if (step !== 'levelUp') {
      base.current = null;
      return;
    }
    if (base.current === null) base.current = levels;
    else if (levels > base.current) {
      sfx.coins();
      void flag(GUIDE_FLAGS.levelUp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, levels]);

  // Steps within the summon screen.
  const [sub, setSub] = useState(0);
  useEffect(() => setSub(0), [step, path]);

  const card = step ? cardFor(step, path, sub, { flag, navigate, next: () => setSub((s) => s + 1), firstStage: content.stages[0]?.id ?? '1-1' }) : null;
  // Skipping still leads new players to their free summon: it is where their first heroes come from.
  const skip = () => {
    void flag(GUIDE_FLAGS.done);
    if (firstSummonFree(content, profile.flags)) navigate('/summon');
  };
  return card ? <GuideCard card={card} onSkip={skip} /> : null;
}

interface Ctx {
  flag: (f: string) => void;
  navigate: (to: string) => void;
  next: () => void;
  firstStage: string;
}

function cardFor(step: GuideStep, path: string, sub: number, ctx: Ctx): Card | null {
  // Battles have their own tour, and their result screens a "continue" button.
  if (/^\/(battle|dungeon|event|guild-battle|tower|arena\/fight|admin)(\/|$)/.test(path)) return null;
  switch (step) {
    case 'welcome':
      return {
        modal: true,
        title: 'Welcome to Starlit Summons!',
        text: "Gather heroes, train them, and lead a team of four through the campaign. Let's summon your first heroes (your first 10× summon is free!), play your first battle, and power up a hero.",
        actions: [{ label: "Let's go", primary: true, run: () => ctx.flag(GUIDE_FLAGS.welcome) }],
      };
    case 'battle':
      return path === '/'
        ? { title: 'Your first battle', text: `Adventure takes your team to the next campaign stage. Tap it to fight stage ${ctx.firstStage}.`, target: ['.lobby-actions .btn.primary'] }
        : {
            title: 'Your first battle',
            text: `Fight stage ${ctx.firstStage} to begin your adventure.`,
            actions: [{ label: `Battle ${ctx.firstStage}`, primary: true, run: () => ctx.navigate(`/battle/${ctx.firstStage}`) }],
          };
    case 'levelUp':
      return path === '/roster'
        ? {
            title: 'Power up',
            text: 'Victory! Battles pay gold. Spend it here to level up a hero: every level raises HP, ATK and DEF. Tap Level up.',
            target: ['.detail-actions .btn.primary'],
          }
        : { title: 'Power up your heroes', text: 'Open Heroes to see your team and make them stronger.', target: navLink('/roster') };
    case 'summon':
      if (path !== '/summon') {
        return { title: 'Summon your first heroes', text: 'Every adventure needs heroes. Open Summon: your first 10× summon is free!', target: navLink('/summon') };
      }
      if (sub === 0) {
        return {
          title: 'Banners',
          text: 'Each banner has its own heroes. Rate-up heroes are much more likely to appear while their banner runs.',
          target: ['.banner-hero'],
          next: ctx.next,
        };
      }
      if (sub === 1) {
        return {
          title: 'Pity',
          text: 'Every summon fills the pity counter. A ★4 or better is guaranteed every 10 summons, and a ★5 by the end of the bar.',
          target: ['.pity'],
          next: ctx.next,
        };
      }
      return {
        title: 'Your free 10× summon',
        text: 'Tap Summon ×10. This one is on us, and it is guaranteed to include a ★5 hero! Your rarest new heroes form your first team.',
        target: ['.summon-buttons .btn:last-child'],
      };
    case 'finish':
      return {
        modal: true,
        title: 'Your adventure begins!',
        text: 'Swap heroes in and out of your team of four in Heroes. Keep clearing the campaign, claim missions and the daily supplies for more gems, and unlock the Arena and Dungeons along the way. Good luck!',
        actions: [
          { label: 'Done', run: () => ctx.flag(GUIDE_FLAGS.done) },
          {
            label: 'Open Heroes',
            primary: true,
            run: () => {
              ctx.flag(GUIDE_FLAGS.done);
              ctx.navigate('/roster');
            },
          },
        ],
      };
  }
}

function GuideCard({ card, onSkip }: { card: Card; onSkip: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  // Hidden while another overlay (the summon reveal) is up.
  const [covered, setCovered] = useState(false);
  const key = card.title + card.text;

  useEffect(() => {
    let scrolled = false;
    const measure = () => {
      setCovered(Boolean(document.querySelector('.overlay')));
      const el = visible(card.target);
      if (el && !scrolled) {
        scrolled = true;
        const r = el.getBoundingClientRect();
        if (r.top < 60 || r.bottom > window.innerHeight - 90) el.scrollIntoView({ block: 'center' });
      }
      setRect(el?.getBoundingClientRect() ?? null);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const t = setInterval(measure, 250); // targets appear and move as screens load
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (covered) return null;
  const pad = 6;
  const below = rect ? rect.bottom + 230 < window.innerHeight : true;
  const style = rect
    ? {
        left: Math.max(12, Math.min(window.innerWidth - 352, rect.left + rect.width / 2 - 170)),
        top: below ? rect.bottom + pad + 12 : undefined,
        bottom: below ? undefined : window.innerHeight - rect.top + pad + 12,
      }
    : undefined;
  // Cards with nothing to point at sit at the bottom unless they are modal.
  const place = rect ? '' : card.modal ? 'center' : 'dock';

  return (
    <div className={`guide ${card.modal ? 'blocking' : ''}`} role="dialog" aria-label="Tutorial">
      {rect ? (
        <div className="tutorial-spot guide-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        card.modal && <div className="tutorial-dim" />
      )}
      <div key={key} className={`tutorial-card guide-card ${place}`} style={style}>
        <small className="guide-tag">✦ Tutorial</small>
        <h3>{card.title}</h3>
        <p>{card.text}</p>
        <div className="tutorial-actions">
          <button className="guide-skip" onClick={onSkip}>
            Skip tutorial
          </button>
          {card.next && (
            <button className="btn primary small" onClick={card.next} autoFocus>
              Next
            </button>
          )}
          {card.actions?.map((a) => (
            <button key={a.label} className={`btn small ${a.primary ? 'primary' : ''}`} onClick={a.run} autoFocus={a.primary}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
