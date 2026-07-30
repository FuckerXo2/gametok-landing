// PublishSheet — the step that actually puts a game on GameTok.
//
// The website never had one. Its "Publish" button was `disabled={!fallbackGame}` and called
// onOpenGame(fallbackGame), so it opened an unrelated game from the feed and never once called
// ai.publish; desktop had no publish affordance at all. This mirrors the app's publish sheet:
// required name, privacy choice, terms line.

import { useState } from 'react';
import { Check, Eye, Globe, Lock, X } from 'lucide-react';
import { ai } from '../services/api';

const PRIVACY_OPTIONS = [
  { key: 'public', label: 'Public', sub: 'Anyone can play and remix', icon: Globe },
  { key: 'play_only', label: 'Public for play only', sub: 'Anyone can play but not remix', icon: Eye },
  { key: 'private', label: 'Only me', sub: 'Only visible to you', icon: Lock },
] as const;

const MAX_TITLE = 60;

type Props = {
  draftId: string | null;
  defaultTitle: string;
  /** Sent only when the draft row doesn't exist yet (publishing from a template). */
  html?: string | null;
  onClose: () => void;
  onPublished: (game: { id?: string; name?: string }) => void;
};

export default function PublishSheet({ draftId, defaultTitle, html, onClose, onPublished }: Props) {
  const [title, setTitle] = useState(defaultTitle === 'Untitled Dream' ? '' : defaultTitle);
  const [privacy, setPrivacy] = useState<string>('public');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const name = title.trim();
    if (!name) {
      setError('Give your game a name first.');
      return;
    }
    if (!draftId) {
      setError('This build has no draft to publish. Try building again.');
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const res: any = await ai.publish(draftId, name, privacy, html || undefined);
      if (res?.error) throw Object.assign(new Error(res.error), { code: res.code });
      onPublished({ id: res?.gameId || res?.game?.id || draftId, name });
    } catch (e: any) {
      // A remix that was never edited is a rule, not a crash — say what to do about it.
      if (e?.code === 'REMIX_UNCHANGED') {
        setError('Change something about this remix before publishing it.');
      } else {
        setError(e?.message || 'Could not publish. Try again.');
      }
      setPublishing(false);
    }
  };

  return (
    <div className="publish-sheet-scrim" role="dialog" aria-modal="true" aria-label="Publish game">
      <div className="publish-sheet">
        <header>
          <h2>Publish game</h2>
          <button onClick={onClose} aria-label="Close" disabled={publishing}>
            <X size={18} />
          </button>
        </header>

        <label className="publish-field">
          <span>Game name</span>
          <input
            value={title}
            maxLength={MAX_TITLE}
            autoFocus
            placeholder="Neon Drift"
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
          />
          <small>{title.length}/{MAX_TITLE}</small>
        </label>

        <div className="publish-field">
          <span>Who can see it</span>
          <div className="publish-privacy">
            {PRIVACY_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = privacy === option.key;
              return (
                <button
                  key={option.key}
                  className={active ? 'active' : ''}
                  onClick={() => setPrivacy(option.key)}
                  type="button"
                >
                  <Icon size={17} />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.sub}</small>
                  </span>
                  {active && <Check size={16} />}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="publish-error">{error}</p>}

        <p className="publish-terms">By publishing a game, you agree to GameTok's Terms.</p>

        <button className="publish-submit" onClick={submit} disabled={publishing}>
          {publishing ? 'Publishing…' : 'Publish to GameTok'}
        </button>
      </div>
    </div>
  );
}
