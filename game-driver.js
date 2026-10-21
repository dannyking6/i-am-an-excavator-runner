/* game-driver.js — neutral offline runtime bridge.
 *
 * Replaces the portal SDK surface the game expects with a local, dependency
 * free implementation. It performs NO network calls, registers no analytics
 * and holds no external references: the game runs completely offline.
 *
 * The `ad` surface is the important one. Games hand it callbacks (for
 * example "adBreakDone" / "adViewed") and wait for them before continuing.
 * A no-op there freezes the game at the next interstitial, so every callback
 * is invoked immediately with a benign status.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------ storage */
  var mem = Object.create(null);

  function lsGet(k) {
    try {
      var v = window.localStorage.getItem(k);
      return v === null ? (k in mem ? mem[k] : null) : v;
    } catch (e) {
      return k in mem ? mem[k] : null;
    }
  }
  function lsSet(k, v) {
    try {
      window.localStorage.setItem(k, v);
    } catch (e) {
      mem[k] = v;
    }
  }
  function lsRemove(k) {
    try {
      window.localStorage.removeItem(k);
    } catch (e) {
      delete mem[k];
    }
  }
  function lsGetJSON(k, dflt) {
    var raw = lsGet(k);
    if (raw === null || raw === undefined) return dflt;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return dflt;
    }
  }
  function lsSetJSON(k, v) {
    try {
      lsSet(k, JSON.stringify(v));
    } catch (e) {
      /* ignore */
    }
  }

  /* --------------------------------------------------------- callbacks */
  function fire(list, status) {
    if (!list) return;
    if (typeof list === 'function') {
      try {
        list(status);
      } catch (e) {
        /* a broken callback must never break the game */
      }
      return;
    }
    if (typeof list.length === 'number') {
      for (var i = 0; i < list.length; i++) {
        if (typeof list[i] === 'function') {
          try {
            list[i](status);
          } catch (e) {
            /* ignore */
          }
        }
      }
    }
  }

  /* -------------------------------------------------------------- ads */
  /* Interstitials resolve instantly and report "dismissed". */
  function adBreak(opts) {
    opts = opts || {};
    fire(opts.beforeAdBreak, 'dismissed');
    fire(opts.afterAdBreak, 'dismissed');
    fire(opts.adViewed, 'dismissed');
    fire(opts.adBreakDone, 'dismissed');
    fire(opts.adCompleted, 'dismissed');
    if (typeof opts.onAdEnd === 'function') {
      try {
        opts.onAdEnd('dismissed');
      } catch (e) {
        /* ignore */
      }
    }
    if (typeof opts.cb === 'function') {
      try {
        opts.cb('dismissed');
      } catch (e) {
        /* ignore */
      }
    }
    return 'dismissed';
  }

  /* --------------------------------------------------------- audio */
  /* The game keeps full control of its own audio; these are safe no-ops. */
  var audio = {
    play: function () {},
    stop: function () {},
    pause: function () {},
    resume: function () {},
    mute: function () {},
    unmute: function () {},
    setVolume: function () {},
    sfx: function () {},
    bgSound: function () {},
    music: function () {},
    isMuted: function () {
      return false;
    }
  };

  /* ------------------------------------------------------- public API */
  var GameDriver = {
    version: '1.0.0',
    offline: true,
    audio: audio,
    ad: {
      show: adBreak,
      showBanner: function () {},
      hideBanner: function () {},
      showInterstitial: adBreak,
      showRewarded: adBreak,
      isRewardedReady: function () {
        return true;
      },
      isInterstitialReady: function () {
        return true;
      }
    },
    storage: {
      getItem: lsGet,
      setItem: lsSet,
      removeItem: lsRemove,
      getJSON: lsGetJSON,
      setJSON: lsSetJSON
    },
    gameStart: function () {},
    levelStart: function () {},
    levelEnd: function () {},
    gameOver: function () {},
    happyTime: function () {},
    setProgress: function () {},
    firstPlay: function () {},
    showFreeFrame: function () {},
    showFreeGame: function () {}
  };
  window.GameDriver = GameDriver;

  /* ------------------------------------------ portal SDK compatibility */
  /* Older builds call a global SDK entry point directly. Keep the same call
     shapes, but make every one of them local and instant. */
  function makeSdk(name) {
    var fn = function () {
      return sdk;
    };
    var sdk = {
      showBanner: function () {},
      hideBanner: function () {},
      showInterstitial: adBreak,
      showRewardedVideo: adBreak,
      showRewarded: adBreak,
      isRewardedVideoReady: function () {
        return true;
      },
      isInterstitialReady: function () {
        return true;
      },
      play: function () {},
      pause: function () {},
      resume: function () {},
      mute: function () {},
      unmute: function () {},
      gameStart: function () {},
      gameEnd: function () {},
      happytime: function () {},
      happytimeDelayed: function () {},
      setProgress: function () {},
      firstPlay: function () {},
      onEvent: function () {},
      logEvent: function () {},
      showFreeFrame: function () {},
      showFreeGame: function () {},
      name: name
    };
    ['showBanner', 'hideBanner', 'showInterstitial', 'showRewardedVideo', 'showRewarded', 'play', 'pause', 'resume', 'mute', 'unmute', 'gameStart', 'gameEnd', 'happytime', 'setProgress', 'firstPlay', 'showFreeFrame', 'showFreeGame'].forEach(function (m) {
      fn[m] = sdk[m];
    });
    return fn;
  }

  window.gdApi = makeSdk('gdApi');
  window.GD = window.gdApi;
  window.GD_OPTIONS = {
    gameId: '',
    onEvent: function (event) {
      var name = event && event.name;
      if (!name) return;
      try {
        window.dispatchEvent(new CustomEvent(name, { detail: event }));
      } catch (e) {
        /* CustomEvent unavailable */
      }
    }
  };
  window.GD_ShowAds = function () {};
  window.GD_TriggerPlay = function () {};
  window.On_GameEnd = function () {};
  window.adsState = 0;
  window.enableADS = false;
  window.GameStarted = true;
  window.show_freeFrame = function () {};
  window.dataLayer = window.dataLayer || [];
  window.productKey = 'game';
  window.productTitle = '';
  window.isAdsEnabled = false;

  /* The engine calls this once it is ready to cache the build. There is no
     service worker in an offline build, so it is a no-op. */
  window.RegisterServiceWorker = function () {};

  /* -------------------------------------------------- crash recovery */
  /* Some builds show a "please reload the page" dialog when an unexpected
     error is raised. Reload once, with a cooldown, so a persistent error
     cannot turn into a reload loop. */
  (function () {
    var lastReload = 0;
    var COOLDOWN = 30000;
    window.addEventListener('error', function () {
      /* keep the console honest, but do not break the game */
    });
    var check = setInterval(function () {
      var text = '';
      try {
        text = document.body ? document.body.innerText || '' : '';
      } catch (e) {
        return;
      }
      if (!text) return;
      var low = text.toLowerCase();
      var wantsReload =
        low.indexOf('reload the page') >= 0 ||
        low.indexOf('please refresh') >= 0 ||
        low.indexOf('unexpected error') >= 0;
      if (wantsReload) {
        var now = Date.now();
        if (now - lastReload > COOLDOWN) {
          lastReload = now;
          clearInterval(check);
          window.location.reload();
        }
      }
    }, 1500);
    setTimeout(function () {
      clearInterval(check);
    }, 120000);
  })();
})();
