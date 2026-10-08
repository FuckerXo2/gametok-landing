/**
 * GameTok Bridge (v1.0.0)
 * https://gametok.co/bridge.js
 * 
 * Lightweight drop-in bridge for indie web games on GameTok.
 * - Auto-detects if running inside the GameTok mobile/web player
 * - Stays completely dormant when running standalone on your own site
 * - Automatically harmonizes viewport, touch actions, and margins inside GameTok
 * - Provides bidirectional postMessage communication (score, pause, resume)
 * - Auto-associates your creator profile via script data attributes
 */
(function () {
  'use strict';

  // Read configuration from the current script tag
  var currentScript = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf('bridge.js') !== -1) {
        return scripts[i];
      }
    }
    return null;
  })();

  var creatorName = (currentScript && currentScript.getAttribute('data-creator-name')) || '';
  var creatorHandle = (currentScript && currentScript.getAttribute('data-creator-handle')) || '';
  var gameTitle = (currentScript && currentScript.getAttribute('data-game-title')) || '';

  // Environment detection: are we inside GameTok?
  var isInIframe = (function () {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  })();

  var urlParams = new URLSearchParams(window.location.search);
  var hasGameTokParam = urlParams.get('gametok') === '1' || urlParams.get('gt') === '1';
  var hasReferrer = document.referrer && (
    document.referrer.indexOf('gametok.co') !== -1 ||
    document.referrer.indexOf('games.gametok.co') !== -1 ||
    document.referrer.indexOf('localhost') !== -1
  );

  var isGameTok = isInIframe || hasGameTokParam || hasReferrer;

  // Apply seamless responsive viewport styles inside GameTok iframe
  if (isGameTok) {
    var injectStyle = function () {
      var style = document.createElement('style');
      style.id = 'gametok-bridge-styles';
      style.textContent = [
        'html, body {',
        '  margin: 0 !important;',
        '  padding: 0 !important;',
        '  width: 100% !important;',
        '  height: 100% !important;',
        '  overflow: hidden !important;',
        '  -webkit-touch-callout: none !important;',
        '  -webkit-user-select: none !important;',
        '  user-select: none !important;',
        '  touch-action: manipulation !important;',
        '  background-color: transparent !important;',
        '}',
        'canvas {',
        '  display: block !important;',
        '  touch-action: none !important;',
        '}'
      ].join('\n');
      if (document.head) {
        document.head.appendChild(style);
      } else {
        document.addEventListener('DOMContentLoaded', function () {
          document.head.appendChild(style);
        });
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectStyle);
    } else {
      injectStyle();
    }
  }

  // Event handlers registry
  var listeners = {
    pause: [],
    resume: [],
    mute: [],
    unmute: [],
    restart: []
  };

  // Listen to incoming messages from the parent GameTok player
  window.addEventListener('message', function (event) {
    if (!event.data) return;
    var data = event.data;
    var type = data.type || data.action || '';

    if (type === 'gt-pause' || type === 'GAMETOK_PAUSE') {
      listeners.pause.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    } else if (type === 'gt-resume' || type === 'GAMETOK_RESUME') {
      listeners.resume.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    } else if (type === 'gt-mute' || type === 'GAMETOK_MUTE') {
      listeners.mute.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    } else if (type === 'gt-unmute' || type === 'GAMETOK_UNMUTE') {
      listeners.unmute.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    } else if (type === 'gt-restart' || type === 'GAMETOK_RESTART') {
      listeners.restart.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    }
  });

  // Post message safely to parent window
  function postToParent(message) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, '*');
    }
  }

  // The public GameTok SDK API
  var GameTok = {
    isGameTok: isGameTok,
    version: '1.0.0',

    // Notify GameTok that the game has finished loading and is ready
    ready: function () {
      postToParent({
        type: 'GAMETOK_READY',
        version: '1.0.0',
        creatorName: creatorName,
        creatorHandle: creatorHandle,
        title: gameTitle || document.title
      });
    },

    // Submit player score to GameTok global leaderboards & rewards
    submitScore: function (score) {
      if (typeof score !== 'number' && typeof score !== 'string') return;
      var numScore = parseInt(score, 10);
      if (isNaN(numScore)) return;

      postToParent({
        type: 'GAMETOK_SCORE',
        score: numScore
      });
    },

    // Notify GameTok that game over state has been reached
    gameOver: function (finalScore) {
      var payload = { type: 'GAMETOK_GAME_OVER' };
      if (typeof finalScore === 'number') {
        payload.score = finalScore;
      }
      postToParent(payload);
    },

    // Register callback listeners (pause, resume, mute, unmute, restart)
    on: function (eventName, callback) {
      if (listeners[eventName] && typeof callback === 'function') {
        listeners[eventName].push(callback);
      }
    },

    // Get current creator metadata attached to this game
    getCreatorInfo: function () {
      return {
        creatorName: creatorName,
        creatorHandle: creatorHandle,
        gameTitle: gameTitle || document.title
      };
    }
  };

  // Expose to window
  window.GameTok = GameTok;

  // Auto-send ready event once DOM is loaded
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(GameTok.ready, 100);
  } else {
    window.addEventListener('load', function () {
      setTimeout(GameTok.ready, 100);
    });
  }
})();
