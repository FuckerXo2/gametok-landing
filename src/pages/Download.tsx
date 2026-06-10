import { useEffect } from 'react';
import type { CSSProperties } from 'react';

// Smart download redirect. gametok.co/download is served by this SPA (the root is the web app), so a
// static file alone gets bypassed by the SPA fallback — this route owns /download and redirects the
// visitor to their store. iOS -> App Store, Android -> Play Store, desktop/in-app -> manual buttons.
const IOS_STORE = 'https://apps.apple.com/app/gametok/id6757498584';
const ANDROID_STORE = 'https://play.google.com/store/apps/details?id=com.vogeza';

export default function Download() {
  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const isAndroid = /android/i.test(ua);
    const target = isIOS ? IOS_STORE : isAndroid ? ANDROID_STORE : null;
    if (!target) return;
    // tiny delay so the page paints first (and in-app browsers like Instagram/WhatsApp don't drop it)
    const timer = window.setTimeout(() => window.location.replace(target), 400);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div style={overlay}>
      <div style={{ width: 44, height: 44, border: '4px solid rgba(255,255,255,0.12)', borderTopColor: '#a855f7', borderRadius: '50%', margin: '0 auto 22px', animation: 'gtspin 1s linear infinite' }} />
      <style>{'@keyframes gtspin{to{transform:rotate(360deg)}}'}</style>
      <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Taking you to GameTOK…</h1>
      <p style={{ opacity: 0.7, margin: '0 0 24px' }}>If you're not redirected automatically, choose your store:</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <a href={IOS_STORE} style={btn}>App Store</a>
        <a href={ANDROID_STORE} style={btn}>Google Play</a>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9999, background: '#0d0d14', color: '#fff',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  textAlign: 'center', padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, Inter, sans-serif',
};
const btn: CSSProperties = {
  background: 'linear-gradient(135deg, #a855f7, #ec4899)', color: '#fff', padding: '14px 28px',
  borderRadius: 12, textDecoration: 'none', fontWeight: 700, fontSize: 15,
};
