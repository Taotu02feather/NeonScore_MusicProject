(function () {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const NS = (root.NS = root.NS || {});
  const U = NS.util;

  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
  };

  const QUALITIES = {
    "": [0, 4, 7],
    m: [0, 3, 7],
    "7": [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    m7: [0, 3, 7, 10],
    m9: [0, 3, 7, 10, 14],
    "9": [0, 4, 7, 10, 14],
    add9: [0, 4, 7, 14],
    sus2: [0, 2, 7],
    sus4: [0, 5, 7],
    dim: [0, 3, 6],
    aug: [0, 4, 8],
    "6": [0, 4, 7, 9],
    m6: [0, 3, 7, 9],
  };

  const PROGRESSIONS = {
    minor: [
      { id: "classic", name: "经典 80s", roman: "i – VI – III – VII", degrees: [0, 8, 3, 10], qualities: ["m", "", "", ""] },
      { id: "bittersweet", name: "忧伤叙事", roman: "i – VI – iv – V", degrees: [0, 8, 5, 7], qualities: ["m", "", "m", ""] },
      { id: "dark", name: "暗潮下行", roman: "i – VII – VI – V", degrees: [0, 10, 8, 7], qualities: ["m", "", "", ""] },
      { id: "drive", name: "推进感", roman: "i – iv – VI – V", degrees: [0, 5, 8, 7], qualities: ["m", "m", "", ""] },
      { id: "epic", name: "史诗上行", roman: "i – III – VI – VII", degrees: [0, 3, 8, 10], qualities: ["m", "", "", ""] },
    ],
    major: [
      { id: "classic", name: "经典 80s", roman: "I – V – vi – IV", degrees: [0, 7, 9, 5], qualities: ["", "", "m", ""] },
      { id: "axis", name: "流行轴线", roman: "I – vi – IV – V", degrees: [0, 9, 5, 7], qualities: ["", "m", "", ""] },
      { id: "bright", name: "明亮上扬", roman: "I – IV – V – vi", degrees: [0, 5, 7, 9], qualities: ["", "", "", "m"] },
      { id: "nostalgic", name: "怀旧色彩", roman: "I – iii – vi – IV", degrees: [0, 3, 9, 5], qualities: ["", "m", "m", ""] },
      { id: "city", name: "城市流行", roman: "IV – V – iii – vi", degrees: [5, 7, 3, 9], qualities: ["", "", "m", "m"] },
    ],
  };

  const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  function nearestMidiToPc(pitchClass, center) {
    const pc = ((Math.round(pitchClass) % 12) + 12) % 12;
    const base = Math.round(center == null ? 60 : center);
    let best = pc;
    let bestDistance = Infinity;
    for (let octave = -1; octave <= 9; octave += 1) {
      const midi = octave * 12 + pc;
      if (midi < 0 || midi > 127) continue;
      const distance = Math.abs(midi - base);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = midi;
      }
    }
    return best;
  }

  function parseChord(chord) {
    if (!chord) return { rootPc: 9, quality: "m", intervals: QUALITIES.m, name: "Am" };
    const match = /^([A-G][#b]?)(.*)$/.exec(String(chord).trim());
    if (!match) return { rootPc: 9, quality: "m", intervals: QUALITIES.m, name: "Am" };
    const rootMidi = U.nameToMidi(`${match[1]}4`);
    const suffix = (match[2] || "").trim();
    const quality = Object.prototype.hasOwnProperty.call(QUALITIES, suffix) ? suffix : "";
    return {
      rootPc: ((rootMidi % 12) + 12) % 12,
      quality,
      intervals: QUALITIES[quality],
      name: `${match[1]}${quality}`,
    };
  }

  function chordRootMidi(chord, minMidi, maxMidi) {
    const parsed = parseChord(chord);
    const min = minMidi == null ? 33 : minMidi;
    const max = maxMidi == null ? 44 : maxMidi;
    let candidate = nearestMidiToPc(parsed.rootPc, min);
    while (candidate < min) candidate += 12;
    while (candidate > max) candidate -= 12;
    if (candidate < min) candidate += 12;
    return candidate;
  }

  function chordIntervals(chord) {
    return parseChord(chord).intervals.slice();
  }

  function chordPitchClasses(chord) {
    const parsed = parseChord(chord);
    const seen = new Set();
    const pcs = [];
    parsed.intervals.forEach((interval) => {
      const pc = (parsed.rootPc + interval) % 12;
      if (!seen.has(pc)) {
        seen.add(pc);
        pcs.push(pc);
      }
    });
    return pcs;
  }

  /** Voice a chord in a comfortable register, choosing the inversion closest to the previous chord. */
  function voiceChord(chord, center, previous) {
    const parsed = parseChord(chord);
    const middle = center == null ? 60 : center;
    const intervals = parsed.intervals.slice(0, 4);
    let best = null;
    let bestScore = Infinity;

    for (let rootMidi = 43; rootMidi <= 67; rootMidi += 1) {
      const notes = [];
      intervals.forEach((interval) => {
        let note = rootMidi + interval;
        if (note < 48) note += 12;
        if (note > 79) note -= 12;
        notes.push(note);
      });
      notes.sort((a, b) => a - b);
      const unique = Array.from(new Set(notes));
      if (unique.length < 3) continue;
      const mean = unique.reduce((sum, n) => sum + n, 0) / unique.length;
      const spread = unique[unique.length - 1] - unique[0];
      let score = Math.abs(mean - middle) * 0.32 + Math.max(0, spread - 19) * 1.4;
      if (previous && previous.length === unique.length) {
        let movement = 0;
        for (let i = 0; i < unique.length; i += 1) movement += Math.abs(unique[i] - previous[i]);
        score += movement * 0.9;
      }
      if (score < bestScore) {
        bestScore = score;
        best = unique;
      }
    }
    if (best) return best;

    const root = nearestMidiToPc(parsed.rootPc, middle);
    return Array.from(new Set(parsed.intervals.map((interval) => root + interval)));
  }

  function chordTones(chord, center, span) {
    const parsed = parseChord(chord);
    const root = nearestMidiToPc(parsed.rootPc, center == null ? 67 : center);
    const max = root + (span == null ? 17 : span);
    const notes = [];
    for (let octave = 0; octave <= 2; octave += 1) {
      parsed.intervals.forEach((interval) => {
        const note = root + interval + octave * 12;
        if (note >= 55 && note <= Math.min(96, max + 12) && !notes.includes(note)) notes.push(note);
      });
    }
    notes.sort((a, b) => a - b);
    return notes.length ? notes : [root, root + 7, root + 12];
  }

  function preferFlats(rootPc, mode) {
    const relativeMajor = mode === "minor" ? (rootPc + 3) % 12 : rootPc;
    return [1, 3, 5, 8, 10].includes(relativeMajor);
  }

  function buildProgression(rootPc, mode, presetId, bars) {
    const modeDefs = PROGRESSIONS[mode] || PROGRESSIONS.minor;
    const def = modeDefs.find((entry) => entry.id === presetId) || modeDefs[0];
    const length = Math.max(1, Math.round(bars || 8));
    const useFlats = preferFlats(rootPc, mode);
    const chords = [];
    for (let i = 0; i < length; i += 1) {
      const index = i % def.degrees.length;
      const root = (((rootPc + def.degrees[index]) % 12) + 12) % 12;
      chords.push(`${U.pcName(root, useFlats)}${def.qualities[index]}`);
    }
    return chords;
  }

  function progressionRoman(mode, presetId) {
    const modeDefs = PROGRESSIONS[mode] || PROGRESSIONS.minor;
    const def = modeDefs.find((entry) => entry.id === presetId) || modeDefs[0];
    return def.roman;
  }

  function progressionName(mode, presetId) {
    const modeDefs = PROGRESSIONS[mode] || PROGRESSIONS.minor;
    const def = modeDefs.find((entry) => entry.id === presetId) || modeDefs[0];
    return def.name;
  }

  function scalePitches(rootPc, mode, center, count) {
    const intervals = SCALES[mode] || SCALES.minor;
    const root = nearestMidiToPc(rootPc, center == null ? 60 : center);
    const result = [];
    const octaves = Math.max(1, Math.ceil((count || 8) / intervals.length) + 1);
    for (let octave = 0; octave < octaves; octave += 1) {
      intervals.forEach((interval) => result.push(root + interval + octave * 12));
    }
    return result.sort((a, b) => a - b);
  }

  function pearson(a, b) {
    const length = Math.min(a.length, b.length);
    let meanA = 0;
    let meanB = 0;
    for (let i = 0; i < length; i += 1) {
      meanA += a[i];
      meanB += b[i];
    }
    meanA /= length;
    meanB /= length;
    let numerator = 0;
    let denomA = 0;
    let denomB = 0;
    for (let i = 0; i < length; i += 1) {
      const da = a[i] - meanA;
      const db = b[i] - meanB;
      numerator += da * db;
      denomA += da * da;
      denomB += db * db;
    }
    return numerator / (Math.sqrt(denomA * denomB) || 1);
  }

  function detectKey(notes) {
    const histogram = new Array(12).fill(0);
    (notes || []).forEach((note) => {
      const weight = Math.sqrt(Math.max(0.15, note.dur || 1)) * (0.4 + (note.vel == null ? 0.9 : note.vel));
      histogram[U.pc(note.pitch)] += weight;
    });
    if (histogram.every((value) => value <= 0)) {
      return { root: 9, mode: "minor", confidence: 0, label: "A minor" };
    }

    let best = { score: -Infinity, root: 0, mode: "major" };
    let second = -Infinity;
    const modes = [
      ["major", MAJOR_PROFILE],
      ["minor", MINOR_PROFILE],
    ];
    modes.forEach(([mode, profile]) => {
      for (let root = 0; root < 12; root += 1) {
        const rotated = new Array(12).fill(0);
        for (let i = 0; i < 12; i += 1) rotated[i] = histogram[(root + i) % 12];
        const score = pearson(rotated, profile);
        if (score > best.score) {
          second = best.score;
          best = { score, root, mode };
        } else if (score > second) {
          second = score;
        }
      }
    });

    const confidence = U.clamp((best.score - second) * 3.4 + best.score * 0.5, 0.18, 0.98);
    return {
      root: best.root,
      mode: best.mode,
      confidence,
      label: `${U.pcName(best.root)} ${best.mode}`,
    };
  }

  NS.theory = {
    SCALES,
    QUALITIES,
    PROGRESSIONS,
    parseChord,
    chordRootMidi,
    chordIntervals,
    chordPitchClasses,
    voiceChord,
    chordTones,
    buildProgression,
    progressionRoman,
    progressionName,
    scalePitches,
    detectKey,
    nearestMidiToPc,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = NS.theory;
})();
