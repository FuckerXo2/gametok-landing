import { useEffect, useState } from 'react';
import './MobileGate.css';

const DISMISS_KEY = 'gt_mobile_gate_dismissed_v1';
export const IOS_STORE_URL = 'https://apps.apple.com/app/gametok/id6757498584';
export const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.vogeza';

type Platform = 'ios' | 'android' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('mobileGate') === '1') return true;
  const ua = navigator.userAgent || '';
  const uaMobile = /iPhone|iPad|iPod|Android/i.test(ua);
  return uaMobile && window.innerWidth < 900;
}

type Props = {
  onContinueInBrowser: () => void;
};

export default function MobileGate({ onContinueInBrowser }: Props) {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>('other');

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    if (!dismissed && isMobileViewport()) {
      setPlatform(detectPlatform());
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const isIos = platform === 'ios';
  const isAndroid = platform === 'android';
  const storeUrl = isIos ? IOS_STORE_URL : ANDROID_STORE_URL;
  const appLabel = isIos ? 'GameTOK for iOS' : isAndroid ? 'GameTOK for Android' : 'GameTOK App';
  const tagline = isIos
    ? 'Get the full GameTOK experience on your iPhone.'
    : isAndroid
    ? 'Get the full GameTOK experience on your Android.'
    : 'Get the full GameTOK experience in our app.';

  const handleContinueInApp = () => {
    if (platform === 'other') return;
    if (isAndroid) {
      // Chrome intent URL: deep-links into the installed app, silently
      // falls back to the Play Store if not installed. No error dialogs.
      const fallback = encodeURIComponent(ANDROID_STORE_URL);
      window.location.href =
        `intent://open#Intent;scheme=gametok;package=com.vogeza;S.browser_fallback_url=${fallback};end`;
      return;
    }
    // iOS: probing gametok:// (top-level or iframe) always surfaces
    // Safari's native "address is invalid" dialog when the app isn't
    // installed — no JS-visible way to suppress it. Deep-linking installed
    // users is the Smart App Banner's job (apple-itunes-app meta in
    // index.source.html); the store page itself shows "Open" when the app
    // is already installed.
    window.location.href = storeUrl;
  };

  const handleContinueInBrowser = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
    onContinueInBrowser();
  };

  return (
    <div className="mobile-gate" role="dialog" aria-modal="true" aria-label="Get the GameTOK app">
      <div className="mobile-gate-bg" aria-hidden="true" />
      <div className="mobile-gate-overlay" aria-hidden="true" />
      <div className="mobile-gate-content">
        <div className="mobile-gate-top">
          <h1 className="mobile-gate-wordmark">GAMETOK</h1>
          <p className="mobile-gate-tagline">{tagline}</p>
        </div>

        <div className="mobile-gate-center">
          <img
            className="mobile-gate-app-icon"
            src="/about/icon.png"
            alt="GameTOK"
          />
          <div className="mobile-gate-app-label">{appLabel}</div>
        </div>

        <div className="mobile-gate-bottom">
          <button
            type="button"
            className="mobile-gate-primary"
            onClick={handleContinueInApp}
            disabled={platform === 'other'}
          >
            Continue in App
          </button>

          <button
            type="button"
            className="mobile-gate-secondary"
            onClick={handleContinueInBrowser}
          >
            Continue in browser
          </button>
        </div>
      </div>
    </div>
  );
}
