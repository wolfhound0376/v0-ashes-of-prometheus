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
console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);
