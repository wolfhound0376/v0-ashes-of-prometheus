/* Three sound rules, one script, loaded FIRST on every page that can make a noise.
 *
 * RULE 1: TEST COPIES ARE SILENT until Sam turns the sound on himself.
 * WHY (Sam, 2026-10-22): "test previews shouldn't have any sound unless I'm actively the one checking them
 * out." That night three parallel sessions each served a local copy of the painted map and opened it in the
 * Claude app's browser pane; each clicked around, the map unlocked its audio, and Sam heard three fights start
 * at once in games nobody was playing.
 * On the live site (*.playacartagena.com) this rule does nothing. Anywhere else (localhost, a Vercel preview,
 * a page inside a Claude window) every sound starts muted:
 *   - Web Audio: each AudioContext's `destination` is swapped for a master gain held at 0.
 *   - <audio> / <video> / new Audio(): muted when they load, when they play (including `autoPlay`, which
 *     starts WITHOUT calling play()), and re-muted if page code later sets `muted = false`.
 *   - The browser's speech voice: dropped.
 * A small "Test copy · sound off" pill sits in the corner. Clicking it is the only way to turn sound on, and
 * the choice lasts for that tab only, so every new preview tab starts silent again.
 *
 * RULE 2: A HIDDEN PAGE IS SILENT, everywhere, the live site included.
 * WHY (Sam, 2026-10-26): the intro score kept playing from a window nobody could find. When a page's tab is
 * hidden (another tab in front, window minimised, app in the background) every film, song and voice it is
 * playing pauses, and its Web Audio is suspended. They pick up where they stopped when the page is shown
 * again. Sound that tries to start while the page is hidden waits until it is shown.
 *
 * RULE 3: A PAGE NOBODY IS USING IS SILENT, everywhere, the live site included.
 * WHY (Sam, 2026-11-20): "What happened to not playing music if the active tab is not maximized and in use".
 * He had the live game open in the Claude app's browser pane and was typing in the chat beside it. The pane
 * was on screen, so rule 2 never fired, and the address was the live one, so rule 1 never did either.
 * "In use" means the page has the keyboard: it is the window, and the tab, you last clicked or typed in.
 * A page that is on screen but not in use (a window beside the one you are working in, a second monitor,
 * the Claude pane while you type in the chat, another app in front) goes SILENT BUT KEEPS RUNNING: its
 * songs, films and voices are muted, not paused, so a player who clicks over to another window stays in step
 * with the table and simply hears nothing until they click back. (Rule 2 still pauses a page nobody can see.)
 * Sam's ruling on scope: "everywhere", not just inside the Claude app, knowing it means that with two game
 * windows open only the one last clicked is heard.
 *   - A framed page (the map inside /velkynvelve, The Pit inside /pit) asks the TOP page whether it is in
 *     use, so clicking the page around the frame does not silence the frame.
 *   - Losing the keyboard for under half a second (a click on the address bar and straight back) is ignored.
 *   - A page that loads without the keyboard starts silent.
 *
 * HISTORY. Until 2026-10-26 this file loaded only on the static pages (Underwalk, cave, camp). The React app
 * (/intro, /awaken, the dashboard) never loaded it, and the intro film's autoplay and its later
 * `video.muted = false` both went straight past the old hooks. app/layout.tsx now loads it for every React
 * page, and the media hooks below cover all three paths.
 *
 * FOR AGENT SESSIONS: never click the pill. It is Sam's switch. Pages driven by automation
 * (navigator.webdriver) stay silent and do not show it. Close your preview tab when you are done.
 *
 * Load it FIRST, before any page script, so it is in place before the page makes its first AudioContext:
 *   <script src="/test-copy-silence.js"></script>        (static pages)
 *   <Script src="/test-copy-silence.js" strategy="beforeInteractive" />   (app/layout.tsx)
 */
