// About page.
//
// Follows the information architecture of the reference: hero → press → how it works → team →
// investors → closing CTA.
//
// Press, team and investors are data-driven and each section renders only when its array has
// entries. That is deliberate: those need real quotes, real headshots and real logos, and a page
// with three empty placeholder blocks looks worse than a shorter page that is entirely true. Fill
// the constants below and the sections appear.

import type React from 'react';
import { ArrowRight, Wand2 } from 'lucide-react';
import { getThumbnailUrl } from '../services/api';

type Game = { id: string; name: string; thumbnail?: string; color?: string };

// ── Content ───────────────────────────────────────────────────────────────────

/** Press quotes. Needs real coverage — leave empty until there is some. */
export const ABOUT_PRESS: Array<{ quote: string; outlet: string; date?: string; url?: string }> = [];

/** Leadership. Needs real names, roles, bios and headshots. */
export const ABOUT_TEAM: Array<{ name: string; role: string; bio: string; photo?: string }> = [];

/** Investors — logos and named individuals. */
export const ABOUT_INVESTORS: {
  logos: Array<{ name: string; logo?: string; url?: string }>;
  people: Array<{ name: string; url?: string }>;
} = { logos: [], people: [] };

const HOW_IT_WORKS = [
  {
    title: 'Describe it',
    body: 'Write a brief in plain language and pick a screen shape — tall or wide. That shape is fixed for the life of the game, because it is built and tested for one viewport.',
  },
  {
    title: 'The forge builds it',
    body: 'It designs the game, writes it, and tests that it actually plays before handing it back. You get something playable, not a project to finish.',
  },
  {
    title: 'Publish and remix',
    body: 'Post it to the feed where anyone can play it instantly, with nothing to install. Anyone can remix it into something of their own.',
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function About({
  games,
  onCreate,
  onExplore,
  onThumbError,
}: {
  games: Game[];
  onCreate: () => void;
  onExplore: () => void;
  /** Shared with the rest of the app so a broken cover falls back the same way. */
  onThumbError: (e: React.SyntheticEvent<HTMLImageElement>, game: any) => void;
}) {
  // Real covers from the feed, so the strip shows games that actually exist.
  const strip = games.slice(0, 7);

  return (
    <div className="about">
      <section className="about-hero">
        <h1>Everyone has a game in them.</h1>
        <p>
          GameTok lets anyone make a game by describing it, and lets anyone play what other
          people made — instantly, in a feed, with nothing to install.
        </p>
        <div className="about-hero-actions">
          <button className="primary" onClick={onCreate}><Wand2 size={17} /> Start creating</button>
          <button onClick={onExplore}>Start playing <ArrowRight size={16} /></button>
        </div>

        {strip.length > 0 && (
          <div className="about-strip" aria-hidden="true">
            {strip.map((game) => (
              <div className="about-strip-tile" key={game.id} style={{ backgroundColor: game.color || '#141418' }}>
                <img
                  src={getThumbnailUrl(game)}
                  alt=""
                  loading="lazy"
                  onError={(e) => onThumbError(e, game)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {ABOUT_PRESS.length > 0 && (
        <section className="about-press">
          <h2>In the press</h2>
          {ABOUT_PRESS.map((item) => (
            <figure key={item.quote}>
              <blockquote>{item.quote}</blockquote>
              <figcaption>
                {item.url
                  ? <a href={item.url} target="_blank" rel="noreferrer">{item.outlet}</a>
                  : <span>{item.outlet}</span>}
                {item.date && <small>{item.date}</small>}
              </figcaption>
            </figure>
          ))}
        </section>
      )}

      <section className="about-how">
        <header>
          <span className="about-eyebrow">How it works</span>
          <h2>From a sentence to something playable.</h2>
        </header>
        <div className="about-how-grid">
          {HOW_IT_WORKS.map((step, index) => (
            <article key={step.title}>
              <strong className="about-step-num">{index + 1}</strong>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      {ABOUT_TEAM.length > 0 && (
        <section className="about-team">
          <h2>Leadership</h2>
          <div className="about-team-grid">
            {ABOUT_TEAM.map((person) => (
              <article key={person.name}>
                {person.photo && <img src={person.photo} alt="" />}
                <h3>{person.name}</h3>
                <span>{person.role}</span>
                <p>{person.bio}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {(ABOUT_INVESTORS.logos.length > 0 || ABOUT_INVESTORS.people.length > 0) && (
        <section className="about-investors">
          <h2>Backed by</h2>
          {ABOUT_INVESTORS.logos.length > 0 && (
            <div className="about-investor-logos">
              {ABOUT_INVESTORS.logos.map((inv) => (
                <div key={inv.name} title={inv.name}>
                  {inv.logo ? <img src={inv.logo} alt={inv.name} /> : <span>{inv.name}</span>}
                </div>
              ))}
            </div>
          )}
          {ABOUT_INVESTORS.people.length > 0 && (
            <div className="about-investor-people">
              {ABOUT_INVESTORS.people.map((p) => (
                p.url
                  ? <a key={p.name} href={p.url} target="_blank" rel="noreferrer">{p.name}</a>
                  : <span key={p.name}>{p.name}</span>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="about-closing">
        <h2>Make the one in you.</h2>
        <p>No engine, no setup, no code. Describe it and play it.</p>
        <div className="about-hero-actions">
          <button className="primary" onClick={onCreate}><Wand2 size={17} /> Start creating</button>
          <button onClick={onExplore}>Start playing <ArrowRight size={16} /></button>
        </div>
      </section>
    </div>
  );
}
