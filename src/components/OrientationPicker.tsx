// OrientationPicker — the compulsory screen-shape choice before a build starts.
//
// This is permanent: the game is written AND sandbox-verified for one viewport (390x844 or
// 844x390), so it can't be changed later. That's why it's a deliberate tap with no default
// pre-selected, rather than something a creator can slide past.
//
// The website had no picker at all, so every game made here was built portrait no matter what the
// prompt asked for.

import { ORIENTATION_OPTIONS, type Orientation } from '../constants/orientation';

type Props = {
  value: Orientation | null;
  onChange: (orientation: Orientation) => void;
  className?: string;
};

export default function OrientationPicker({ value, onChange, className = '' }: Props) {
  return (
    <div className={`orientation-picker ${className}`.trim()}>
      <span className="orientation-label">Screen shape</span>
      <div className="orientation-row">
        {ORIENTATION_OPTIONS.map((option) => {
          const active = value === option.key;
          return (
            <button
              key={option.key}
              type="button"
              className={`orientation-card ${active ? 'is-active' : ''}`}
              onClick={() => onChange(option.key)}
              aria-pressed={active}
            >
              <span className={`orientation-glyph is-${option.key}`} aria-hidden="true" />
              <strong>{option.label}</strong>
              <small>{option.sub}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
