// THE STANDING RULE (Sam, 2026-10-30): "make sure options are actual options that should be available to you."
// Asserted against the BUILT page, so it covers what ships.
import { readFileSync } from "node:fs";
const page = readFileSync("public/velkynvelve-walk/index.html", "utf8");
let bad = 0;
const ok = (c, m) => { console.log(`${c ? "ok  " : "FAIL"}  ${m}`); if (!c) bad++; };

// 1. Every option whose label names thieves' tools is behind a check that the hero HAS them.
const toolRows = page.split("\n").filter(l => /add\((["'`]).*?(Pick the lock|Disarm the needle)/.test(l));
ok(toolRows.length >= 3, `found ${toolRows.length} tool-check options to police`);
for (const l of toolRows) {
  const label = (/add\((["'`])(.*?)\1/.exec(l) || [])[2] || l.trim().slice(0, 40);
  ok(/hasThievesTools\(/.test(l), `"${label}" is behind hasThievesTools()`);
}

// 2. hasThievesTools asks what the hero CARRIES, not what their sheet is good at: a prisoner's kit is on the stash.
ok(/function hasThievesTools\(a\)\{ return !APP \|\| carries\(a, THIEVES_TOOLS\); \}/.test(page),
   "hasThievesTools asks the hero's own carried gear");
ok(/function carries\(a, name\)\{[\s\S]{0,260}?GEAR\[a\.id\]/.test(page),
   "carries() reads that hero's gear, not the party's");

// 3. A spell needing hands is refused by the IRONS, not merely by being on a work detail.
ok(/function handsBound\(\)\{ return inChains\(\) \|\| manacled\(\); \}/.test(page),
   "handsBound() = on a detail OR in irons");
ok(/if \(handsBound\(\) && !voiceOnly\(sp\.components\)\)/.test(page),
   "the components gate asks handsBound(), so the pen and a detail answer alike");
ok(/laborCastSeen\(caster, target\)/.test(page) && /if \(inChains\(\)\) laborCastSeen/.test(page),
   "being SEEN by the escort still asks inChains() — that is the escort, not the cuffs");

// 4. The pen gate still only offers what a prisoner can take.
ok(/if \(hasThievesTools\(leader\)\) add\("Pick the lock"/.test(page), "the pen gate's lock pick needs tools");
ok(/if \(hasPenKey\(\)\) add\("Unlock it with the pen key"/.test(page), "the pen key option needs the key");
ok(/if \(dmScreen\(\)\) add\("DM: Jorlan opens it"/.test(page), "the DM option is still the DM's alone");
// 5. An option a rule refuses SAYS SO rather than vanishing (Sam, 2026-10-30: "why am I unable to examine it",
//    then "I like tried and caster"). The menu disables a row whose handler is null and shows its sub-line.
ok(/if \(fn\) b\.onclick = [\s\S]{0,80}?else b\.disabled = true;/.test(page),
   "a null handler renders the row disabled, with its reason as the sub-line");
ok(/if \(wardReach\(L\) && !state\.wardBroken\)\{/.test(page),
   "the ward row is built on reach alone — caster and tried no longer hide it");
ok(/if \(!wardCaster\(L\)\)\s*\n\s*x\("Study the ward sigil"[\s\S]{0,120}?no magic of your own[\s\S]{0,60}?null\)/.test(page),
   "a non-caster sees the row, disabled, told they have no magic for it");
ok(/else if \(wardAlreadyRead\(L\)\)\s*\n\s*x\("Study the ward sigil"[\s\S]{0,140}?read what you can[\s\S]{0,80}?null\)/.test(page),
   "a hero who already read it sees the row, disabled, told why");
ok(/else\s*\n\s*x\("Study the ward sigil"[\s\S]{0,260}?\(\) => studySigilAsk\(\)\)/.test(page),
   "everyone else still gets the live roll");

// 6. One study per hero, reopened only by LEARNING something — not by resting (Sam, 2026-10-30).
ok(/function wardArcanaKey\(h\)\{/.test(page), "what is remembered is the hero's Arcana standing, not a bare flag");
ok(/state\.wardTried\[h\.id\] = wardArcanaKey\(h\);/.test(page), "the attempt stamps that standing");
ok(/if \(was === true\) state\.wardTried\[h\.id\] = wardArcanaKey\(h\);/.test(page),
   "a legacy `true` migrates to today's standing: still blocked now, reopened by a level-up");
ok(!/(longRest|onLongRest|restDone|afterRest)[\s\S]{0,160}?wardTried/.test(page)
   && !/wardTried[\s\S]{0,160}?(longRest|onLongRest|restDone|afterRest)/.test(page),
   "no rest path clears wardTried — only a change in the reader reopens it");

// 7. Help reaches the ward, and 5e settles it against the not-a-wizard disadvantage.
ok(/function wardHelpers\(h\)\{/.test(page), "the map knows who is close enough to lend a hand");
ok(/helpNext && helpNext\.by !== h\.id && now < helpNext\.until/.test(page),
   "studySigil spends a pending Help, which only mapCheck used to");
ok(/const adv = \(helped \? 1 : 0\) \+ \(wardWizard\(h\) \? 0 : -1\);/.test(page),
   "help and not-being-a-wizard cancel, as 5e has advantage and disadvantage cancel");
ok(/function studySigilAsk\(\)\{/.test(page) && /\(\) => studySigilAsk\(\)\)/.test(page),
   "the offer comes up in front of the one study, not as a button to know about");

console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);
