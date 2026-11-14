(function () {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const NS = (root.NS = root.NS || {});

  const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
  let uidCounter = 0;

  const U = {
    SHARP_NAMES,
    FLAT_NAMES,
    BLACK_PCS,

    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    },

    lerp(a, b, t) {
      return a + (b - a) * t;
    },

    uid(prefix) {
      uidCounter += 1;
      return `${prefix || "id"}-${uidCounter.toString(36)}-${Math.floor(Math.random() * 1679616).toString(36)}`;
    },

    isBlack(midi) {
      return BLACK_PCS.has(((midi % 12) + 12) % 12);
    },

    pc(midi) {
      return ((Math.round(midi) % 12) + 12) % 12;
    },

    octave(midi) {
      return Math.floor(Math.round(midi) / 12) - 1;
    },

    midiToName(midi, preferFlat) {
      const n = Math.round(midi);
      const names = preferFlat ? FLAT_NAMES : SHARP_NAMES;
      return `${names[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
    },

    pcName(pitchClass, preferFlat) {
      const n = ((Math.round(pitchClass) % 12) + 12) % 12;
      return (preferFlat ? FLAT_NAMES : SHARP_NAMES)[n];
    },

    nameToMidi(name, fallbackOctave) {
      if (typeof name === "number") return Math.round(name);
      const match = /^([A-Ga-g])([#b]?)(-?\d+)?$/.exec(String(name || "").trim());
      if (!match) return null;
      const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()];
      const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
      const octave = match[3] === undefined ? (fallbackOctave === undefined ? 4 : fallbackOctave) : parseInt(match[3], 10);
      return (octave + 1) * 12 + base + accidental;
    },

    midiToFreq(midi) {
      return 440 * Math.pow(2, (midi - 69) / 12);
    },

    formatPosition(beat, beatsPerBar) {
      const bpb = beatsPerBar || 4;
      const safeBeat = Math.max(0, beat);
      const bar = Math.floor(safeBeat / bpb) + 1;
      const within = safeBeat % bpb;
      const beatNumber = Math.floor(within) + 1;
      const tick = Math.floor((within % 1) * 960);
      return {
        bar: String(bar).padStart(3, "0"),
        beat: String(beatNumber).padStart(2, "0"),
        tick: String(tick).padStart(3, "0"),
      };
    },

    formatClock(seconds) {
      const total = Math.max(0, Math.round(seconds));
      const mm = Math.floor(total / 60);
      const ss = total % 60;
      return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    },

    deepClone(value) {
      if (typeof structuredClone === "function") {
        try { return structuredClone(value); } catch (_) { /* fall through */ }
      }
      return JSON.parse(JSON.stringify(value));
    },

    debounce(fn, wait) {
      let timer = 0;
      return function debounced(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
      };
    },

    escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },

    downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || "download";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },

    readAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
        reader.readAsText(file, "utf-8");
      });
    },

    readAsArrayBuffer(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
        reader.readAsArrayBuffer(file);
      });
    },

    makeRandom(seed) {
      let state = (seed >>> 0) || 0x9e3779b9;
      return function random() {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    hashString(value) {
      let hash = 2166136261;
      const text = String(value || "");
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    },

    safeFilename(name, fallback) {
      const cleaned = String(name || "")
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, " ")
        .trim();
      if (!cleaned || cleaned === "." || cleaned === "..") return fallback || "neonscore";
      return cleaned;
    },

    beatToSeconds(beat, bpm) {
      return (beat * 60) / Math.max(1, bpm);
    },

    secondsToBeat(seconds, bpm) {
      return (seconds * Math.max(1, bpm)) / 60;
    },
  };

  NS.util = U;
  if (typeof module !== "undefined" && module.exports) module.exports = U;
})();
