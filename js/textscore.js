(function () {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const NS = (root.NS = root.NS || {});
  const U = NS.util;
  const T = NS.theory;

  const ROLES = ["lead", "arp", "bass", "pad", "drums", "extra"];
  const DRUM_TO_PITCH = {
    K: 36, KICK: 36,
    S: 38, SNARE: 38,
    H: 42, HAT: 42,
    O: 46, OH: 46, OPEN: 46,
    C: 39, CLAP: 39, CL: 39,
    T: 45, TOM: 45,
    CR: 49, CRASH: 49,
  };
  const PITCH_TO_DRUM = { 36: "K", 38: "S", 42: "H", 46: "O", 39: "C", 45: "T", 49: "CR" };
  const QUALITY_ALIASES = {
    "": "",
    maj: "",
    major: "",
    M: "",
    min: "m",
    minor: "m",
    m: "m",
    dom7: "7",
    maj7: "maj7",
    M7: "maj7",
    m7: "m7",
    min7: "m7",
    sus2: "sus2",
    sus4: "sus4",
    dim: "dim",
    aug: "aug",
    add9: "add9",
    "6": "6",
    m6: "m6",
    "9": "9",
    m9: "m9",
  };
  const NOTE_VALUE = { 1: 4, 2: 2, 4: 1, 8: 0.5, 16: 0.25, 32: 0.125, 64: 0.0625 };

  const EXAMPLE = `# NeonScore Text (.nst) — 可直接用 VSCode / 记事本编辑
# 时值：/4 = 四分音符，/8 = 八分音符，/2 = 二分音符；也可以写 :1 表示 1 拍
# 和弦：写根音 + 性质，程序会自动补全其他音，例如 C5:maj7
title: 東方連復段 · 文本谱
tempo: 108
meter: 4/4
key: C minor
style: synthwave

track lead "主旋律" instrument=neonSaw volume=90
| C5/8 D5/8 E5/8 F5/8 G5/8 F#5/8 Eb5/8 C#5/8 |
| C5/2 R/8 G4/8 Ab4/8 G4/8 F4/8 |
| C5/8 D5/8 E5/8 F5/8 G5/8 F#5/8 Eb5/8 C#5/8 |
| C5/2 R/2 |

# 只需要给和弦根音与性质，其余和弦音自动生成
track pad "自动和弦" instrument=warmPad volume=65
chords: Cm | Ab | Fm | G | Cm | Ab | Fm | G`;

  function parseDurationSuffix(noteValue, dots) {
    if (!noteValue) return null;
    const beats = NOTE_VALUE[Number(noteValue)];
    if (!beats) return null;
    const dotCount = Math.min(2, (dots || "").length);
    return beats * (2 - Math.pow(0.5, dotCount));
  }

  function parseBeatDuration(value) {
    if (value == null) return null;
    const text = String(value).trim();
    if (!text) return null;
    if (text.includes("/")) {
      const [a, b] = text.split("/").map(Number);
      if (Number.isFinite(a) && Number.isFinite(b) && b) return a / b;
    }
    const number = parseFloat(text);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function parseKey(value) {
    const match = /^([A-G][#b]?)\s*(minor|major|小调|大调|m|min|maj|)$/i.exec(String(value || "").trim());
    if (!match) return null;
    const root = U.nameToMidi(`${match[1]}4`);
    if (root == null) return null;
    const modeText = match[2].toLowerCase();
    const mode = ["minor", "小调", "m", "min"].includes(modeText) ? "minor" : "major";
    return { root: U.pc(root), mode };
  }

  function parseMeter(value) {
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec(String(value || "").trim());
    if (!match) return null;
    const beats = parseInt(match[1], 10);
    const beatType = parseInt(match[2], 10);
    const raw = (beats * 4) / beatType;
    if (![2, 3, 4, 5, 6].includes(Math.round(raw))) return null;
    return { beats: Math.round(raw), label: `${beats}/${beatType}` };
  }

  function qualitySuffix(alias) {
    if (Object.prototype.hasOwnProperty.call(QUALITY_ALIASES, alias)) return QUALITY_ALIASES[alias];
    return null;
  }

  function parseMusicToken(token, role) {
    let body = String(token || "").trim();
    if (!body) return null;
    let accent = false;
    if (body.endsWith("!")) {
      accent = true;
      body = body.slice(0, -1);
    }
    const velocity = accent ? 0.98 : 0.82;

    const bracket = /^\[([^\]]+)\](?::([0-9.]+)|\/(\d+)(\.{0,2}))?$/.exec(body);
    if (bracket) {
      const parts = bracket[1].split(/[,+]/).map((part) => part.trim()).filter(Boolean);
      if (!parts.length) return null;
      const duration = parseBeatDuration(bracket[2])
        || parseDurationSuffix(bracket[3], bracket[4])
        || 1;
      const pitches = [];
      parts.forEach((part) => {
        const midi = U.nameToMidi(part, 4);
        if (midi != null) pitches.push(midi);
      });
      if (!pitches.length) return null;
      return { type: "chord", pitches, duration, velocity };
    }

    if (role === "drums") {
      const drum = /^([A-Za-z]+)(?::([0-9.]+))?(?:\/(\d+)(\.{0,2}))?$/.exec(body);
      if (drum) {
        const name = drum[1].toUpperCase();
        if (Object.prototype.hasOwnProperty.call(DRUM_TO_PITCH, name)) {
          const duration = parseBeatDuration(drum[2])
            || parseDurationSuffix(drum[3], drum[4])
            || 0.1;
          return { type: "note", pitches: [DRUM_TO_PITCH[name]], duration, velocity };
        }
      }
    }

    const rest = /^(R|REST|-|休止)(?::([0-9./]+)|\/(\d+)(\.{0,2}))?$/i.exec(body);
    if (rest) {
      const duration = parseBeatDuration(rest[2])
        || parseDurationSuffix(rest[3], rest[4])
        || 1;
      return { type: "rest", duration };
    }

    const match = /^([A-Ga-g][#b]?)(-?\d+)?(?::([A-Za-z0-9.]+))?(?:\/(\d+)(\.{0,2}))?$/.exec(body);
    if (!match) return null;
    const noteName = match[1];
    const octave = match[2] == null ? 4 : parseInt(match[2], 10);
    const rawColon = match[3];
    const noteValue = match[4];
    const dots = match[5];
    let duration = parseDurationSuffix(noteValue, dots) || 1;
    let quality = null;

    if (rawColon != null) {
      const beatDuration = parseBeatDuration(rawColon);
      if (beatDuration != null) {
        duration = beatDuration;
      } else {
        quality = qualitySuffix(rawColon);
        if (quality == null) quality = "";
      }
    }

    const rootMidi = U.nameToMidi(`${noteName}${octave}`);
    if (rootMidi == null) return null;

    if (quality != null) {
      const parsed = T.parseChord(`${noteName}${quality}`);
      const pitches = parsed.intervals.map((interval) => rootMidi + interval);
      return { type: "chord", pitches, duration, velocity };
    }
    return { type: "note", pitches: [rootMidi], duration, velocity };
  }

  function makeTrack(role, name, instrument, volume, styleId, atBar, bpb) {
    const safeRole = ROLES.includes(role) ? role : "extra";
    const track = NS.model.createTrack(safeRole, 0, styleId);
    track.name = name || NS.model.ROLE_NAMES[safeRole];
    if (instrument && NS.getPreset(instrument)) {
      track.instrument = instrument;
      track._instrumentExplicit = true;
    }
    if (Number.isFinite(volume)) track.volume = U.clamp(volume / 100, 0, 1);
    track.notes = [];
    track.cursor = Math.max(0, ((Number(atBar) || 1) - 1) * bpb);
    track._startBar = Math.max(1, Number(atBar) || 1);
    return track;
  }

  function parse(text, options) {
    const opts = options || {};
    const source = String(text || "");
    let title = opts.title || "TEXT SCORE";
    let bpm = 100;
    let meter = "4/4";
    let meterBeats = 4;
    let keyInfo = null;
    let styleId = "synthwave";
    let density = null;
    let swing = null;
    let barsOverride = null;
    const tracks = [];
    const warnings = [];
    let currentTrack = null;
    let maxBeat = 0;
    let lineNumber = 0;

    function ensureTrack(role) {
      if (currentTrack) return currentTrack;
      currentTrack = makeTrack(role || "lead", "主旋律", null, null, styleId, 1, meterBeats);
      tracks.push(currentTrack);
      return currentTrack;
    }

    function addTokens(track, line) {
      const tokens = (line.replace(/\|/g, " ").match(/\[[^\]]+\](?:(?::|\/)[0-9.]+)?!?|[^\s]+/g) || []);
      let lastNotes = [];
      tokens.forEach((token) => {
        if (!token || token === "|") return;
        if (token.startsWith("@")) {
          const position = /^@(\d+)(?::(\d+(?:\.\d+)?))?$/.exec(token);
          if (!position) {
            warnings.push(`第 ${lineNumber} 行的位置「${token}」格式不正确，应为 @小节:拍。`);
            return;
          }
          const bar = Math.max(1, parseInt(position[1], 10));
          const beat = position[2] == null ? 1 : parseFloat(position[2]);
          track.cursor = Math.max(0, (bar - 1) * meterBeats + (beat - 1));
          lastNotes = [];
          return;
        }
        const velocityToken = /^(?:v|vel)=(\d+)$/i.exec(token);
        if (velocityToken) {
          const velocity = U.clamp(parseInt(velocityToken[1], 10) / 127, 0.02, 1);
          lastNotes.forEach((note) => { note.vel = velocity; });
          return;
        }
        const parsed = parseMusicToken(token, track.role);
        if (!parsed) {
          warnings.push(`第 ${lineNumber} 行无法识别「${token}」，已跳过。`);
          return;
        }
        if (parsed.type === "rest") {
          track.cursor += parsed.duration;
          maxBeat = Math.max(maxBeat, track.cursor);
          lastNotes = [];
          return;
        }
        const start = track.cursor;
        const added = [];
        parsed.pitches.forEach((pitch) => {
          const created = NS.model.note(
            U.clamp(pitch, 0, 127),
            start,
            Math.max(0.03, parsed.duration),
            parsed.velocity
          );
          track.notes.push(created);
          added.push(created);
        });
        lastNotes = added;
        track.cursor += parsed.duration;
        maxBeat = Math.max(maxBeat, track.cursor);
      });
    }

    function addChordLine(track, line) {
      const body = line.replace(/^chords\s*[:：]/i, "").replace(/\|/g, " ").trim();
      const tokens = body ? body.split(/\s+/) : [];
      let previous = null;
      tokens.forEach((token) => {
        if (/^(r|rest|-)$/i.test(token)) {
          track.cursor += meterBeats;
          maxBeat = Math.max(maxBeat, track.cursor);
          return;
        }
        if (!/^[A-G][#b]?(?:m|maj7|M7|m7|min7|7|sus2|sus4|dim|aug|add9|6|m6|9|m9)?$/.test(token)) {
          warnings.push(`第 ${lineNumber} 行的和弦「${token}」格式不正确，已跳过。`);
          track.cursor += meterBeats;
          return;
        }
        const parsed = T.parseChord(token);
        const voicing = T.voiceChord(token, 60, previous);
        previous = voicing;
        const start = track.cursor;
        voicing.forEach((pitch, index) => {
          track.notes.push(NS.model.note(pitch, start, Math.max(0.2, meterBeats - 0.06), index === 0 ? 0.44 : 0.33));
        });
        track.cursor += meterBeats;
        maxBeat = Math.max(maxBeat, track.cursor);
      });
    }

    source.split(/\r?\n/).forEach((rawLine) => {
      lineNumber += 1;
      const withoutComment = rawLine.replace(/\/\/.*$/, "").trim();
      if (!withoutComment) return;
      if (withoutComment.startsWith("#")) return;

      const directive = /^(title|tempo|bpm|meter|time|key|style|swing|density|bars)\s*[:：]\s*(.+)$/i.exec(withoutComment);
      if (directive) {
        const name = directive[1].toLowerCase();
        const value = directive[2].trim();
        if (name === "title") title = value;
        else if (name === "tempo" || name === "bpm") bpm = U.clamp(parseInt(value, 10) || 100, 40, 220);
        else if (name === "key") keyInfo = parseKey(value);
        else if (name === "bars") barsOverride = U.clamp(parseInt(value, 10) || 1, 1, 64);
        else if (name === "meter" || name === "time") {
          const parsedMeter = parseMeter(value);
          if (parsedMeter) {
            meter = parsedMeter.label;
            meterBeats = parsedMeter.beats;
          }
        } else if (name === "style") {
          if (NS.STYLE_PACKS.some((pack) => pack.id === value)) styleId = value;
        } else if (name === "swing") {
          swing = U.clamp(parseInt(value, 10) || 0, 0, 100);
        } else if (name === "density") {
          density = U.clamp(parseInt(value, 10) || 65, 10, 100);
        }
        return;
      }

      const trackHeader = /^track\s+([A-Za-z]+)(?:\s+"([^"]*)")?(.*)$/i.exec(withoutComment);
      if (trackHeader) {
        const role = trackHeader[1].toLowerCase();
        const rest = trackHeader[3] || "";
        const instrumentMatch = /instrument\s*=\s*([A-Za-z0-9_]+)/i.exec(rest);
        const volumeMatch = /volume\s*=\s*(\d+)/i.exec(rest);
        const atMatch = /at\s*=\s*(\d+)/i.exec(rest);
        currentTrack = makeTrack(
          role,
          trackHeader[2] ? trackHeader[2].trim() : null,
          instrumentMatch ? instrumentMatch[1] : null,
          volumeMatch ? Number(volumeMatch[1]) : null,
          styleId,
          atMatch ? Number(atMatch[1]) : 1,
          meterBeats
        );
        tracks.push(currentTrack);
        return;
      }

      if (/^chords\s*[:：]/i.test(withoutComment)) {
        const track = currentTrack || makeTrack("pad", "自动和弦", null, 70, styleId, 1, meterBeats);
        if (!currentTrack) {
          currentTrack = track;
          tracks.push(track);
        }
        addChordLine(track, withoutComment);
        return;
      }

      const track = ensureTrack("lead");
      addTokens(track, withoutComment);
    });

    const usedTracks = tracks.filter((track) => track.notes.length);
    if (!usedTracks.length) throw new Error("文本谱中没有有效音符。");

    usedTracks.forEach((track) => {
      delete track.cursor;
      delete track._startBar;
      if (!track._instrumentExplicit) track.instrument = NS.defaultForRole(track.role, styleId);
      delete track._instrumentExplicit;
    });

    const rawBars = Math.max(1, barsOverride || 0, Math.ceil(maxBeat / meterBeats));
    const bars = Math.min(64, rawBars);
    if (rawBars > 64) warnings.push("文本谱超过 64 小节，已截断。");
    const total = bars * meterBeats;
    usedTracks.forEach((track) => {
      track.notes = track.notes.filter((note) => note.start < total).map((note) => ({
        id: U.uid("n"),
        pitch: note.pitch,
        start: Math.min(note.start, total - 0.05),
        dur: Math.max(0.04, Math.min(note.dur, total - note.start)),
        vel: note.vel,
      }));
    });

    let detected = keyInfo;
    if (!detected) {
      const allNotes = [];
      usedTracks.forEach((track) => track.notes.forEach((note) => allNotes.push(note)));
      const result = T.detectKey(allNotes);
      detected = { root: result.root, mode: result.mode };
    }

    return {
      title: title.slice(0, 40) || "TEXT SCORE",
      bpm,
      meter,
      beatsPerBar: meterBeats,
      bars,
      keyRoot: detected.root,
      keyMode: detected.mode,
      styleId,
      density,
      swing,
      tracks: usedTracks,
      warnings,
    };
  }

  function formatDuration(beats) {
    const exact = [
      [4, "/1"], [3, "/2."], [2, "/2"], [1.5, "/4."], [1, "/4"],
      [0.75, "/8."], [0.5, "/8"], [0.375, "/16."], [0.25, "/16"], [0.125, "/32"],
    ];
    for (const [value, token] of exact) {
      if (Math.abs(beats - value) < 0.002) return token;
    }
    return `:${Number(beats.toFixed(4))}`;
  }

  function formatPosition(beat, bpb) {
    const safe = Math.max(0, beat);
    const bar = Math.floor(safe / bpb) + 1;
    const within = safe - (bar - 1) * bpb + 1;
    return `@${bar}:${Number(within.toFixed(4))}`;
  }

  function stringify(song, options) {
    const opts = options || {};
    const bpb = song.beatsPerBar;
    const useFlats = Array.isArray(song.chords) && song.chords.some((chord) => chord.includes("b"));
    const keyName = U.pcName(song.keyRoot, useFlats);
    const lines = [];
    lines.push("# NeonScore Text (.nst) — 可直接用 VSCode / 记事本编辑并重新导入");
    lines.push("# 每个音用 @小节:拍 绝对定位；改音高/起点/长度不会影响其他音");
    lines.push("# 时值：/4=四分音符 /8=八分音符 /2=二分音符；:1=1拍；v=90 可设置力度");
    lines.push(`title: ${song.title}`);
    lines.push(`tempo: ${song.bpm}`);
    lines.push(`meter: ${song.meter || `${bpb}/4`}`);
    lines.push(`bars: ${song.bars}`);
    lines.push(`key: ${keyName} ${song.keyMode}`);
    lines.push(`style: ${song.styleId}`);
    lines.push(`density: ${song.density}`);
    lines.push(`swing: ${song.swing}`);
    lines.push("");

    song.tracks.filter((track) => track.notes.length).forEach((track) => {
      const notes = track.notes.slice().sort((a, b) => a.start - b.start || a.pitch - b.pitch);
      lines.push(`# ${track.name} · ${NS.ROLE_LABELS[track.role] || track.role}`);
      lines.push(`track ${track.role} "${track.name.replace(/"/g, "'")}" instrument=${track.instrument} volume=${Math.round(track.volume * 100)}`);

      const groups = [];
      if (track.role === "drums") {
        notes.forEach((note) => groups.push({ start: note.start, duration: note.dur, velocity: note.vel, notes: [note] }));
      } else {
        const byKey = new Map();
        notes.forEach((note) => {
          const key = `${Math.round(note.start * 96)}|${Math.round(note.dur * 96)}|${Math.round(note.vel * 100)}`;
          if (!byKey.has(key)) byKey.set(key, { start: note.start, duration: note.dur, velocity: note.vel, notes: [] });
          byKey.get(key).notes.push(note);
        });
        groups.push(...byKey.values());
      }
      groups.sort((a, b) => a.start - b.start || a.notes[0].pitch - b.notes[0].pitch);

      groups.forEach((group) => {
        const position = formatPosition(group.start, bpb);
        const names = Array.from(new Set(group.notes.map((note) => note.pitch)))
          .sort((a, b) => a - b)
          .map((pitch) => (track.role === "drums" ? (PITCH_TO_DRUM[pitch] || U.midiToName(pitch, useFlats)) : U.midiToName(pitch, useFlats)));
        const body = names.length > 1 ? `[${names.join(",")}]` : names[0];
        const velocity = Math.round(group.velocity * 127);
        const velocityToken = velocity === 104 ? "" : ` v=${velocity}`;
        lines.push(`${position} ${body}${formatDuration(group.duration)}${velocityToken}`);
      });
      lines.push("");
    });

    return lines.join("\n").trimEnd() + "\n";
  }

  NS.textscore = {
    parse,
    stringify,
    EXAMPLE,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = NS.textscore;
})();
