/* GENERATED from lib/walk-world.ts by scripts/build-one-world-js.mjs — do not edit. */
"use strict";
var AopOneWorld = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // lib/walk-world.ts
  var walk_world_exports = {};
  __export(walk_world_exports, {
    LIMITS: () => LIMITS,
    MISSES_BEFORE_RESYNC: () => MISSES_BEFORE_RESYNC,
    ONLINE_MS: () => ONLINE_MS,
    canon: () => canon,
    cleanPatch: () => cleanPatch,
    driverOf: () => driverOf,
    emptyWorld: () => emptyWorld,
    fingerprint: () => fingerprint,
    heartbeatVerdict: () => heartbeatVerdict,
    isOnline: () => isOnline,
    mayWriteHero: () => mayWriteHero,
    seededRandom: () => seededRandom,
    seededRoll: () => seededRoll,
    worldDigest: () => worldDigest
  });
  var ONLINE_MS = 12e3;
  var MISSES_BEFORE_RESYNC = 2;
  var LIMITS = { stateBytes: 64e3, heroesPerPatch: 12, coord: 4e3 };
  function canon(v) {
    if (v === null || v === void 0) return "null";
    if (typeof v === "number") return Number.isFinite(v) ? JSON.stringify(v) : "null";
    if (typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map((x) => x === void 0 || typeof x === "function" ? "null" : canon(x)).join(",") + "]";
    if (typeof v === "object") {
      const o = v;
      const keys = Object.keys(o).filter((k) => o[k] !== void 0 && typeof o[k] !== "function").sort();
      return "{" + keys.map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
    }
    return "null";
  }
  function fingerprint(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }
  function worldDigest(plate, state) {
    return fingerprint(canon({ plate: plate != null ? plate : null, state: state != null ? state : {} }));
  }
  function seededRandom(seed) {
    let a = parseInt(fingerprint(seed), 16) >>> 0;
    return () => {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function seededRoll(expr, seed) {
    const rnd = seededRandom(seed);
    let total = 0;
    for (const term of String(expr).replace(/\s+/g, "").match(/[+-]?[^+-]+/g) || []) {
      const sign = term[0] === "-" ? -1 : 1;
      const t = term.replace(/^[+-]/, "");
      const m = t.match(/^(\d*)d(\d+)$/);
      if (m) {
        const n = +m[1] || 1;
        for (let i = 0; i < n; i++) total += sign * (1 + Math.floor(rnd() * +m[2]));
      } else total += sign * (+t || 0);
    }
    return Math.max(0, total);
  }
  function isOnline(seat, now) {
    return !!seat && typeof seat.at === "number" && now - seat.at <= ONLINE_MS;
  }
  function driverOf(ownerCid, seats, now) {
    const s = seats || {};
    if (ownerCid && isOnline(s[ownerCid], now)) return ownerCid;
    if (isOnline(s.dm, now)) return "dm";
    let best = null;
    let bestSeat = Infinity;
    for (const k of Object.keys(s).sort()) {
      if (k === "dm" || !isOnline(s[k], now)) continue;
      const n = typeof s[k].seat === "number" ? s[k].seat : 99;
      if (n < bestSeat) {
        bestSeat = n;
        best = k;
      }
    }
    return best;
  }
  function mayWriteHero(hero, caller, callerIsDm, seats, now) {
    if (callerIsDm) return true;
    if (hero.cid && hero.cid === caller) return true;
    return driverOf(hero.cid, seats, now) === caller;
  }
  function heartbeatVerdict(local, server, misses) {
    if (local.digest === server.digest) return { status: "in-step", resync: false, misses: 0 };
    if (local.dirty || local.travelling) return { status: "catching-up", resync: false, misses };
    const m = misses + 1;
    if (m >= MISSES_BEFORE_RESYNC) return { status: "catching-up", resync: true, misses: 0 };
    return { status: "catching-up", resync: false, misses: m };
  }
  var SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;
  var num = (v, lim = LIMITS.coord) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim ? v : null;
  var int = (v, lo, hi) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  function cleanPatch(raw, by) {
    if (!raw || typeof raw !== "object") return { error: "patch must be an object" };
    const r = raw;
    const out = {};
    if (r.state !== void 0) {
      if (!r.state || typeof r.state !== "object" || Array.isArray(r.state)) return { error: "state must be an object" };
      let size = 0;
      try {
        size = JSON.stringify(r.state).length;
      } catch (e) {
        return { error: "state is not JSON" };
      }
      if (size > LIMITS.stateBytes) return { error: "state too large" };
      out.state = JSON.parse(JSON.stringify(r.state));
    }
    if (r.plate !== void 0) {
      const p = int(r.plate, 0, 999);
      if (p === null) return { error: "bad plate" };
      out.plate = p;
    }
    if (r.travel !== void 0) {
      const t = r.travel;
      const seq = num(t == null ? void 0 : t.seq, Number.MAX_SAFE_INTEGER), from = int(t == null ? void 0 : t.from, 0, 999), to = int(t == null ? void 0 : t.to, 0, 999), zone = int(t == null ? void 0 : t.zone, -1, 999);
      if (!t || seq === null || from === null || to === null || zone === null) return { error: "bad travel" };
      out.travel = { seq, from, to, zone, by, at: Date.now() };
    }
    if (r.heroes !== void 0) {
      if (!r.heroes || typeof r.heroes !== "object" || Array.isArray(r.heroes)) return { error: "heroes must be an object" };
      const entries = Object.entries(r.heroes);
      if (entries.length > LIMITS.heroesPerPatch) return { error: "too many heroes" };
      const heroes = {};
      for (const [slug, v] of entries) {
        if (!SLUG.test(slug)) return { error: `bad hero ${slug}` };
        const h = v;
        const x = num(h == null ? void 0 : h.x), y = num(h == null ? void 0 : h.y), tx = num(h == null ? void 0 : h.tx), ty = num(h == null ? void 0 : h.ty);
        const face = int(h == null ? void 0 : h.face, 0, 7), plate = int(h == null ? void 0 : h.plate, 0, 999), seq = num(h == null ? void 0 : h.seq, Number.MAX_SAFE_INTEGER);
        if (x === null || y === null || tx === null || ty === null || face === null || plate === null || seq === null) return { error: `bad hero ${slug}` };
        const cid = typeof h.cid === "string" && h.cid.length <= 64 ? h.cid : null;
        heroes[slug] = { x, y, tx, ty, face, plate, seq, by, cid };
      }
      out.heroes = heroes;
    }
    if (!out.state && !out.heroes && out.plate === void 0 && !out.travel) return { error: "nothing to change" };
    return { patch: out };
  }
  function emptyWorld(runId) {
    return { campaign_run_id: runId, version: 0, plate: null, state: {}, heroes: {}, travel: null, seats: {} };
  }
  return __toCommonJS(walk_world_exports);
})();
