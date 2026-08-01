// Blog index and post pages.
//
// Content comes from the `posts` table via /api/posts. What used to be here was a hardcoded
// BLOG_POSTS array with three entries, no images and invented dates — it read as mock because it
// was one.
//
// Post bodies are markdown authored in the admin tool, so they are rendered through marked and then
// sanitised with DOMPurify. That sanitise step is not optional: the body is user-authored content
// reaching dangerouslySetInnerHTML.

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { posts as postsApi, type Post } from '../services/api';

/** Mirrors POST_CATEGORIES in gametok-backend/src/posts-router.js. */
export const POST_CATEGORIES: Array<{ slug: string; label: string }> = [
  { slug: 'announcements', label: 'Announcements' },
  { slug: 'product', label: 'Product' },
  { slug: 'creators', label: 'Creators' },
  { slug: 'company', label: 'Company' },
];

export function categoryLabel(slug: string) {
  return POST_CATEGORIES.find((c) => c.slug === slug)?.label || slug;
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

// ── Index ─────────────────────────────────────────────────────────────────────

export function BlogIndex({ onOpenPost }: { onOpenPost: (slug: string) => void }) {
  const [all, setAll] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res: any = await postsApi.list({ limit: 60 });
        if (!mounted) return;
        setAll(Array.isArray(res?.posts) ? res.posts : []);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Could not load posts.');
        setAll([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Filtering client-side: the index fetches everything once, so switching
  // category is instant rather than a round trip per pill.
  const visible = useMemo(() => {
    if (!all) return [];
    if (!active) return all;
    return all.filter((p) => (p.categories || []).includes(active));
  }, [all, active]);

  // Only offer filters that would actually return something.
  const available = useMemo(() => {
    const present = new Set((all || []).flatMap((p) => p.categories || []));
    return POST_CATEGORIES.filter((c) => present.has(c.slug));
  }, [all]);

  return (
    <section className="blog-index">
      <header className="blog-index-head">
        <h1>GameTok Blog</h1>
        <p>Get the latest news and insights</p>
      </header>

      {available.length > 0 && (
        <nav className="blog-filters">
          <button className={!active ? 'is-active' : ''} onClick={() => setActive(null)}>All</button>
          {available.map((c) => (
            <button
              key={c.slug}
              className={active === c.slug ? 'is-active' : ''}
              onClick={() => setActive(c.slug)}
            >
              {c.label}
            </button>
          ))}
        </nav>
      )}

      {all === null && <p className="blog-empty">Loading posts…</p>}
      {error && <p className="blog-empty">{error}</p>}
      {all !== null && !error && visible.length === 0 && (
        <p className="blog-empty">
          {active ? `Nothing in ${categoryLabel(active)} yet.` : 'No posts yet.'}
        </p>
      )}

      <div className="blog-grid">
        {visible.map((post) => (
          <button key={post.id} className="blog-card" onClick={() => onOpenPost(post.slug)}>
            <div className="blog-card-cover">
              {post.coverImage
                ? <img src={post.coverImage} alt="" loading="lazy" />
                : <span className="blog-card-cover-fallback" />}
              {(post.categories || []).length > 0 && (
                <div className="blog-card-tags">
                  {post.categories.slice(0, 3).map((c) => (
                    <span key={c}>{categoryLabel(c)}</span>
                  ))}
                </div>
              )}
            </div>
            <h2>{post.title}</h2>
            {post.excerpt && <p>{post.excerpt}</p>}
            <footer>
              {post.authorAvatar && <img src={post.authorAvatar} alt="" />}
              <span>
                <strong>{post.authorName || 'GameTok'}</strong>
                <small>{formatDate(post.publishedAt || post.createdAt)}</small>
              </span>
            </footer>
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Single post ───────────────────────────────────────────────────────────────

export function BlogPost({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [post, setPost] = useState<Post | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let mounted = true;
    setState('loading');
    (async () => {
      try {
        const res: any = await postsApi.get(slug);
        if (!mounted) return;
        if (res?.post) {
          setPost(res.post);
          setState('ready');
        } else {
          setState('missing');
        }
      } catch {
        if (mounted) setState('missing');
      }
    })();
    return () => { mounted = false; };
  }, [slug]);

  const html = useMemo(
    () => (post?.bodyMarkdown ? renderMarkdown(post.bodyMarkdown) : ''),
    [post?.bodyMarkdown],
  );

  if (state === 'loading') return <p className="blog-empty">Loading…</p>;

  if (state === 'missing') {
    return (
      <article className="blog-post">
        <button className="blog-back" onClick={onBack}><ChevronLeft size={16} /> Back to Blog</button>
        <p className="blog-empty">That post doesn't exist, or hasn't been published yet.</p>
      </article>
    );
  }

  return (
    <article className="blog-post">
      <button className="blog-back" onClick={onBack}><ChevronLeft size={16} /> Back to Blog</button>

      <div className="blog-post-meta">
        {(post!.categories || []).slice(0, 1).map((c) => (
          <span key={c} className="blog-post-chip">{categoryLabel(c)}</span>
        ))}
        <time>{formatDate(post!.publishedAt || post!.createdAt)}</time>
      </div>

      <h1>{post!.title}</h1>

      {post!.coverImage && (
        <div className="blog-post-cover">
          <img src={post!.coverImage} alt="" />
        </div>
      )}

      {/* Sanitised above — see renderMarkdown. */}
      <div className="blog-post-body" dangerouslySetInnerHTML={{ __html: html }} />

      <footer className="blog-post-foot">
        {post!.authorAvatar && <img src={post!.authorAvatar} alt="" />}
        <span>{post!.authorName || 'GameTok'}</span>
      </footer>
    </article>
  );
}

/** Newest announcement, for the home hero's "read the announcement" link. */
export function useLatestAnnouncement() {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res: any = await postsApi.list({ kind: 'announcement', limit: 1 });
        if (mounted && res?.posts?.[0]?.slug) setSlug(res.posts[0].slug);
      } catch {
        // Non-fatal: the modal simply hides its read-more button.
      }
    })();
    return () => { mounted = false; };
  }, []);
  return slug;
}
