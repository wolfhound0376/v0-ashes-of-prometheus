/* GENERATED from lib/languages.ts by scripts/build-languages-js.mjs — do not edit. */
"use strict";
var AopLanguages = (() => {
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

  // lib/languages.ts
  var languages_exports = {};
  __export(languages_exports, {
    BACKGROUND_LANGUAGE_CHOICES: () => BACKGROUND_LANGUAGE_CHOICES,
    CLASS_LANGUAGES: () => CLASS_LANGUAGES,
    LANGUAGES: () => LANGUAGES,
    SPECIES_LANGUAGES: () => SPECIES_LANGUAGES,
    canonicalLanguage: () => canonicalLanguage,
    choosableLanguages: () => choosableLanguages,
    gibberish: () => gibberish,
    hearDialogueRow: () => hearDialogueRow,
    languageGrant: () => languageGrant,
    languageInfo: () => languageInfo,
    listenerFromCharacter: () => listenerFromCharacter,
    parseLanguages: () => parseLanguages,
    partyListener: () => partyListener,
    renderSpeechFor: () => renderSpeechFor,
    rowLanguages: () => rowLanguages,
    sharedLanguages: () => sharedLanguages,
    understands: () => understands,
    understoodLanguages: () => understoodLanguages
  });
  var LANGUAGES = [
    { name: "Common", tier: "standard", speakers: "Humans", script: "Common" },
    { name: "Dwarvish", tier: "standard", speakers: "Dwarves", script: "Dwarvish" },
    { name: "Elvish", tier: "standard", speakers: "Elves", script: "Elvish" },
    { name: "Giant", tier: "standard", speakers: "Ogres, giants", script: "Dwarvish" },
    { name: "Gnomish", tier: "standard", speakers: "Gnomes", script: "Dwarvish" },
    { name: "Goblin", tier: "standard", speakers: "Goblinoids", script: "Dwarvish" },
    { name: "Halfling", tier: "standard", speakers: "Halflings", script: "Common" },
    { name: "Orc", tier: "standard", speakers: "Orcs", script: "Dwarvish" },
    { name: "Abyssal", tier: "exotic", speakers: "Demons", script: "Infernal" },
    { name: "Celestial", tier: "exotic", speakers: "Celestials", script: "Celestial" },
    { name: "Draconic", tier: "exotic", speakers: "Dragons, dragonborn", script: "Draconic" },
    { name: "Deep Speech", tier: "exotic", speakers: "Aboleths, cloakers", script: null },
    { name: "Infernal", tier: "exotic", speakers: "Devils", script: "Infernal" },
    { name: "Primordial", tier: "exotic", speakers: "Elementals", script: "Dwarvish" },
    { name: "Sylvan", tier: "exotic", speakers: "Fey creatures", script: "Elvish" },
    { name: "Undercommon", tier: "exotic", speakers: "Underdark traders", script: "Elvish" },
    { name: "Thieves' Cant", tier: "secret", speakers: "Rogues", script: null },
    { name: "Druidic", tier: "secret", speakers: "Druids", script: null }
  ];
  var BY_KEY = /* @__PURE__ */ new Map();
  for (const l of LANGUAGES) BY_KEY.set(keyOf(l.name), l.name);
  var ALIASES = {
    elven: "Elvish",
    dwarven: "Dwarvish",
    orcish: "Orc",
    goblinoid: "Goblin",
    gnome: "Gnomish",
    halfing: "Halfling",
    thievescant: "Thieves' Cant",
    cant: "Thieves' Cant",
    deepspeech: "Deep Speech",
    aquan: "Primordial",
    auran: "Primordial",
    ignan: "Primordial",
    terran: "Primordial",
    giantish: "Giant"
  };
  for (const [k, v] of Object.entries(ALIASES)) BY_KEY.set(k, v);
  function keyOf(s) {
    return s.toLowerCase().replace(/[^a-z]/g, "");
  }
  function canonicalLanguage(raw) {
    var _a;
    const k = keyOf(raw);
    if (!k) return null;
    return (_a = BY_KEY.get(k)) != null ? _a : null;
  }
  function languageInfo(name) {
    var _a;
    const c = canonicalLanguage(name);
    return c ? (_a = LANGUAGES.find((l) => l.name === c)) != null ? _a : null : null;
  }
  function parseLanguages(raw) {
    const out = { speaks: [], understandsOnly: [], telepathy: false, unknown: [] };
    if (!raw) return out;
    const text = Array.isArray(raw) ? raw.join(", ") : String(raw);
    const m = /\bunderstands?\b/i.exec(text);
    const mute = /can'?t speak|cannot speak/i.test(text);
    const segments = m ? [[text.slice(0, m.index), false], [text.slice(m.index + m[0].length), mute]] : [[text, false]];
    for (const [seg, onlyUnderstood] of segments) {
      for (let part of seg.split(/[;,]|\band\b|\bplus\b/i)) {
        part = part.trim();
        if (!part || /^[—–-]+$/.test(part)) continue;
        if (/telepathy/i.test(part)) {
          out.telepathy = true;
          continue;
        }
        const words = part.replace(/but can'?t speak( (it|them))?|but cannot speak( (it|them))?|it knew in life|the languages?|of its creator|any languages?/gi, " ").replace(/\(.*?\)/g, " ").trim();
        if (!words) continue;
        const c = canonicalLanguage(words);
        if (c) {
          const bucket = onlyUnderstood ? out.understandsOnly : out.speaks;
          if (!bucket.includes(c)) bucket.push(c);
        } else {
          out.unknown.push(words);
        }
      }
    }
    return out;
  }
  function understoodLanguages(p) {
    return [.../* @__PURE__ */ new Set([...p.speaks, ...p.understandsOnly])];
  }
  function understands(listener, spoken) {
    if (!spoken) return true;
    const lang = canonicalLanguage(spoken);
    if (!lang) return true;
    if (listener.comprehendAll) return true;
    const p = parseLanguages(listener.languages);
    if (p.telepathy) return true;
    return understoodLanguages(p).includes(lang);
  }
  function sharedLanguages(a, b) {
    const sa = parseLanguages(a).speaks;
    const ub = understoodLanguages(parseLanguages(b));
    return sa.filter((l) => ub.includes(l));
  }
  var PHONOLOGY = {
    // liquid, vowel-heavy, apostrophes
    Elvish: { onsets: ["l", "th", "s", "v", "n", "r", "f", "y", "el", "ae"], vowels: ["a", "e", "i", "ae", "ia", "\xEB", "ai"], codas: ["", "", "l", "n", "th", "s", "r"], joiner: "'" },
    // clipped, sibilant, clicky — drow trade tongue
    Undercommon: { onsets: ["z", "q", "xh", "v", "ss", "k", "dr", "jh"], vowels: ["a", "u", "i", "aa", "e"], codas: ["", "k", "z", "ss", "th", "x"] },
    Dwarvish: { onsets: ["kh", "d", "b", "g", "th", "br", "dr", "k"], vowels: ["a", "u", "o", "aa", "\xFC"], codas: ["k", "rd", "m", "n", "z", "rak", "d"] },
    Orc: { onsets: ["gr", "kr", "g", "z", "sh", "b", "dr", "u"], vowels: ["a", "u", "o", "\xFA"], codas: ["k", "g", "sh", "rg", "z", "t", "nk"] },
    Goblin: { onsets: ["sk", "gr", "n", "z", "kr", "sn", "b"], vowels: ["i", "a", "e", "ee"], codas: ["k", "t", "z", "g", "p", ""] },
    Giant: { onsets: ["h", "j", "g", "st", "b", "th"], vowels: ["o", "a", "u", "oo"], codas: ["m", "rn", "d", "ld", "n"] },
    Gnomish: { onsets: ["b", "f", "w", "n", "p", "t", "g"], vowels: ["i", "o", "e", "ee", "ou"], codas: ["", "b", "n", "ck", "p", "ll"] },
    Halfling: { onsets: ["m", "p", "b", "t", "w", "h"], vowels: ["o", "a", "i", "e"], codas: ["", "n", "m", "t", "ck"] },
    Draconic: { onsets: ["sv", "th", "x", "ka", "dr", "ss", "v"], vowels: ["a", "i", "u", "ae", "o"], codas: ["x", "ss", "th", "r", "k", ""] },
    Infernal: { onsets: ["z", "b", "m", "kr", "ash", "v", "n"], vowels: ["a", "e", "o", "u"], codas: ["l", "z", "th", "x", "r"] },
    Abyssal: { onsets: ["gh", "ch", "kh", "x", "zh", "r"], vowels: ["u", "a", "aa", "\xFC"], codas: ["kh", "gh", "x", "rr", "z"] },
    Celestial: { onsets: ["s", "l", "h", "m", "el", "v"], vowels: ["a", "e", "i", "ae", "ai"], codas: ["", "l", "n", "el", "m"] },
    Primordial: { onsets: ["v", "h", "r", "sh", "k", "w"], vowels: ["o", "u", "a", "oo"], codas: ["", "sh", "r", "m", "h"] },
    Sylvan: { onsets: ["f", "w", "l", "s", "t", "fi"], vowels: ["i", "ee", "a", "ia", "o"], codas: ["", "l", "n", "s", "f"] },
    "Deep Speech": { onsets: ["ng", "th", "kl", "mm", "r", "gh"], vowels: ["u", "o", "\xFC", "uu"], codas: ["ng", "th", "lk", "mm", "gh"], joiner: "-" },
    "Thieves' Cant": { onsets: ["d", "sn", "k", "b", "f", "l"], vowels: ["o", "a", "i"], codas: ["", "ck", "b", "nt", "ff"] },
    Druidic: { onsets: ["d", "r", "w", "o", "gw", "ll"], vowels: ["y", "a", "o", "ae", "w"], codas: ["", "n", "dd", "r", "th"] },
    Common: { onsets: ["b", "d", "m", "t", "s", "p", "l", "r"], vowels: ["a", "e", "i", "o", "u"], codas: ["", "n", "t", "s", "r"] }
  };
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed;
    return () => {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function pick(r, arr) {
    return arr[Math.floor(r() * arr.length)];
  }
  function scrambleWord(word, lang, ph) {
    const r = rng(hash(lang + "|" + word.toLowerCase()));
    const syllables = Math.max(1, Math.round(word.length / 3));
    let out = "";
    for (let i = 0; i < syllables; i++) {
      if (i > 0 && ph.joiner && r() < 0.18) out += ph.joiner;
      out += pick(r, ph.onsets) + pick(r, ph.vowels);
      if (i === syllables - 1 || r() < 0.35) out += pick(r, ph.codas);
    }
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      out = out.charAt(0).toUpperCase() + out.slice(1);
    }
    if (word === word.toUpperCase() && word.length > 1 && /[A-Z]/.test(word)) out = out.toUpperCase();
    return out;
  }
  function gibberish(text, language) {
    var _a, _b;
    const lang = (_a = canonicalLanguage(language)) != null ? _a : language;
    const ph = (_b = PHONOLOGY[lang]) != null ? _b : PHONOLOGY.Common;
    const out = [];
    for (const chunk of text.split(/(\[[^\]]*\]|\*[^*]*\*)/)) {
      if (!chunk) continue;
      if (/^(\[[^\]]*\]|\*[^*]*\*)$/.test(chunk)) {
        out.push(chunk);
        continue;
      }
      out.push(chunk.replace(/[A-Za-zÀ-ÿ']+/g, (w) => /^'+$/.test(w) ? w : scrambleWord(w.replace(/'/g, ""), lang, ph)));
    }
    return out.join("");
  }
  function renderSpeechFor(text, spoken, listener) {
    const language = spoken ? canonicalLanguage(spoken) : null;
    if (understands(listener, spoken)) return { text, understood: true, language };
    return { text: gibberish(text, language != null ? language : String(spoken)), understood: false, language };
  }
  var SPECIES_LANGUAGES = {
    Human: { fixed: ["Common"], choices: 1 },
    Dwarf: { fixed: ["Common", "Dwarvish"], choices: 0 },
    Elf: { fixed: ["Common", "Elvish"], choices: 1 },
    // Forge's Elf is the High Elf (wizard cantrip) → Extra Language
    Drow: { fixed: ["Common", "Elvish"], choices: 0 },
    Halfling: { fixed: ["Common", "Halfling"], choices: 0 },
    Gnome: { fixed: ["Common", "Gnomish"], choices: 0 },
    Dragonborn: { fixed: ["Common", "Draconic"], choices: 0 },
    Tiefling: { fixed: ["Common", "Infernal"], choices: 0 },
    "Half-Elf": { fixed: ["Common", "Elvish"], choices: 1 },
    "Half-Orc": { fixed: ["Common", "Orc"], choices: 0 },
    Aarakocra: { fixed: ["Common", "Aarakocra", "Primordial"], choices: 0 },
    // EE: Auran → Primordial dialect
    "Deep Gnome": { fixed: ["Common", "Gnomish", "Undercommon"], choices: 0 },
    Genasi: { fixed: ["Common", "Primordial"], choices: 0 },
    Goliath: { fixed: ["Common", "Giant"], choices: 0 }
  };
  var BACKGROUND_LANGUAGE_CHOICES = {
    Acolyte: 2,
    Sage: 2,
    Hermit: 1,
    Noble: 1,
    Charlatan: 0,
    Criminal: 0,
    Entertainer: 0,
    Sailor: 0,
    Soldier: 0,
    Artisan: 1,
    Merchant: 1,
    Scribe: 2,
    Guide: 1,
    Farmer: 0,
    Guard: 0,
    Wayfarer: 0
  };
  var CLASS_LANGUAGES = {
    Rogue: ["Thieves' Cant"],
    Druid: ["Druidic"]
  };
  function languageGrant(opts) {
    var _a;
    const fixed = [];
    const sources = [];
    let choices = 0;
    const sp = opts.species ? SPECIES_LANGUAGES[opts.species] : null;
    if (sp) {
      fixed.push(...sp.fixed);
      choices += sp.choices;
      if (sp.choices) sources.push(`${opts.species}: ${sp.choices} of your choice`);
    } else {
      fixed.push("Common");
    }
    const bg = opts.background ? (_a = BACKGROUND_LANGUAGE_CHOICES[opts.background]) != null ? _a : 0 : 0;
    if (bg) {
      choices += bg;
      sources.push(`${opts.background}: ${bg} of your choice`);
    }
    for (const l of opts.clazz && CLASS_LANGUAGES[opts.clazz] || []) fixed.push(l);
    return { fixed: [...new Set(fixed)], choices, sources };
  }
  function choosableLanguages(known) {
    const k = new Set(known.map((x) => {
      var _a;
      return (_a = canonicalLanguage(x)) != null ? _a : x;
    }));
    return LANGUAGES.filter((l) => l.tier !== "secret" && !k.has(l.name));
  }
  var COMPREHEND_RE = /comprehend languages|tongues/i;
  function listenerFromCharacter(row) {
    if (!row) return { languages: null };
    const conditions = Array.isArray(row.conditions) ? row.conditions : [];
    const comprehendAll = conditions.some((c) => {
      var _a;
      return COMPREHEND_RE.test(typeof c === "string" ? c : String((_a = c == null ? void 0 : c.name) != null ? _a : ""));
    });
    const raw = row.languages;
    return { languages: Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw : null, comprehendAll };
  }
  function partyListener(rows) {
    if (!rows.length) return { languages: null };
    const sets = rows.map((r) => {
      const l = listenerFromCharacter(r);
      if (l.comprehendAll) return null;
      return new Set(understoodLanguages(parseLanguages(l.languages)));
    });
    const real = sets.filter((s) => s !== null);
    if (!real.length) return { languages: null, comprehendAll: true };
    const common = [...real[0]].filter((l) => real.every((s) => s.has(l)));
    return { languages: common };
  }
  function rowLanguages(row, listener) {
    var _a;
    const out = [];
    for (const seg of (_a = row.speech_segments) != null ? _a : []) {
      const lang = seg.lang ? canonicalLanguage(seg.lang) : null;
      if (lang && !out.some((o) => o.lang === lang)) out.push({ lang, understood: listener ? understands(listener, lang) : true });
    }
    return out;
  }
  function hearDialogueRow(row, listener) {
    const segs = row.speech_segments;
    if (!(segs == null ? void 0 : segs.length) || !segs.some((s) => s.lang)) return row;
    let text = row.text;
    let changed = false;
    let cursor = 0;
    const nextSegs = segs.map((seg) => {
      if (!seg.lang || understands(listener, seg.lang)) return seg;
      const heard = gibberish(seg.line, seg.lang);
      const at = text.indexOf(seg.line, cursor);
      if (at >= 0) {
        text = text.slice(0, at) + heard + text.slice(at + seg.line.length);
        cursor = at + heard.length;
      }
      changed = true;
      return { ...seg, line: heard };
    });
    return changed ? { ...row, text, speech_segments: nextSegs } : row;
  }
  return __toCommonJS(languages_exports);
})();