(function () {
  "use strict";
  if (window.__aopTestSilence) return;

  var host = location.hostname;
  var LIVE = host === "playacartagena.com" || /\.playacartagena\.com$/.test(host);
  var TEST = !LIVE;

  var KEY = "aop-test-copy-sound";
  var automated = !!navigator.webdriver;
  var on = !TEST; // the live site is never muted by rule 1
  if (TEST) {
    try { on = !automated && sessionStorage.getItem(KEY) === "on"; } catch (e) {}
  }

  var masters = [];   // rules 1 and 3: one gain per AudioContext, in front of the speakers
  var ours = [];      // rule 3, live site: media WE muted, so we never un-mute what the page muted itself
  var quiet = false;  // rule 3: on screen but not in use
  var quietTimer = null;
  var contexts = [];  // rule 2: every AudioContext, to suspend while hidden
  var media = [];     // every media element we have seen
  var heldMedia = []; // paused (or kept from starting) by rule 2
  var heldCtx = [];   // suspended by rule 2
  var pill = null;

  function hidden() { return document.visibilityState === "hidden"; }
  function seen(el) { if (media.indexOf(el) < 0) media.push(el); }
  function hold(el) { if (heldMedia.indexOf(el) < 0) heldMedia.push(el); }

  // Rule 3's question. A framed page asks the top page (same origin); if it cannot, it answers for itself.
  function focused() {
    try { if (window.top && window.top !== window) return window.top.document.hasFocus(); } catch (e) {}
    try { return document.hasFocus(); } catch (e) { return true; }
  }
  function audible() { return on && !quiet; }
  function muteOurs(el) {
    if (el.muted) return;
    try { el.muted = true; } catch (e) { return; }
    if (!TEST && ours.indexOf(el) < 0) ours.push(el);
  }

  function applyMute() {
    var a = audible(), i;
    for (i = 0; i < masters.length; i++) {
      try { masters[i].gain.value = a ? 1 : 0; } catch (e) {}
    }
    if (TEST) {
      for (i = 0; i < media.length; i++) {
        try { media[i].muted = !a; } catch (e) {}
      }
      if (!on && window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) {} }
    } else if (a) {
      var back = ours; ours = [];
      for (i = 0; i < back.length; i++) { try { back[i].muted = false; } catch (e) {} }
    } else {
      for (i = 0; i < media.length; i++) muteOurs(media[i]);
    }
    render();
  }

  // ---- rule 3: in use, or not ----
  function setQuiet(q) {
    if (quiet === q) return;
    quiet = q;
    applyMute();
    if (window.speechSynthesis) { try { q ? speechSynthesis.pause() : (hidden() || speechSynthesis.resume()); } catch (e) {} }
  }
  // `now` skips the half-second grace: used at load and when a hidden page is shown, so nothing blips.
  function check(now) {
    var want = !hidden() && !focused();
    if (!want) {
      if (quietTimer) { clearTimeout(quietTimer); quietTimer = null; }
      setQuiet(false);
      return;
    }
    if (quiet) return;
    if (now === true) { setQuiet(true); return; }
    if (!quietTimer) quietTimer = setTimeout(function () {
      quietTimer = null;
      if (!hidden() && !focused()) setQuiet(true);
    }, 450);
  }
  quiet = !hidden() && !focused();

  // ---- Web Audio: remember every context, and put a master gain in front of the speakers ----
  ["AudioContext", "webkitAudioContext"].forEach(function (name) {
    var Base = window[name];
    if (typeof Base !== "function") return;
    var real = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Base.prototype), "destination")
      || Object.getOwnPropertyDescriptor(Base.prototype, "destination");
    var masterOf = new WeakMap();
    var Tracked = class extends Base {
      constructor() {
        super(...arguments);
        contexts.push(this);
        if (real && real.get) {
          var m = Base.prototype.createGain.call(this);
          m.gain.value = audible() ? 1 : 0;
          m.connect(real.get.call(this));
          masterOf.set(this, m);
          masters.push(m);
        }
        if (hidden()) {
          var self = this;
          try { Base.prototype.suspend.call(self).then(function () { heldCtx.push(self); }, function () {}); } catch (e) {}
        }
      }
      get destination() { return masterOf.get(this) || (real && real.get ? real.get.call(this) : super.destination); }
    };
    try { window[name] = Tracked; } catch (e) {}
  });

  // ---- media started by code: play() ----
  var play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    seen(this);
    if (TEST) { try { this.muted = !audible(); } catch (e) {} }
    else if (!audible()) muteOurs(this);
    if (hidden()) {
      // Rule 2: don't start now; start when the page is shown. Resolve, so callers that await play()
      // simply wait for the media's own 'ended' as they would have anyway.
      hold(this);
      return Promise.resolve();
    }
    return play.apply(this, arguments);
  };

  // ---- media started by the browser (autoPlay) or un-muted later by page code ----
  // Media events don't bubble, but a capturing listener on the document sees them for every element in it.
  function muteIfTest(e) {
    var el = e.target;
    if (!(el instanceof HTMLMediaElement)) return;
    seen(el);
    if (!audible()) muteOurs(el); // rule 1 (test copy, sound off) or rule 3 (not in use)
  }
  document.addEventListener("loadstart", muteIfTest, true);
  document.addEventListener("volumechange", muteIfTest, true);
  document.addEventListener("play", function (e) {
    muteIfTest(e);
    var el = e.target;
    if (el instanceof HTMLMediaElement && hidden()) {
      try { el.pause(); } catch (x) {}
      hold(el);
    }
  }, true);

  // ---- the browser's own speech voice ----
  if (window.speechSynthesis && speechSynthesis.speak) {
    var speak = speechSynthesis.speak.bind(speechSynthesis);
    try { speechSynthesis.speak = function (u) { if (on) speak(u); }; } catch (e) {}
  }

  // ---- rule 2: hidden pauses, shown resumes ----
  document.addEventListener("visibilitychange", function () {
    var i;
    if (hidden()) {
      for (i = 0; i < media.length; i++) {
        var el = media[i];
        if (!el.paused && !el.ended) { try { el.pause(); } catch (e) {} hold(el); }
      }
      for (i = 0; i < contexts.length; i++) {
        var c = contexts[i];
        if (c.state === "running" && heldCtx.indexOf(c) < 0) {
          heldCtx.push(c);
          try { c.suspend().catch(function () {}); } catch (e) {}
        }
      }
      if (window.speechSynthesis) { try { speechSynthesis.pause(); } catch (e) {} }
    } else {
      check(true); // shown, but is it in use? decide before anything resumes
      var ms = heldMedia; heldMedia = [];
      for (i = 0; i < ms.length; i++) {
        try { var p = play.call(ms[i]); if (p && p.catch) p.catch(function () {}); } catch (e) {}
      }
      var cs = heldCtx; heldCtx = [];
      for (i = 0; i < cs.length; i++) {
        try { cs[i].resume().catch(function () {}); } catch (e) {}
      }
      if (window.speechSynthesis) { try { speechSynthesis.resume(); } catch (e) {} }
    }
  });

  // ---- rule 3: watch the keyboard ----
  // Events make it prompt; the slow tick catches what no event reports (focus moving between frames).
  window.addEventListener("focus", check);
  window.addEventListener("blur", check);
  try {
    if (window.top && window.top !== window) {
      window.top.addEventListener("focus", check);
      window.top.addEventListener("blur", check);
    }
  } catch (e) {}
  setInterval(check, 500);

  // ---- Sam's switch (test copies only) ----
  function render() {
    if (!pill) return;
    pill.textContent = on ? "🔊 Test copy · sound on" : "🔇 Test copy · sound off";
    pill.setAttribute("aria-pressed", String(on));
    pill.style.opacity = on ? "0.55" : "0.9";
  }
  function mount() {
    if (!TEST || automated || pill || !document.body) return;
    pill = document.createElement("button");
    pill.type = "button";
    pill.title = "This is a test copy, so it starts silent. Click to hear it (this tab only).";
    pill.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:2147483647;padding:5px 10px;"
      + "border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(10,8,14,.82);color:#e9e2d0;"
      + "font:600 12px/1.2 system-ui,-apple-system,sans-serif;cursor:pointer;letter-spacing:.02em";
    ["pointerdown", "mousedown", "touchstart", "click"].forEach(function (ev) {
      pill.addEventListener(ev, function (e) { e.stopPropagation(); }, false);
    });
    pill.addEventListener("click", function () {
      on = !on;
      try { sessionStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {}
      applyMute();
    });
    document.body.appendChild(pill);
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  window.__aopTestSilence = { isOn: function () { return on; }, isTestCopy: TEST, isQuiet: function () { return quiet; } };
})();
