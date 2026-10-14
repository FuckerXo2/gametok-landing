// GameTok cloud save for games GameTok hosts. Loaded at the top of the game's page; only acts
// when the game is framed by gametok.co (the website), which stores the save on the player's
// account. The app does the same with its own injected script.
//
// - Save: every key the game writes to localStorage is reported to the parent page (debounced)
//   and when the page is hidden or closed.
// - Restore: on start the game asks the parent for its save; keys this device doesn't have are
//   written in and the game reloads once so it starts with them. Local progress is never replaced.
// - Hosted games share one storage origin, so only keys this game wrote are saved (tracked per
//   page path), never another game's.
(function () {
  if (window.parent === window || window.__gtCloudSave) return;
  window.__gtCloudSave = true;

  var PARENTS = /^https:\/\/(gametok\.co|games\.gametok\.co)$|^http:\/\/localhost(:\d+)?$/;
  var scope = location.pathname.replace(/[^/]*$/, '');
  var KEYS = '__gt_keys:' + scope;        // which keys this game owns, on this device
  var RESTORED = '__gt_restored:' + scope; // reloaded once already this visit
  var store;
  try { store = window.localStorage; if (!store) return; } catch (e) { return; }

  var setItem = store.setItem.bind(store);
  var removeItem = store.removeItem.bind(store);
  var clear = store.clear.bind(store);
  var owned = {};
  try { owned = JSON.parse(store.getItem(KEYS) || '{}') || {}; } catch (e) { owned = {}; }
  var remember = function () { try { setItem(KEYS, JSON.stringify(owned)); } catch (e) {} };

  var timer = null;
  var send = function () {
    timer = null;
    var data = {};
    for (var k in owned) {
      var v = store.getItem(k);
      if (v !== null) data[k] = v;
    }
    window.parent.postMessage({ type: 'GAMETOK_SAVE', storageData: data }, '*');
  };
  var schedule = function () { if (timer) clearTimeout(timer); timer = setTimeout(send, 2000); };

  store.setItem = function (key, value) {
    setItem(key, value);
    key = String(key);
    if (key.indexOf('__gt_') !== 0) { if (!owned[key]) { owned[key] = 1; remember(); } schedule(); }
  };
  store.removeItem = function (key) {
    removeItem(key);
    if (owned[key]) { delete owned[key]; remember(); schedule(); }
  };
  store.clear = function () {
    clear();
    owned = {}; remember(); schedule();
  };
  var flush = function () { if (timer) { clearTimeout(timer); send(); } };
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });

  addEventListener('message', function (event) {
    if (event.source !== window.parent || !PARENTS.test(event.origin)) return;
    var msg = event.data;
    if (!msg || msg.type !== 'GAMETOK_SAVE_DATA' || !msg.storageData || typeof msg.storageData !== 'object') return;
    var changed = false;
    for (var key in msg.storageData) {
      var value = String(msg.storageData[key]);
      if (key.indexOf('__gt_') === 0) continue;
      owned[key] = 1;
      // Fill in what this device doesn't have (a new phone or browser); never overwrite progress
      // made here, which may be newer than the saved copy.
      if (store.getItem(key) === null) { setItem(key, value); changed = true; }
    }
    remember();
    var already = false;
    try { already = sessionStorage.getItem(RESTORED) === '1'; } catch (e) {}
    if (changed && !already) {
      try { sessionStorage.setItem(RESTORED, '1'); } catch (e) {}
      location.reload();
    }
  });
  window.parent.postMessage({ type: 'GAMETOK_SAVE_REQUEST' }, '*');
})();
