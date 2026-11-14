(function () {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const NS = (root.NS = root.NS || {});
  const U = NS.util;

  const ROLE_HINTS = [
    { role: "drums", words: ["drum", "perc", "kit", "鼓", "打击"] },
    { role: "bass", words: ["bass", "sub", "低音", "贝斯", "bajo"] },
    { role: "pad", words: ["pad", "string", "choir", "warm", "铺底", "弦", "和声", "piano"] },
    { role: "arp", words: ["arp", "pluck", "sequence", "琶音", "拨弦"] },
    { role: "lead", words: ["lead", "melody", "vocal", "solo", "主旋律", "主音", "旋律"] },
  ];

  function textOf(bytes) {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch (_) {
      return "";
    }
  }

  function decodeText(bytes) {
    const encodings = ["utf-8", "shift_jis", "windows-1252"];
    for (const encoding of encodings) {
      try {
        const text = new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/\0/g, "").trim();
        if (text && !text.includes("\uFFFD")) return text;
      } catch (_) {
        // try the next encoding
      }
    }
    return textOf(bytes).replace(/\0/g, "").trim();
  }

  function readVarInt(view, state) {
    let value = 0;
    for (let i = 0; i < 4; i += 1) {
      if (state.pos >= state.length) throw new Error("MIDI 文件在读取变长整数时意外结束。");
      const byte = view.getUint8(state.pos);
      state.pos += 1;
      value = (value << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    return value;
  }

  function guessRole(name, program, notes, isDrum) {
    if (isDrum) return "drums";
    const lower = String(name || "").toLowerCase();
    for (const hint of ROLE_HINTS) {
      if (hint.words.some((word) => lower.includes(word))) return hint.role;
    }
    if (program != null) {
      if (program >= 32 && program <= 39) return "bass";
      if ((program >= 40 && program <= 47) || (program >= 88 && program <= 95)) return "pad";
      if (program >= 80 && program <= 87) return "lead";
      if (program >= 24 && program <= 31) return "arp";
      if (program <= 7) return "lead";
      if (program >= 16 && program <= 23) return "pad";
    }
    const notesArr = notes || [];
    if (!notesArr.length) return "lead";
    const avg = notesArr.reduce((sum, note) => sum + note.pitch, 0) / notesArr.length;
    if (avg < 50) return "bass";
    if (avg > 70 && notesArr.length > 32) return "arp";
    return "lead";
  }

  function instrumentForRole(role, program, name) {
    const lower = String(name || "").toLowerCase();
    if (role === "drums") return "gated80s";
    if (role === "bass") {
      if (program === 38 || program === 39) return "fmBass";
      if (lower.includes("sub")) return "subBass";
      return "analogBass";
    }
    if (role === "pad") {
      if (lower.includes("string") || lower.includes("弦")) return "stringPad";
      return "warmPad";
    }
    if (role === "arp") {
      if (program === 9 || lower.includes("bell")) return "bellArp";
      return "pluckArp";
    }
    if (program != null && program >= 0 && program <= 7) return "electricPiano";
    if (lower.includes("square")) return "squareHero";
    if (lower.includes("music") || lower.includes("box")) return "musicBox";
    return "neonSaw";
  }

  function parseMidi(arrayBuffer, options) {
    const opts = options || {};
    const view = new DataView(arrayBuffer);
    const state = { pos: 0, length: arrayBuffer.byteLength };
    if (state.length < 14) throw new Error("这不是有效的 MIDI 文件。");
    const headerId = textOf(new Uint8Array(arrayBuffer, 0, 4));
    if (headerId !== "MThd") throw new Error("缺少 MIDI 文件头 (MThd)。");
    state.pos = 4;
    const headerLength = view.getUint32(state.pos);
    state.pos += 4;
    const format = view.getUint16(state.pos);
    state.pos += 2;
    const trackCount = view.getUint16(state.pos);
    state.pos += 2;
    let division = view.getUint16(state.pos);
    state.pos += 2;
    if (division & 0x8000) throw new Error("暂不支持 SMPTE 时间格式的 MIDI。");
    division = Math.max(1, division);
    state.pos = 8 + headerLength;

    let firstTempo = 500000;
    let tempoSet = false;
    let timeSignature = { numerator: 4, denominator: 4 };
    let timeSignatureSet = false;
    const groups = [];
    const warnings = [];

    for (let trackIndex = 0; trackIndex < trackCount && state.pos < state.length; trackIndex += 1) {
      if (state.pos + 8 > state.length) break;
      const chunkId = textOf(new Uint8Array(arrayBuffer, state.pos, 4));
      state.pos += 4;
      const chunkLength = view.getUint32(state.pos);
      state.pos += 4;
      const chunkEnd = Math.min(state.length, state.pos + chunkLength);
      if (chunkId !== "MTrk") {
        state.pos = chunkEnd;
        continue;
      }

      const trackState = {
        pos: state.pos,
        length: chunkEnd,
        tick: 0,
        running: null,
        name: "",
        program: 0,
        programs: {},
      };
      const noteEvents = [];
      const openNotes = new Map();

      while (trackState.pos < chunkEnd) {
        const delta = readVarInt(view, trackState);
        trackState.tick += delta;
        if (trackState.pos >= chunkEnd) break;
        let status = view.getUint8(trackState.pos);
        if (status < 0x80) {
          if (trackState.running == null) throw new Error("MIDI 运行状态缺失。");
          status = trackState.running;
        } else {
          trackState.pos += 1;
          if (status < 0xF0) trackState.running = status;
        }

        if (status === 0xff) {
          if (trackState.pos >= chunkEnd) break;
          const metaType = view.getUint8(trackState.pos);
          trackState.pos += 1;
          const length = readVarInt(view, trackState);
          const start = trackState.pos;
          if (start + length > chunkEnd) break;
          const data = new Uint8Array(arrayBuffer, start, length);
          trackState.pos += length;
          if (metaType === 0x03) {
            trackState.name = decodeText(data);
          } else if (metaType === 0x51 && length >= 3) {
            const micros = (data[0] << 16) | (data[1] << 8) | data[2];
            if (micros > 0 && !tempoSet) {
              firstTempo = micros;
              tempoSet = true;
            }
          } else if (metaType === 0x58 && length >= 2) {
            if (!timeSignatureSet) {
              timeSignature = { numerator: data[0] || 4, denominator: Math.pow(2, data[1] || 2) };
              timeSignatureSet = true;
            }
          } else if (metaType === 0x2f) {
            break;
          }
          continue;
        }

        if (status === 0xf0 || status === 0xf7) {
          const length = readVarInt(view, trackState);
          trackState.pos += length;
          continue;
        }

        const command = status & 0xf0;
        const channel = status & 0x0f;
        const dataLength = command === 0xc0 || command === 0xd0 ? 1 : 2;
        if (trackState.pos + dataLength > chunkEnd) break;
        const data1 = view.getUint8(trackState.pos);
        const data2 = dataLength === 2 ? view.getUint8(trackState.pos + 1) : 0;
        trackState.pos += dataLength;

        if (command === 0xc0) {
          trackState.programs[channel] = data1;
          if (channel !== 9) trackState.program = data1;
        } else if (command === 0x90 && data2 > 0) {
          const key = `${channel}:${data1}`;
          if (!openNotes.has(key)) openNotes.set(key, []);
          openNotes.get(key).push({ tick: trackState.tick, velocity: data2 / 127, program: trackState.programs[channel] || 0 });
        } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
          const key = `${channel}:${data1}`;
          const stack = openNotes.get(key);
          if (stack && stack.length) {
            const started = stack.pop();
            noteEvents.push({
              pitch: data1,
              startTick: started.tick,
              endTick: Math.max(started.tick + 1, trackState.tick),
              velocity: started.velocity,
              program: started.program,
              channel,
            });
          }
        }
      }

      openNotes.forEach((stack, key) => {
        const channel = parseInt(key.split(":")[0], 10);
        stack.forEach((started) => {
          noteEvents.push({
            pitch: parseInt(key.split(":")[1], 10),
            startTick: started.tick,
            endTick: trackState.tick || started.tick + division / 4,
            velocity: started.velocity,
            program: started.program,
            channel,
          });
        });
      });

      if (!noteEvents.length) {
        state.pos = chunkEnd;
        continue;
      }

      // Split one MIDI track by channel, keeping the channel-9 drum lane separate.
      const byChannel = new Map();
      noteEvents.forEach((event) => {
        if (!byChannel.has(event.channel)) byChannel.set(event.channel, []);
        byChannel.get(event.channel).push(event);
      });
      byChannel.forEach((events, channel) => {
        const isDrum = channel === 9;
        const program = events[0].program;
        const name = trackState.name || (isDrum ? "Drums" : `Channel ${channel + 1}`);
        const notes = events.map((event) => {
          const start = event.startTick / division;
          const duration = (event.endTick - event.startTick) / division;
          return {
            id: U.uid("n"),
            pitch: U.clamp(Math.round(event.pitch), 0, 127),
            start,
            dur: Math.max(0.04, duration),
            vel: U.clamp(event.velocity, 0.05, 1),
          };
        });
        const role = guessRole(name, isDrum ? null : program, notes, isDrum);
        groups.push({
          name: byChannel.size > 1 && !isDrum ? `${name} · Ch${channel + 1}` : name,
          role,
          program,
          channel,
          notes,
        });
      });
      state.pos = chunkEnd;
    }

    if (!groups.length) throw new Error("MIDI 中没有可用的音符。");

    const quantize = opts.quantize === false ? 0 : opts.quantize || 1 / 16;
    let maxBeat = 0;
    groups.forEach((group) => {
      group.notes.forEach((note) => {
        if (quantize > 0) {
          note.start = Math.round(note.start / quantize) * quantize;
          note.dur = Math.max(quantize, Math.round(note.dur / quantize) * quantize);
        }
        note.start = Math.max(0, note.start);
        maxBeat = Math.max(maxBeat, note.start + note.dur);
      });
      group.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    });

    const bpm = U.clamp(Math.round(60000000 / firstTempo), 40, 220);
    const beatsPerBarRaw = (timeSignature.numerator * 4) / timeSignature.denominator;
    const meter = `${timeSignature.numerator}/${timeSignature.denominator}`;
    const beatsPerBar = [2, 3, 4, 5, 6].includes(Math.round(beatsPerBarRaw)) ? Math.round(beatsPerBarRaw) : 4;
    let bars = Math.max(4, Math.ceil(maxBeat / beatsPerBar));
    if (bars > 64) {
      bars = 64;
      warnings.push("乐曲超过 64 小节，已截断。");
    }
    const total = bars * beatsPerBar;

    groups.forEach((group) => {
      group.notes = group.notes.filter((note) => note.start < total).map((note) => ({
        id: U.uid("n"),
        pitch: U.clamp(note.pitch, 0, 127),
        start: Math.min(note.start, total - 0.05),
        dur: Math.max(0.04, Math.min(note.dur, total - note.start)),
        vel: note.vel,
      }));
    });

    groups.sort((a, b) => b.notes.length - a.notes.length);
    const maxTracks = U.clamp(Number(opts.maxTracks) || 16, 1, 20);
    const limited = groups.slice(0, maxTracks);
    if (groups.length > maxTracks) warnings.push(`检测到 ${groups.length} 个声部，仅载入音符最多的 ${maxTracks} 个。`);

    const tracks = limited.map((group, index) => ({
      id: U.uid("t"),
      name: group.name || NS.model.ROLE_NAMES[group.role] || `轨道 ${index + 1}`,
      role: group.role,
      instrument: instrumentForRole(group.role, group.program, group.name),
      color: NS.model.ROLE_COLORS[group.role] || NS.model.ROLE_COLORS.extra,
      volume: group.role === "pad" ? 0.68 : group.role === "drums" ? 0.84 : 0.8,
      mute: false,
      solo: false,
      notes: group.notes,
      sourceChannel: group.channel,
      sourceProgram: group.program,
    }));

    return {
      title: opts.title || "IMPORTED MIDI",
      bpm,
      meter,
      beatsPerBar,
      bars,
      tracks,
      warnings,
      program: limited.map((group) => group.program),
    };
  }

  /* ----------------------------- MIDI writer ----------------------------- */

  function writeVarInt(value) {
    let buffer = value & 0x7f;
    const bytes = [];
    while ((value >>= 7)) {
      buffer <<= 8;
      buffer |= ((value & 0x7f) | 0x80);
    }
    while (true) {
      bytes.push(buffer & 0xff);
      if (buffer & 0x80) buffer >>= 8;
      else break;
    }
    return bytes;
  }

  function writeString(text) {
    return Array.from(new TextEncoder().encode(String(text)));
  }

  function chunk(id, data) {
    const length = data.length;
    return writeString(id).concat([
      (length >>> 24) & 0xff,
      (length >>> 16) & 0xff,
      (length >>> 8) & 0xff,
      length & 0xff,
    ], data);
  }

  function programForRole(role, instrument) {
    if (instrument === "electricPiano") return 4;
    if (instrument === "fmBass") return 39;
    if (instrument === "subBass") return 38;
    if (role === "bass") return 38;
    if (role === "pad") return 89;
    if (role === "arp") return 81;
    if (role === "drums") return 0;
    return 81;
  }

  function writeMidi(song) {
    const division = 480;
    const tracks = song.tracks.filter((track) => track.notes.length);
    const parts = [];

    const tempoTrack = [];
    const scoreName = writeString("NEONSCORE");
    tempoTrack.push(0, 0xff, 0x03, scoreName.length, ...scoreName);
    const micros = Math.round(60000000 / song.bpm);
    tempoTrack.push(0, 0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff);
    const meterMatch = /^(\d+)\s*\/\s*(\d+)$/.exec(song.meter || "4/4");
    const numerator = meterMatch ? parseInt(meterMatch[1], 10) : 4;
    const denominator = meterMatch ? parseInt(meterMatch[2], 10) : 4;
    const denominatorPower = Math.max(0, Math.round(Math.log2(denominator)));
    tempoTrack.push(0, 0xff, 0x58, 0x04, numerator, denominatorPower, 24, 8);
    tempoTrack.push(0, 0xff, 0x2f, 0x00);
    parts.push(chunk("MTrk", tempoTrack));

    let melodicChannel = 0;
    tracks.forEach((track) => {
      const isDrums = track.role === "drums";
      const channel = isDrums ? 9 : melodicChannel >= 9 ? melodicChannel + 1 : melodicChannel;
      if (!isDrums) melodicChannel = Math.min(15, melodicChannel + 1);
      const events = [];
      const nameBytes = writeString(track.name.slice(0, 30));
      events.push({ tick: 0, order: 0, bytes: [0xff, 0x03, nameBytes.length, ...nameBytes] });
      if (!isDrums) {
        events.push({ tick: 0, order: 1, bytes: [0xc0 | channel, programForRole(track.role, track.instrument)] });
      }
      track.notes.forEach((note) => {
        const start = Math.round(note.start * division);
        const end = Math.max(start + 10, Math.round((note.start + note.dur) * division));
        const velocity = U.clamp(Math.round(note.vel * 127), 1, 127);
        events.push({ tick: start, order: 3, bytes: [0x90 | channel, U.clamp(note.pitch, 0, 127), velocity] });
        events.push({ tick: end, order: 2, bytes: [0x80 | channel, U.clamp(note.pitch, 0, 127), 0] });
      });
      events.sort((a, b) => a.tick - b.tick || a.order - b.order);
      const data = [];
      let lastTick = 0;
      events.forEach((event) => {
        data.push(...writeVarInt(event.tick - lastTick), ...event.bytes);
        lastTick = event.tick;
      });
      data.push(0, 0xff, 0x2f, 0x00);
      parts.push(chunk("MTrk", data));
    });

    const header = [0, 1, (parts.length >> 8) & 0xff, parts.length & 0xff, (division >> 8) & 0xff, division & 0xff];
    const bytes = new Uint8Array(chunk("MThd", header).concat(...parts));
    return new Blob([bytes], { type: "audio/midi" });
  }

  NS.midi = {
    parse: parseMidi,
    write: writeMidi,
    guessRole,
    instrumentForRole,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = NS.midi;
})();
