(function () {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const NS = (root.NS = root.NS || {});
  const U = NS.util;
  const T = NS.theory;

  const SCHEMA = 1;
  const ROLE_COLORS = {
    lead: "#ff4fd8",
    arp: "#55e6ff",
    bass: "#ff9d5c",
    pad: "#9b8cff",
    drums: "#58f5b0",
    extra: "#ffd36e",
  };
  const ROLE_NAMES = {
    lead: "主旋律",
    arp: "琶音",
    bass: "低音",
    pad: "铺底",
    drums: "鼓组",
    extra: "附加",
  };
  const DRUM_NAMES = {
    36: "KICK",
    38: "SNARE",
    39: "CLAP",
    42: "HAT",
    45: "TOM",
    46: "OPEN",
    47: "TOM",
    49: "CRASH",
  };

  function note(pitch, start, dur, vel) {
    return {
      id: U.uid("n"),
      pitch: Math.round(pitch),
      start: Math.max(0, start),
      dur: Math.max(0.05, dur),
      vel: vel == null ? 0.85 : vel,
    };
  }

  function createTrack(role, index, styleId) {
    const safeRole = role || "extra";
    return {
      id: U.uid("t"),
      name: ROLE_NAMES[safeRole] || `轨道 ${index + 1}`,
      role: safeRole,
      instrument: NS.defaultForRole(safeRole, styleId || "synthwave"),
      color: ROLE_COLORS[safeRole] || ROLE_COLORS.extra,
      volume: safeRole === "pad" ? 0.72 : safeRole === "drums" ? 0.86 : 0.82,
      mute: false,
      solo: false,
      notes: [],
    };
  }

  function meterToBeats(meter) {
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec(String(meter || ""));
    if (!match) return null;
    const beats = parseInt(match[1], 10);
    const beatType = parseInt(match[2], 10);
    if (!beats || !beatType) return null;
    return (beats * 4) / beatType;
  }

  function beatsToMeter(beatsPerBar) {
    if (beatsPerBar === 3) return "3/4";
    if (beatsPerBar === 5) return "5/4";
    if (beatsPerBar === 2) return "2/4";
    return "4/4";
  }

  function createSong(options) {
    const opts = options || {};
    const bars = opts.bars || 8;
    const bpm = opts.bpm || 100;
    const meter = opts.meter || beatsToMeter(opts.beatsPerBar || 4);
    const beatsPerBar = meterToBeats(meter) || opts.beatsPerBar || 4;
    const root = opts.root == null ? 9 : opts.root;
    const mode = opts.mode || "minor";
    const preset = opts.progressionPreset || "bittersweet";
    const styleId = opts.styleId || "synthwave";
    const chords = T.buildProgression(root, mode, preset, bars);

    return {
      schema: SCHEMA,
      title: opts.title || "NEON DREAM",
      bpm,
      meter,
      beatsPerBar,
      bars,
      keyRoot: root,
      keyMode: mode,
      progressionPreset: preset,
      chords,
      styleId,
      arpPattern: "updown",
      drumStyle: "classic",
      density: 65,
      swing: 0,
      fx: { reverb: 42, delay: 28, drive: 26, sidechain: 78, brightness: 60 },
      tracks: [
        createTrack("lead", 0, styleId),
        createTrack("arp", 1, styleId),
        createTrack("bass", 2, styleId),
        createTrack("pad", 3, styleId),
        createTrack("drums", 4, styleId),
      ],
    };
  }

  const DEMO_MELODY = [
    // Am
    [69, 0, 1.5, 0.92], [72, 1.5, 0.5, 0.8], [76, 2, 1, 0.9], [74, 3, 0.5, 0.75], [72, 3.5, 0.5, 0.76],
    // F
    [69, 4, 1, 0.84], [72, 5, 0.5, 0.76], [77, 5.5, 1, 0.94], [76, 6.5, 0.5, 0.8], [72, 7, 1, 0.78],
    // Dm
    [74, 8, 1, 0.9], [77, 9, 0.5, 0.82], [81, 9.5, 1, 0.96], [79, 10.5, 0.5, 0.8], [77, 11, 1, 0.82],
    // E
    [76, 12, 1.5, 0.94], [71, 13.5, 0.5, 0.78], [68, 14, 1, 0.82], [71, 15, 1, 0.8],
    // Am
    [69, 16, 1, 0.9], [76, 17, 0.5, 0.8], [81, 17.5, 1, 0.96], [79, 18.5, 0.5, 0.8], [76, 19, 1, 0.8],
    // F
    [77, 20, 1.5, 0.94], [76, 21.5, 0.5, 0.8], [72, 22, 1, 0.8], [69, 23, 1, 0.76],
    // Dm
    [74, 24, 1, 0.86], [77, 25, 1, 0.88], [81, 26, 1, 0.95], [77, 27, 0.5, 0.8], [74, 27.5, 0.5, 0.76],
    // E
    [76, 28, 1.5, 0.94], [80, 29.5, 1, 0.9], [83, 30.5, 0.5, 0.92], [76, 31, 1, 0.84],
  ];

  function createDemoSong() {
    const song = createSong({
      title: "NEON DREAM",
      bpm: 100,
      bars: 8,
      beatsPerBar: 4,
      root: 9,
      mode: "minor",
      progressionPreset: "bittersweet",
      styleId: "synthwave",
    });
    const lead = song.tracks[0];
    lead.notes = DEMO_MELODY.map(([pitch, start, dur, vel]) => note(pitch, start, dur, vel));
    generateArrangement(song, { seed: 1984, preserveLead: true, silent: true });
    song._demo = true;
    return song;
  }

  function getTrack(song, id) {
    return song.tracks.find((track) => track.id === id) || null;
  }

  function getPrimaryTrack(song, role) {
    return song.tracks.find((track) => track.role === role) || null;
  }

  function ensureTrack(song, role, styleId) {
    let track = getPrimaryTrack(song, role);
    if (track) return track;
    const style = styleId || song.styleId;
    track = createTrack(role, song.tracks.length, style);
    track.instrument = NS.defaultForRole(role, style);
    song.tracks.push(track);
    return track;
  }

  function syncChords(song) {
    if (!Array.isArray(song.chords) || song.chords.length !== song.bars) {
      song.chords = T.buildProgression(song.keyRoot, song.keyMode, song.progressionPreset, song.bars);
    }
    return song.chords;
  }

  function regenerateChords(song) {
    song.chords = T.buildProgression(song.keyRoot, song.keyMode, song.progressionPreset, song.bars);
    return song.chords;
  }

  function totalBeats(song) {
    return song.bars * song.beatsPerBar;
  }

  function durationSeconds(song) {
    return (totalBeats(song) * 60) / song.bpm;
  }

  function noteCount(song) {
    return song.tracks.reduce((sum, track) => sum + track.notes.length, 0);
  }

  function applyStyle(song, styleId) {
    const pack = NS.STYLE_PACKS.find((item) => item.id === styleId) || NS.STYLE_PACKS[0];
    song.styleId = pack.id;
    song.fx = Object.assign({}, pack.fx);
    song.arpPattern = pack.arpPattern;
    song.drumStyle = pack.drumStyle;
    song.density = pack.density;
    song.swing = pack.swing;
    song.tracks.forEach((track) => {
      if (pack.instruments[track.role]) track.instrument = pack.instruments[track.role];
    });
    return pack;
  }

  function applyPresetToTrack(track, presetId) {
    const preset = NS.getPreset(presetId);
    if (!preset) return false;
    track.instrument = preset.id;
    return true;
  }

  function melodyPitches(song) {
    const all = [];
    song.tracks.filter((track) => track.role === "lead").forEach((track) => {
      track.notes.forEach((n) => all.push(n));
    });
    return all;
  }

  function composeMelody(song, rng) {
    const lead = ensureTrack(song, "lead");
    lead.notes = [];
    const bpb = song.beatsPerBar;
    const rootPc = song.keyRoot;
    const scale = T.scalePitches(rootPc, song.keyMode, 67, 18).filter((p) => p >= 62 && p <= 86);
    const patterns = {
      3: [[1, 1, 1], [1.5, 0.5, 1], [0.5, 0.5, 2], [2, 1], [1, 0.5, 0.5, 1]],
      4: [[1, 1, 1, 1], [1.5, 0.5, 1, 1], [0.5, 0.5, 1, 2], [1, 0.5, 0.5, 1, 1], [2, 1, 1], [1, 1, 2], [0.5, 0.5, 0.5, 0.5, 2]],
      5: [[1, 1, 1, 1, 1], [1.5, 0.5, 1, 1, 1], [1, 1, 1.5, 0.5, 1], [2, 1, 1, 1]],
    };
    let previous = 72;

    for (let bar = 0; bar < song.bars; bar += 1) {
      const chord = song.chords[bar % song.chords.length];
      const chordTones = T.chordTones(chord, 71, 24).filter((p) => p >= 62 && p <= 86);
      const bank = patterns[bpb] || patterns[4];
      const rhythm = bank[Math.floor(rng() * bank.length)];
      let cursor = 0;
      let barPrevious = previous;

      rhythm.forEach((length, index) => {
        const strong = cursor === 0 || Math.abs(cursor - Math.floor(cursor)) < 0.001;
        let pool;
        if (strong || index === 0) {
          pool = chordTones;
        } else {
          pool = scale.concat(chordTones);
        }
        const ideal = barPrevious + (rng() < 0.68 ? 1 : -1) * (rng() < 0.5 ? 1 : 2);
        const sorted = pool.slice().sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
        let pitch = sorted[Math.floor(rng() * Math.min(3, sorted.length))] || barPrevious;
        if (pitch === barPrevious && rng() < 0.4) {
          pitch = sorted.find((candidate) => candidate !== barPrevious) || pitch;
        }
        pitch = U.clamp(pitch, 62, 86);
        lead.notes.push(note(pitch, bar * bpb + cursor, Math.max(0.2, length - 0.02), index === 0 ? 0.88 : 0.72 + rng() * 0.16));
        barPrevious = pitch;
        cursor += length;
      });
      previous = barPrevious;
    }
    return true;
  }

  function clearRole(song, role) {
    const track = getPrimaryTrack(song, role);
    if (track) track.notes = [];
    return track;
  }

  function arrangePad(song, rng) {
    const track = ensureTrack(song, "pad");
    track.notes = [];
    const bpb = song.beatsPerBar;
    let previous = null;
    const high = ["musicbox", "dream"].includes(song.styleId);

    for (let bar = 0; bar < song.bars; bar += 1) {
      const chord = song.chords[bar % song.chords.length];
      const voicing = T.voiceChord(chord, 61, previous);
      previous = voicing;
      const start = bar * bpb;
      voicing.forEach((pitch, index) => {
        track.notes.push(note(pitch, start, Math.max(0.5, bpb - 0.06), index === 0 ? 0.5 : 0.38));
      });
      if (high) {
        const root = T.chordRootMidi(chord, 55, 67) + 12;
        track.notes.push(note(root, start, Math.max(0.5, bpb - 0.12), 0.2));
      }
    }
  }

  function arrangeBass(song, rng) {
    const track = ensureTrack(song, "bass");
    track.notes = [];
    const bpb = song.beatsPerBar;
    const style = song.styleId;
    const density = song.density;

    for (let bar = 0; bar < song.bars; bar += 1) {
      const chord = song.chords[bar % song.chords.length];
      const root = T.chordRootMidi(chord, 33, 44);
      const start = bar * bpb;

      if (style === "musicbox") {
        track.notes.push(note(root, start, Math.min(1.8, bpb - 0.2), 0.46));
        if (bpb >= 4) track.notes.push(note(root + 7, start + bpb / 2, Math.min(1.4, bpb / 2 - 0.15), 0.3));
        continue;
      }
      if (style === "dream") {
        track.notes.push(note(root, start, bpb / 2 - 0.08, 0.48));
        track.notes.push(note(root, start + bpb / 2, bpb / 2 - 0.08, 0.38));
        if (rng() < 0.5) track.notes.push(note(root + 12, start + bpb - 0.5, 0.35, 0.22));
        continue;
      }

      if (style === "city") {
        const positions = [0, 0.75, 1.5, 2.25, 3, 3.5];
        positions.forEach((offset, index) => {
          if (offset >= bpb) return;
          const octave = index === 3 || index === 5 ? 12 : 0;
          track.notes.push(note(root + octave, start + offset, 0.3, index === 0 ? 0.58 : 0.38));
        });
        continue;
      }

      const step = density > 55 ? 0.5 : 1;
      for (let offset = 0; offset < bpb - 0.001; offset += step) {
        const beatIndex = Math.round(offset * 2);
        if (density < 42 && beatIndex % 4 === 2) continue;
        let pitch = root;
        if (beatIndex % 8 === 7 && bpb >= 4) pitch += 12;
        if (style === "chip" && beatIndex % 4 === 3) pitch += 12;
        const vel = beatIndex % 4 === 0 ? 0.56 : beatIndex % 2 === 0 ? 0.42 : 0.34;
        track.notes.push(note(pitch, start + offset, Math.min(0.46, step * 0.86), vel));
      }
      if (density > 74 && bpb >= 4) {
        track.notes.push(note(root + 12, start + bpb - 0.25, 0.2, 0.26));
      }
    }
  }

  function arrangeArp(song, rng) {
    const track = ensureTrack(song, "arp");
    track.notes = [];
    const bpb = song.beatsPerBar;
    const style = song.styleId;
    const pattern = song.arpPattern;
    const center = style === "musicbox" ? 74 : style === "dream" ? 72 : 67;
    let step = song.density < 55 ? 0.5 : 0.25;
    if (style === "musicbox" || style === "dream") step = song.density < 70 ? 0.5 : 0.25;
    if (style === "chip") step = 0.25;
    if (pattern === "offbeat") step = 0.5;

    const shapeUp = (i) => i;
    const shapeDownUp = (i) => {
      const cycle = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1];
      return cycle[i % cycle.length];
    };
    const shapeOctave = (i) => {
      const cycle = [0, 3, 1, 4, 2, 5, 3, 1];
      return cycle[i % cycle.length];
    };

    for (let bar = 0; bar < song.bars; bar += 1) {
      const chord = song.chords[bar % song.chords.length];
      const tones = T.chordTones(chord, center, 24);
      const start = bar * bpb;
      let slot = 0;
      const offsetStart = pattern === "offbeat" ? 0.5 : 0;
      for (let offset = offsetStart; offset < bpb - 0.001; offset += step) {
        let index;
        if (pattern === "up") index = shapeUp(slot);
        else if (pattern === "octave") index = shapeOctave(slot);
        else if (pattern === "offbeat") index = shapeOctave(slot + 2);
        else index = shapeDownUp(slot);
        index = ((index % tones.length) + tones.length) % tones.length;
        const pitch = tones[index];
        if (pitch != null) {
          const accent = slot % 4 === 0;
          track.notes.push(note(pitch, start + offset, Math.max(0.12, step * 0.72), accent ? 0.56 : 0.36 + rng() * 0.08));
        }
        slot += 1;
      }
    }
  }

  function addDrum(track, pitch, beat, vel, dur) {
    track.notes.push(note(pitch, beat, dur == null ? 0.12 : dur, vel == null ? 0.7 : vel));
  }

  function arrangeDrums(song, rng) {
    const track = ensureTrack(song, "drums");
    track.notes = [];
    const bpb = song.beatsPerBar;
    const feel = song.drumStyle;
    if (feel === "none") return;

    const kickBeats = feel === "four" ? [0, 1, 2, 3] : feel === "half" ? [0, 2.5] : feel === "city" ? [0, 2.5, 2.75] : [0, 2];
    const snareBeats = bpb >= 5 ? [1, 3] : bpb >= 4 ? [1, 3] : [1];

    for (let bar = 0; bar < song.bars; bar += 1) {
      const start = bar * bpb;

      kickBeats.forEach((offset) => {
        if (offset < bpb) addDrum(track, 36, start + offset, offset === 0 ? 0.95 : 0.82);
      });

      snareBeats.forEach((offset) => {
        if (offset < bpb) addDrum(track, 38, start + offset, 0.78);
      });

      const hatStep = feel === "chip" ? 0.25 : feel === "half" ? 1 : 0.5;
      for (let offset = 0; offset < bpb - 0.001; offset += hatStep) {
        const accent = Math.abs(offset - Math.round(offset)) < 0.001;
        addDrum(track, 42, start + offset, accent ? 0.24 : 0.13, 0.06);
      }

      if (bpb >= 4) {
        addDrum(track, 46, start + bpb - 0.5, 0.16, 0.2);
      }
      if (feel === "city") {
        addDrum(track, 39, start + 1, 0.18, 0.18);
        addDrum(track, 39, start + 3, 0.2, 0.18);
      }
      if (feel === "four") {
        addDrum(track, 39, start + 1, 0.17, 0.16);
        addDrum(track, 39, start + 3, 0.19, 0.16);
      }

      const fillBar = (bar + 1) % 4 === 0 && bar < song.bars - 1;
      if (fillBar && feel !== "half") {
        const fillStart = start + bpb - 1;
        for (let i = 0; i < 4; i += 1) {
          addDrum(track, i < 2 ? 38 : 45 + (i % 2) * 2, fillStart + i * 0.25, 0.5 + i * 0.08, 0.08);
        }
      }

      if (bar === 0 || bar % 8 === 0) {
        addDrum(track, 49, start, 0.22, 0.8);
      }
    }
  }

  /**
   * Generate the accompaniment. Keeps the lead melody unless it is empty.
   * opts: { seed, preserveLead, silent }
   */
  function generateArrangement(song, options) {
    const opts = options || {};
    if (!Array.isArray(song.chords) || song.chords.length !== song.bars) syncChords(song);
    const seed = opts.seed != null ? opts.seed : U.hashString(`${song.title}|${song.chords.join(",")}|${song.bars}|${song.keyRoot}`);
    const rng = U.makeRandom(seed);
    const leadNotes = melodyPitches(song);
    let melodyCreated = false;
    if (!opts.preserveLead && leadNotes.length === 0) {
      melodyCreated = composeMelody(song, rng);
    } else if (leadNotes.length === 0) {
      melodyCreated = composeMelody(song, rng);
    }

    arrangePad(song, rng);
    arrangeBass(song, rng);
    arrangeArp(song, rng);
    arrangeDrums(song, rng);
    song._lastSeed = seed;
    return { melodyCreated, seed, notes: noteCount(song) };
  }

  function normalizeSong(raw) {
    if (!raw || typeof raw !== "object") throw new Error("工程文件为空或格式不正确。");
    const source = raw.song && typeof raw.song === "object" ? raw.song : raw;
    const bpm = U.clamp(Number(source.bpm) || 100, 40, 220);
    const meterFromSource = typeof source.meter === "string" && meterToBeats(source.meter)
      ? source.meter
      : beatsToMeter([2, 3, 4, 5].includes(Number(source.beatsPerBar)) ? Number(source.beatsPerBar) : 4);
    const beatsPerBar = meterToBeats(meterFromSource) || 4;
    const bars = U.clamp(Math.round(Number(source.bars) || 8), 1, 64);
    const keyRoot = U.clamp(Math.round(Number(source.keyRoot) || 0), 0, 11);
    const keyMode = source.keyMode === "major" ? "major" : "minor";
    const styleId = NS.STYLE_PACKS.some((pack) => pack.id === source.styleId) ? source.styleId : "synthwave";
    const progressionPreset = T.PROGRESSIONS[keyMode].some((preset) => preset.id === source.progressionPreset)
      ? source.progressionPreset
      : T.PROGRESSIONS[keyMode][0].id;

    const song = createSong({
      title: String(source.title || "UNTITLED").slice(0, 40),
      bpm,
      meter: meterFromSource,
      beatsPerBar,
      bars,
      root: keyRoot,
      mode: keyMode,
      progressionPreset,
      styleId,
    });

    song.arpPattern = ["up", "updown", "octave", "offbeat"].includes(source.arpPattern) ? source.arpPattern : "updown";
    song.drumStyle = ["classic", "four", "half", "chip", "city", "none"].includes(source.drumStyle) ? source.drumStyle : "classic";
    song.density = U.clamp(Math.round(Number(source.density) || 65), 10, 100);
    song.swing = U.clamp(Math.round(Number(source.swing) || 0), 0, 100);
    if (source.fx && typeof source.fx === "object") {
      ["reverb", "delay", "drive", "sidechain", "brightness"].forEach((key) => {
        if (Number.isFinite(Number(source.fx[key]))) song.fx[key] = U.clamp(Number(source.fx[key]), 0, 100);
      });
    }

    if (Array.isArray(source.chords) && source.chords.length === bars && source.chords.every((chord) => typeof chord === "string")) {
      song.chords = source.chords.slice();
    } else {
      song.chords = T.buildProgression(keyRoot, keyMode, progressionPreset, bars);
    }

    if (Array.isArray(source.tracks) && source.tracks.length) {
      const maxBeats = totalBeats(song);
      const tracks = [];
      source.tracks.slice(0, 16).forEach((rawTrack, index) => {
        if (!rawTrack || typeof rawTrack !== "object") return;
        const role = ["lead", "arp", "bass", "pad", "drums", "extra"].includes(rawTrack.role) ? rawTrack.role : "extra";
        const fallback = createTrack(role, index, styleId);
        const instrument = NS.getPreset(rawTrack.instrument) ? rawTrack.instrument : fallback.instrument;
        const notes = [];
        if (Array.isArray(rawTrack.notes)) {
          rawTrack.notes.slice(0, 5000).forEach((rawNote) => {
            if (!rawNote || typeof rawNote !== "object") return;
            const pitch = U.clamp(Math.round(Number(rawNote.pitch)), 0, 127);
            const start = Math.max(0, Number(rawNote.start) || 0);
            const dur = Math.max(0.05, Number(rawNote.dur) || 0.25);
            if (!Number.isFinite(pitch) || start >= maxBeats) return;
            notes.push({
              id: typeof rawNote.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(rawNote.id) ? rawNote.id : U.uid("n"),
              pitch,
              start: Math.min(start, maxBeats - 0.05),
              dur: Math.min(dur, maxBeats - start),
              vel: U.clamp(Number(rawNote.vel) || 0.8, 0.02, 1),
            });
          });
        }
        tracks.push({
          id: typeof rawTrack.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(rawTrack.id) ? rawTrack.id : U.uid("t"),
          name: String(rawTrack.name || ROLE_NAMES[role]).slice(0, 24),
          role,
          instrument,
          color: /^#[0-9a-f]{6}$/i.test(rawTrack.color || "") ? rawTrack.color : fallback.color,
          volume: U.clamp(Number(rawTrack.volume) || 0.82, 0, 1),
          mute: Boolean(rawTrack.mute),
          solo: Boolean(rawTrack.solo),
          notes,
        });
      });
      if (tracks.length) song.tracks = tracks;
    }

    return song;
  }

  function serializeSong(song) {
    const clean = U.deepClone(song);
    delete clean._demo;
    delete clean._lastSeed;
    return {
      app: "NEONSCORE",
      schema: SCHEMA,
      savedAt: new Date().toISOString(),
      song: clean,
    };
  }

  function instrumentName(track) {
    const preset = NS.getPreset(track.instrument);
    return preset ? preset.name : track.instrument;
  }

  function trackNoteRange(track) {
    if (!track.notes.length) return null;
    let min = Infinity;
    let max = -Infinity;
    track.notes.forEach((n) => {
      min = Math.min(min, n.pitch);
      max = Math.max(max, n.pitch);
    });
    return { min, max };
  }

  NS.model = {
    SCHEMA,
    ROLE_COLORS,
    ROLE_NAMES,
    DRUM_NAMES,
    meterToBeats,
    beatsToMeter,
    note,
    createSong,
    createDemoSong,
    createTrack,
    getTrack,
    getPrimaryTrack,
    ensureTrack,
    syncChords,
    regenerateChords,
    totalBeats,
    durationSeconds,
    noteCount,
    applyStyle,
    applyPresetToTrack,
    generateArrangement,
    composeMelody,
    normalizeSong,
    serializeSong,
    instrumentName,
    trackNoteRange,
    melodyPitches,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = NS.model;
})();
