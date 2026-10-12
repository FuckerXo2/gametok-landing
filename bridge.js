/**
 * GameTok Bridge (v1.3.0)
 * https://gametok.co/bridge.js
 * 
 * Lightweight drop-in bridge for indie web games on GameTok.
 * - Auto-detects if running inside the GameTok mobile/web player
 * - Stays completely dormant when running standalone on your own site
 * - Automatically harmonizes viewport, touch actions, and margins inside GameTok
 * - Provides bidirectional postMessage communication (score, pause, resume)
 * - Player identity: GameTok.init() / GameTok.session() give your game the player and a
 *   short-lived signed session your server verifies with the GameTok API
 * - Multiplayer lobby: GameTok.match.* pairs players; your own server runs the gameplay
 *   and reports the result
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

  // Pending player-session requests, answered by the parent GameTok player.
  var pendingSessions = {};
  var SESSION_TIMEOUT_MS = 6000;
  var currentPlayer = null;
  var API_BASE = 'https://gametok-backend-267787411422.us-central1.run.app/api';
  var cachedSession = null; // { session, expiresAt }

  // Listen to incoming messages from the parent GameTok player
  window.addEventListener('message', function (event) {
    if (!event.data) return;
    var data = event.data;
    var type = data.type || data.action || '';

    if (type === 'GAMETOK_PLAYER_SESSION') {
      // Only the frame that embeds us may answer (not another window or iframe).
      if (event.source !== window.parent) return;
      var pending = pendingSessions[data.requestId];
      if (!pending) return;
      delete pendingSessions[data.requestId];
      clearTimeout(pending.timer);
      if (data.ok) {
        currentPlayer = data.player || null;
        cachedSession = { session: data.session, expiresAt: Date.now() + (data.expiresIn || 0) * 1000 };
        pending.resolve({ player: data.player, session: data.session, mode: data.mode, expiresIn: data.expiresIn });
      } else {
        pending.reject(bridgeError(data.code || 'SESSION_FAILED', data.error || 'GameTok could not create a player session'));
      }
      return;
    }

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

  function bridgeError(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
  }

  function requestPlayerSession() {
    return new Promise(function (resolve, reject) {
      if (!isInIframe) {
        reject(bridgeError('NOT_IN_GAMETOK', 'Not running inside GameTok. Test your game in the dashboard test player.'));
        return;
      }
      var requestId = 'gts_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
      var timer = setTimeout(function () {
        delete pendingSessions[requestId];
        reject(bridgeError('NO_RESPONSE', 'The GameTok player did not answer. Make sure the game is opened from GameTok.'));
      }, SESSION_TIMEOUT_MS);
      pendingSessions[requestId] = { resolve: resolve, reject: reject, timer: timer };
      postToParent({ type: 'GAMETOK_PLAYER_SESSION_REQUEST', requestId: requestId });
    });
  }

  // A session good for at least another minute (reused for lobby calls).
  function sessionToken() {
    if (cachedSession && cachedSession.expiresAt - Date.now() > 60000) return Promise.resolve(cachedSession.session);
    return requestPlayerSession().then(function (r) { return r.session; });
  }

  function lobby(method, path, body) {
    return sessionToken().then(function (token) {
      return fetch(API_BASE + path, {
        method: method,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: body ? JSON.stringify(body) : undefined
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = bridgeError(data.code || ('HTTP_' + res.status), data.error || 'Match request failed');
          if (data.match) err.match = data.match;
          throw err;
        }
        return data.match || null;
      });
    });
  }

  var sessionStartTime = Date.now();
  var sessionSent = false;

  function reportSession(score) {
    if (sessionSent) return;
    sessionSent = true;
    var duration = Math.round((Date.now() - sessionStartTime) / 1000);
    postToParent({
      type: 'GAMETOK_SESSION_END',
      durationSeconds: duration,
      score: typeof score === 'number' ? score : 0
    });
  }

  window.addEventListener('beforeunload', function () {
    reportSession();
  });

  // The public GameTok SDK API
  var GameTok = {
    isGameTok: isGameTok,
    version: '1.3.0',

    // Who's playing? Resolves { player: { id, name, avatar, guest }, session, mode, expiresIn }.
    // player.id is unique to this player in your game only. Send `session` to your server and
    // check it with POST https://gametok-backend-267787411422.us-central1.run.app/api/developer/sessions/verify
    // before trusting it. mode is 'test' in the dashboard test player and 'live' in GameTok.
    init: function () {
      return requestPlayerSession();
    },

    // A fresh session token (they last 15 minutes). Ask for one whenever you call your server.
    session: function () {
      return requestPlayerSession().then(function (r) {
        return { session: r.session, expiresIn: r.expiresIn };
      });
    },

    // The player from the last init()/session() call, or null.
    getPlayer: function () {
      return currentPlayer;
    },

    // Multiplayer lobby. GameTok pairs players (by code or quick match) and starts the match
    // when every seat is filled; your server runs the round and reports the winner. No stakes.
    // A match: { id, code, status: open|playing|done|cancelled|void, seats, players: [{ id, name }],
    //            me, winner, result, createdAt, startedAt, endsAt, mode }
    match: {
      create: function (opts) { return lobby('POST', '/matches', { seats: (opts && opts.seats) || 2 }); },
      join: function (code) { return lobby('POST', '/matches/join', { code: code }); },
      quick: function (opts) { return lobby('POST', '/matches/quick', { seats: (opts && opts.seats) || 2 }); },
      current: function () { return lobby('GET', '/matches/current'); },
      leave: function () {
        return lobby('GET', '/matches/current').then(function (m) {
          return m ? lobby('POST', '/matches/' + encodeURIComponent(m.id) + '/leave') : null;
        });
      },
      // Calls fn(match) whenever your current match changes (polls every 2 s). Returns unsubscribe().
      onUpdate: function (fn) {
        var stopped = false, lastJson = '', lastId = null, timer = null;
        function tick() {
          if (stopped) return;
          var req = lastId ? lobby('GET', '/matches/' + encodeURIComponent(lastId)) : lobby('GET', '/matches/current');
          req.then(function (m) {
            var json = JSON.stringify(m);
            if (json !== lastJson) { lastJson = json; try { fn(m); } catch (e) { console.error(e); } }
            // Follow a match until it finishes, then go back to watching for the next one.
            lastId = m && (m.status === 'open' || m.status === 'playing') ? m.id : null;
          }).catch(function () {}).then(function () { if (!stopped) timer = setTimeout(tick, 2000); });
        }
        tick();
        return function () { stopped = true; clearTimeout(timer); };
      }
    },

    // Notify GameTok that the game has finished loading and is ready
    ready: function () {
      postToParent({
        type: 'GAMETOK_READY',
        version: '1.3.0',
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
      reportSession(finalScore);
      postToParent(payload);
    },

    // Record custom analytics events
    recordEvent: function (eventName, eventData) {
      postToParent({
        type: 'GAMETOK_EVENT',
        event: eventName,
        data: eventData || {}
      });
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
