/* Test copies are silent until Sam turns the sound on himself.
 *
 * WHY THIS EXISTS (Sam, 2026-10-22): "test previews shouldn't have any sound unless I'm actively the one
 * checking them out." That night three parallel sessions each served a local copy of the painted map and
 * opened it in the Claude app's browser pane. The map unlocks its audio on ANY click or key press, and a
 * session driving a preview clicks and presses keys, so all three copies played combat audio at once and
 * Sam heard fights start "spontaneously" in games nobody was playing. The live database was quiet the whole
 * time: it was the previews, not the game.
 *
 * WHAT IT DOES. On the live site (*.playacartagena.com) nothing: the game sounds exactly as before. Anywhere
 * else (localhost, a Vercel preview, an artifact preview) every sound starts muted:
 *   - Web Audio: each AudioContext's `destination` is swapped for a master gain held at 0, so every voice,
 *     effect, lullaby and hum the page builds is silenced at one point without touching the page's code.
 *   - <audio> / new Audio(): forced muted when they play.
 *   - The browser's speech voice: dropped.
 * A small "Test copy · sound off" pill sits in the corner. Clicking it is the only way to turn sound on, and
 * the choice lasts for that tab only, so every new preview tab starts silent again.
 *
 * FOR AGENT SESSIONS: never click the pill. It is Sam's switch. Pages driven by automation
 * (navigator.webdriver) stay silent and do not show it.
 *
 * Load it FIRST, before any page script, so it is in place before the page makes its first AudioContext:
 *   <script src="/test-copy-silence.js"></script>
 */
(function () {
  "use strict";
  var host = location.hostname;
  var LIVE = host === "playacartagena.com" || /\.playacartagena\.com$/.test(host);
  if (LIVE || window.__aopTestSilence) return;

  var KEY = "aop-test-copy-sound";
  var automated = !!navigator.webdriver;
  var on = false;
  try { on = !automated && sessionStorage.getItem(KEY) === "on"; } catch (e) {}

  var masters = [];
  var media = [];
  var pill = null;

  function apply() {
    for (var i = 0; i < masters.length; i++) {
      try { masters[i].gain.value = on ? 1 : 0; } catch (e) {}
    }
    for (var j = 0; j < media.length; j++) {
      try { media[j].muted = !on; } catch (e) {}
    }
    if (!on && window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) {} }
    render();
  }

  // ---- Web Audio: one master gain per context, in front of the speakers ----
  ["AudioContext", "webkitAudioContext"].forEach(function (name) {
    var Base = window[name];
    if (typeof Base !== "function") return;
    var real = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Base.prototype), "destination")
      || Object.getOwnPropertyDescriptor(Base.prototype, "destination");
    if (!real || !real.get) return;
    var masterOf = new WeakMap();
    var Silenced = class extends Base {
      constructor() {
        super(...arguments);
        var m = Base.prototype.createGain.call(this);
        m.gain.value = on ? 1 : 0;
        m.connect(real.get.call(this));
        masterOf.set(this, m);
        masters.push(m);
      }
      get destination() { return masterOf.get(this) || real.get.call(this); }
    };
    try { window[name] = Silenced; } catch (e) {}
  });

  // ---- <audio> and new Audio(): muted when they start ----
  var play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (media.indexOf(this) < 0) media.push(this);
    try { this.muted = !on; } catch (e) {}
    return play.apply(this, arguments);
  };

  // ---- the browser's own speech voice ----
  if (window.speechSynthesis && speechSynthesis.speak) {
    var speak = speechSynthesis.speak.bind(speechSynthesis);
    try { speechSynthesis.speak = function (u) { if (on) speak(u); }; } catch (e) {}
  }

  // ---- Sam's switch ----
  function render() {
    if (!pill) return;
    pill.textContent = on ? "🔊 Test copy · sound on" : "🔇 Test copy · sound off";
    pill.setAttribute("aria-pressed", String(on));
    pill.style.opacity = on ? "0.55" : "0.9";
  }
  function mount() {
    if (automated || pill || !document.body) return;
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
      apply();
    });
    document.body.appendChild(pill);
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  window.__aopTestSilence = { isOn: function () { return on; } };
})();
