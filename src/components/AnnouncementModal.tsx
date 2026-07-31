// AnnouncementModal — the "what's new" card behind the live pill on the home hero.
//
// Deliberately content-driven: everything it renders comes from the `announcement` object it is
// handed, so the copy can be edited in one place now and swapped for a real announcements feed
// later without touching this component.

import { useEffect, useRef } from 'react';
import { ArrowRight, X, type LucideIcon } from 'lucide-react';

export type AnnouncementHighlight = {
  icon: LucideIcon;
  title: string;
  body: string;
};

export type Announcement = {
  /** Art across the top of the card. */
  image: string;
  title: string;
  subtitle: string;
  highlights: AnnouncementHighlight[];
  primaryLabel: string;
  primaryIcon?: LucideIcon;
  /** Omit to hide the secondary button — e.g. before the post it links to exists. */
  readMoreLabel?: string;
};

type Props = {
  announcement: Announcement;
  onClose: () => void;
  onPrimary: () => void;
  onReadMore?: () => void;
};

export default function AnnouncementModal({ announcement, onClose, onPrimary, onReadMore }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes, and the close button takes focus so the card is keyboard-usable
  // the moment it opens.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const PrimaryIcon = announcement.primaryIcon;

  return (
    <div
      className="announce-scrim"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="announce-title"
    >
      {/* Clicks inside the card must not fall through to the scrim's close. */}
      <div className="announce-card" onClick={(e) => e.stopPropagation()}>
        <div className="announce-art">
          <img src={announcement.image} alt="" />
          <button ref={closeRef} className="announce-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="announce-body">
          <h2 id="announce-title">{announcement.title}</h2>
          <p className="announce-sub">{announcement.subtitle}</p>

          <div className="announce-grid">
            {announcement.highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div className="announce-item" key={item.title}>
                  <span className="announce-item-icon"><Icon size={17} /></span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.body}</small>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="announce-actions">
            <button className="announce-primary" onClick={onPrimary}>
              {PrimaryIcon && <PrimaryIcon size={16} />} {announcement.primaryLabel}
            </button>
            {announcement.readMoreLabel && onReadMore && (
              <button className="announce-secondary" onClick={onReadMore}>
                {announcement.readMoreLabel} <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
