// ../stubdir/speech-playback.ts
async function playSpeech() {
  return { finished: Promise.resolve("ended"), stop: () => {
  } };
}

// ../queue-under-test.ts
var ORDER = { player: 0, dm: 1, npc: 2 };
function createSpeechQueue(play) {
  let nextId = 1;
  const waiting = [];
  let current = null;
  let pumping = false;
  const rankOf = (e) => ORDER[e.rank] ?? 99;
  function settle(entry, reason) {
    if (entry.settled) return;
    entry.settled = true;
    entry.onEnd?.(reason);
  }
  function takeNext() {
    if (!waiting.length) return void 0;
    let best = 0;
    for (let i = 1; i < waiting.length; i++) {
      if (rankOf(waiting[i]) < rankOf(waiting[best])) best = i;
    }
    return waiting.splice(best, 1)[0];
  }
  async function pump() {
    if (pumping || current) return;
    pumping = true;
    try {
      for (; ; ) {
        const entry = takeNext();
        if (!entry) return;
        if (entry.cancelled) {
          settle(entry, "stopped");
          continue;
        }
        if (!entry.blob) {
          try {
            entry.blob = await entry.fetch() ?? void 0;
          } catch {
            entry.blob = void 0;
          }
        }
        if (!entry.blob) {
          settle(entry, "error");
          continue;
        }
        const playback = await play(entry.blob, entry.offset);
        current = Object.assign(entry, { playback, startedAt: Date.now() });
        if (entry.offset === 0) entry.onStart?.();
        const reason = await playback.finished;
        current = null;
        if (entry.pausing) {
          entry.pausing = false;
          continue;
        }
        settle(entry, reason);
      }
    } finally {
      pumping = false;
      if (!current && waiting.length) void pump();
    }
  }
  function speak2(req) {
    const entry = {
      ...req,
      id: nextId++,
      offset: 0,
      pausing: false,
      cancelled: false,
      settled: false
    };
    if (current && rankOf(entry) < rankOf(current) && !current.pausing) {
      const heard = (Date.now() - current.startedAt) / 1e3;
      current.offset = current.offset + Math.max(0, heard - 0.25);
      current.pausing = true;
      waiting.push(current);
      current.playback.stop();
    }
    waiting.push(entry);
    void pump();
    return {
      cancel: () => {
        entry.cancelled = true;
        const i = waiting.indexOf(entry);
        if (i >= 0) {
          waiting.splice(i, 1);
          settle(entry, "stopped");
        }
        if (current === entry) {
          current.playback.stop();
        }
      }
    };
  }
  function silenceAll2() {
    for (const e of waiting.splice(0)) settle(e, "stopped");
    if (current) {
      current.cancelled = true;
      current.playback.stop();
    }
  }
  return { speak: speak2, silenceAll: silenceAll2, isSpeaking: () => current !== null };
}
var queue = createSpeechQueue(playSpeech);
var speak = queue.speak;
var silenceAll = queue.silenceAll;
var isSpeaking = queue.isSpeaking;
function speakBlob(rank, blob, opts = {}) {
  let settleFinished = () => {
  };
  const finished = new Promise((resolve) => settleFinished = resolve);
  const handle = speak({
    rank,
    speaker: opts.speaker,
    fetch: async () => blob,
    onStart: opts.onStart,
    onEnd: (reason) => settleFinished(reason)
  });
  return { finished, stop: () => handle.cancel() };
}
export {
  createSpeechQueue,
  isSpeaking,
  silenceAll,
  speak,
  speakBlob
};
