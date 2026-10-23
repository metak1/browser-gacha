import { useEffect, useState } from 'react';
import './tutorial.css';

interface Step {
  title: string;
  text: string;
  /** Finds the element to highlight; no target = a centered card. */
  target?: () => Element | null | undefined;
}

const byText = (selector: string, text: string) => () => [...document.querySelectorAll(selector)].find((e) => e.textContent?.includes(text));

const STEPS: Step[] = [
  {
    title: 'Your first battle',
    text: "Battles are turn-based: your heroes and the enemies take turns. Here's a quick tour before you strike.",
  },
  {
    title: 'Turn order',
    text: 'Faster units act more often. This strip shows who moves next, starting with the unit acting now.',
    target: () => document.querySelector('.turn-order'),
  },
  {
    title: 'Basic attack',
    text: 'Always ready. Every action also charges energy for your ultimate.',
    target: () => document.querySelector('.act-btn.basic'),
  },
  {
    title: 'Skill',
    text: 'A stronger move that goes on cooldown afterwards. The number shows how many turns until it is ready again.',
    target: () => document.querySelector('.act-btn.skill'),
  },
  {
    title: 'Ultimate',
    text: 'Energy fills as heroes act and take hits. At 100% the ultimate unleashes a big cinematic attack.',
    target: () => document.querySelector('.act-btn.ultbtn'),
  },
  {
    title: 'Pick a target',
    text: 'After choosing an action, tap a glowing enemy. Elements matter: Flame → Frost → Gale → Stone → Volt → Tide → Flame. Hitting the element you beat deals +30% damage.',
    target: () => document.querySelector('.sprite.enemy'),
  },
  {
    title: 'Auto and speed',
    text: 'AUTO lets your team fight on its own, and the speed button goes up to 3×. Clear stages with every star to sweep them instantly later. Good luck!',
    target: byText('.icon-btn', 'AUTO'),
  },
];

/** A spotlight walkthrough of the battle screen, shown on the player's first battle turn. */
export function BattleTutorial({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[i]!;

  useEffect(() => {
    const measure = () => setRect(step.target?.()?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const t = setInterval(measure, 300); // layout can shift while the battle animates
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      clearInterval(t);
    };
  }, [step]);

  const last = i === STEPS.length - 1;
  const pad = 8;
  // Put the card below the highlight, or above it when it's low on the screen.
  const below = rect ? rect.bottom + 220 < window.innerHeight : true;
  const cardStyle = rect
    ? {
        left: Math.max(12, Math.min(window.innerWidth - 352, rect.left + rect.width / 2 - 170)),
        top: below ? rect.bottom + pad + 12 : undefined,
        bottom: below ? undefined : window.innerHeight - rect.top + pad + 12,
      }
    : undefined;

  return (
    <div className="tutorial" role="dialog" aria-label="Battle tutorial">
      {rect ? (
        <div
          className="tutorial-spot"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      ) : (
        <div className="tutorial-dim" />
      )}
      <div className={`tutorial-card ${rect ? '' : 'center'}`} style={cardStyle}>
        <small className="muted">
          {i + 1} / {STEPS.length}
        </small>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div className="tutorial-actions">
          {!last && (
            <button className="btn small" onClick={onDone}>
              Skip
            </button>
          )}
          <button className="btn primary small" onClick={() => (last ? onDone() : setI(i + 1))} autoFocus>
            {last ? "Let's fight!" : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
