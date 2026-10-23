import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import { useToast } from '../state/toast';

export function AccountScreen() {
  const { profile, mutate } = useProfile();
  const toast = useToast();

  async function logout() {
    try {
      await api.logout();
    } catch (err) {
      toast(errorMessage(err), 'error');
      return;
    }
    // A full reload re-runs boot, which starts a fresh guest session.
    window.location.assign('/');
  }

  if (profile.user.username) {
    return (
      <div className="account narrow">
        <h1>Account</h1>
        <ProfileCard />
        <section className="panel">
          <p>
            Signed in as <b>{profile.user.username}</b>.
          </p>
          <p className="muted">Log in with this username and password on any device to continue your progress.</p>
          <button className="btn" onClick={logout}>
            Log out
          </button>
        </section>
        <ResetAccount />
        <Credits />
      </div>
    );
  }

  return (
    <div className="account narrow">
      <h1>Account</h1>
      <ProfileCard />
      <section className="panel">
        <h3>Save your progress</h3>
        <p className="muted">
          You're playing as a guest. Link a username and password to keep this progress and play it on other devices.
        </p>
        <CredentialsForm
          submitLabel="Link account"
          confirmPassword
          onSubmit={(u, p) => mutate(() => api.link(u, p), 'Account linked! You can now log in anywhere.')}
        />
      </section>

      <section className="panel">
        <h3>Already have an account?</h3>
        <p className="muted warn-text">
          Logging in switches to that account. This guest's progress will be lost unless you link it first.
        </p>
        <LoginForm />
      </section>
      <ResetAccount />
      <Credits />
    </div>
  );
}

function LoginForm() {
  const { mutate } = useProfile();
  const navigate = useNavigate();
  return (
    <CredentialsForm
      submitLabel="Log in"
      onSubmit={async (u, p) => {
        const ok = await mutate(() => api.login(u, p), `Welcome back, ${u}!`);
        if (ok) navigate('/');
        return ok;
      }}
    />
  );
}

interface FormProps {
  submitLabel: string;
  confirmPassword?: boolean;
  onSubmit: (username: string, password: string) => Promise<boolean>;
}

function CredentialsForm({ submitLabel, confirmPassword, onSubmit }: FormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (confirmPassword && password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setError(null);
    setBusy(true);
    await onSubmit(username.trim(), password);
    setBusy(false);
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Username
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]+"
          title="Letters, numbers and underscores"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={confirmPassword ? 'new-password' : 'current-password'}
          minLength={8}
          maxLength={128}
          required
        />
      </label>
      {confirmPassword && (
        <label>
          Confirm password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
      )}
      {error && <p className="error-text">{error}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? 'Please wait…' : submitLabel}
      </button>
    </form>
  );
}

/** Third-party art used by the game. Shown on the Account page. */
function Credits() {
  return (
    <section className="panel credits">
      <h3>Credits</h3>
      <ul className="small">
        <li>
          Character sprites: <a href="https://zerie.itch.io/tiny-rpg-character-asset-pack" target="_blank" rel="noreferrer">Tiny RPG Character Asset Pack</a>{' '}
          and <a href="https://zerie.itch.io/tiny-rpg-character-asset-pack-02" target="_blank" rel="noreferrer">Tiny RPG Character Asset Pack 02</a> by Zerie
        </li>
        <li>
          Icons: <a href="https://clockworkraven.itch.io/raven-fantasy-icons" target="_blank" rel="noreferrer">Raven Fantasy Icons</a> by Clockwork Raven Studios
        </li>
      </ul>
    </section>
  );
}

/** Account level, title and friend code. */
function ProfileCard() {
  const { profile, mutate } = useProfile();
  const content = useContent();
  const a = profile.account;
  const pct = a.xpNeed ? Math.round((a.xpInto / a.xpNeed) * 100) : 100;
  return (
    <section className="panel profile-card">
      <div className="profile-level">
        <span className="level-badge">Lv {a.level}</span>
        <div className="xp-line">
          <span className="xp-track">
            <span style={{ width: `${pct}%` }} />
          </span>
          <small className="muted">{a.xpNeed ? `${a.xpInto} / ${a.xpNeed} XP` : 'Max level'}</small>
        </div>
      </div>
      <label className="small">
        Title{' '}
        <select className="sort-select" value={a.title ?? ''} onChange={(e) => void mutate(() => api.setTitle(e.target.value || null), 'Title updated')}>
          <option value="">None</option>
          {a.titles.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <p className="small muted">
        Earn titles by levelling up and by finishing one-time missions. Friend code: <b>{a.friendCode}</b>
      </p>
      <Meter label="Campaign" value={content.stages.filter((s) => profile.clearedStages.includes(s.id)).length} max={content.stages.length} />
      <Meter label="Collection" value={profile.roster.length} max={content.bundle.characters.length} />
    </section>
  );
}

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="meter">
      <div className="meter-label">
        <span>{label}</span>
        <b>
          {value} / {max}
        </b>
      </div>
      <div className="meter-bar">
        <div style={{ width: `${(value / Math.max(1, max)) * 100}%` }} />
      </div>
    </div>
  );
}

/** Starting over, behind a confirmation. */
function ResetAccount() {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="panel">
      <h3>Reset account</h3>
      <p className="muted">Delete all your progress and start over as a new player.</p>
      <button className="btn danger" onClick={() => setConfirming(true)}>
        Reset account
      </button>
      {confirming && <ResetDialog onCancel={() => setConfirming(false)} />}
    </section>
  );
}

/** Asks before wiping the account. */
function ResetDialog({ onCancel }: { onCancel: () => void }) {
  const { profile } = useProfile();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function reset() {
    setBusy(true);
    try {
      await api.resetAccount();
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
      return;
    }
    // A full reload drops every bit of client state from the old progress.
    window.location.assign('/');
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="modal reset-dialog" role="alertdialog" aria-labelledby="reset-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="reset-title">Reset account?</h2>
        <p>
          All your heroes, gear, gems, gold and progress will be <b>permanently deleted</b>, and you will start over as a new player.
        </p>
        <p className="muted">
          {profile.user.username ? `You keep your login (${profile.user.username}). ` : ''}
          You will leave your guild and lose your friends. Other devices will be signed out. This can't be undone.
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={busy} autoFocus>
            Cancel
          </button>
          <button className="btn danger" onClick={reset} disabled={busy}>
            {busy ? 'Resetting…' : 'Reset everything'}
          </button>
        </div>
      </div>
    </div>
  );
}
