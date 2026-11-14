(function () {
  "use strict";
  const NS = (window.NS = window.NS || {});
  const U = NS.util;

  function localName(element) {
    return (element.localName || element.nodeName || "").replace(/^.*:/, "");
  }

  function childByName(element, name) {
    if (!element) return null;
    for (let i = 0; i < element.children.length; i += 1) {
      if (localName(element.children[i]) === name) return element.children[i];
    }
    return null;
  }

  function childrenByName(element, name) {
    if (!element) return [];
    return Array.from(element.children).filter((child) => localName(child) === name);
  }

  function childText(element, name) {
    const child = childByName(element, name);
    return child ? String(child.textContent || "").trim() : "";
  }

  function descendantsByName(element, name) {
    if (!element) return [];
    return Array.from(element.getElementsByTagName("*")).filter((item) => localName(item) === name);
  }

  function pitchToMidi(step, alter, octave) {
    const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    return (octave + 1) * 12 + (semitones[step] == null ? 0 : semitones[step]) + alter;
  }

  function parseXml(text) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "application/xml");
    const error = doc.getElementsByTagName("parsererror")[0];
    if (error) throw new Error("MusicXML 解析失败：" + (error.textContent || "XML 格式错误").slice(0, 180));
    return doc;
  }

  function parseScore(xmlText, options) {
    const opts = options || {};
    const doc = parseXml(xmlText);
    const root = doc.documentElement;
    const rootName = localName(root);
    if (rootName === "score-timewise") {
      throw new Error("暂不支持 timewise 版 MusicXML，请在制谱软件中导出 partwise 格式。");
    }
    if (rootName !== "score-partwise") {
      throw new Error("这不是 MusicXML 乐谱文件。");
    }

    const title = childText(childByName(root, "work"), "work-title")
      || childText(root, "movement-title")
      || (descendantsByName(root, "credit-words")[0] ? descendantsByName(root, "credit-words")[0].textContent.trim() : "")
      || opts.title
      || "IMPORTED MUSICXML";

    const partNames = {};
    const partPrograms = {};
    const partList = childByName(root, "part-list");
    if (partList) {
      childrenByName(partList, "score-part").forEach((scorePart) => {
        const id = scorePart.getAttribute("id");
        if (!id) return;
        partNames[id] = childText(scorePart, "part-name") || id;
        const midiInstrument = childByName(scorePart, "midi-instrument");
        if (midiInstrument) {
          const program = parseInt(childText(midiInstrument, "midi-program"), 10);
          if (Number.isFinite(program)) partPrograms[id] = U.clamp(program - 1, 0, 127);
        }
      });
    }

    let bpm = 100;
    const tempoNodes = descendantsByName(root, "sound").filter((node) => node.getAttribute("tempo"));
    if (tempoNodes.length) {
      const tempo = parseFloat(tempoNodes[0].getAttribute("tempo"));
      if (Number.isFinite(tempo) && tempo > 0) bpm = U.clamp(Math.round(tempo), 40, 220);
    } else {
      const perMinute = descendantsByName(root, "per-minute")[0];
      if (perMinute) {
        const tempo = parseFloat(perMinute.textContent);
        if (Number.isFinite(tempo) && tempo > 0) bpm = U.clamp(Math.round(tempo), 40, 220);
      }
    }

    const parts = childrenByName(root, "part");
    if (!parts.length) throw new Error("MusicXML 中没有找到声部。");
    const tracks = [];
    const warnings = [];
    let globalBeatsPerBar = 4;
    let globalMeter = null;
    let maxMeasureCount = 0;
    let maxBeat = 0;
    let firstFifths = null;

    parts.forEach((part, partIndex) => {
      const partId = part.getAttribute("id") || `P${partIndex + 1}`;
      const partName = partNames[partId] || `Part ${partIndex + 1}`;
      const measures = childrenByName(part, "measure");
      if (!measures.length) return;
      maxMeasureCount = Math.max(maxMeasureCount, measures.length);

      let divisions = 1;
      let barBeats = 4;
      let measureStart = 0;
      let lastStartDiv = 0;
      const notes = [];

      measures.forEach((measure) => {
        let cursor = 0;
        let changedBarLength = false;
        const attributes = childByName(measure, "attributes");
        if (attributes) {
          const divisionsText = childText(attributes, "divisions");
          if (divisionsText) {
            const parsed = parseInt(divisionsText, 10);
            if (parsed > 0) divisions = parsed;
          }
          const time = childByName(attributes, "time");
          if (time) {
            const beats = parseInt(childText(time, "beats"), 10);
            const beatType = parseInt(childText(time, "beat-type"), 10);
            if (beats > 0 && beatType > 0) {
              const raw = (beats * 4) / beatType;
              const rounded = [2, 3, 4, 5, 6].includes(Math.round(raw)) ? Math.round(raw) : 4;
              if (rounded !== barBeats) changedBarLength = true;
              barBeats = rounded;
              if (!globalMeter) globalMeter = `${beats}/${beatType}`;
              if (measure === measures[0]) globalBeatsPerBar = rounded;
            }
          }
          const key = childByName(attributes, "key");
          if (key && firstFifths == null) {
            const fifths = parseInt(childText(key, "fifths"), 10);
            if (Number.isFinite(fifths)) firstFifths = fifths;
          }
        }

        Array.from(measure.children).forEach((node) => {
          const name = localName(node);
          if (name === "backup") {
            cursor -= parseInt(childText(node, "duration"), 10) || 0;
            cursor = Math.max(0, cursor);
          } else if (name === "forward") {
            cursor += parseInt(childText(node, "duration"), 10) || 0;
          } else if (name === "note") {
            const durationDiv = parseInt(childText(node, "duration"), 10) || 0;
            const isChord = Boolean(childByName(node, "chord"));
            const isGrace = Boolean(childByName(node, "grace"));
            const startDiv = isChord ? lastStartDiv : cursor;
            if (!isChord && !isGrace) lastStartDiv = startDiv;

            if (!isGrace) {
              if (!isChord) cursor += durationDiv;
            }

            if (isGrace) return;
            const rest = childByName(node, "rest");
            if (rest) return;

            let pitch = null;
            const pitchNode = childByName(node, "pitch");
            if (pitchNode) {
              const step = childText(pitchNode, "step").toUpperCase();
              const alter = parseFloat(childText(pitchNode, "alter") || "0") || 0;
              const octave = parseInt(childText(pitchNode, "octave"), 10);
              if (step && Number.isFinite(octave)) pitch = pitchToMidi(step, alter, octave);
            } else if (childByName(node, "unpitched")) {
              const instrumentText = (descendantsByName(node, "instrument")[0] || {}).textContent || "";
              const lower = instrumentText.toLowerCase();
              pitch = lower.includes("kick") ? 36 : lower.includes("hat") ? 42 : lower.includes("tom") ? 45 : 38;
            }
            if (pitch == null || !Number.isFinite(pitch)) return;

            const startBeat = measureStart + startDiv / divisions;
            const durationBeats = durationDiv / divisions;
            if (durationBeats <= 0) return;
            const tieNodes = childrenByName(node, "tie");
            const tiedNodes = descendantsByName(node, "tied");
            const tieStart = tieNodes.some((tie) => tie.getAttribute("type") === "start")
              || tiedNodes.some((tie) => tie.getAttribute("type") === "start");
            const tieStop = tieNodes.some((tie) => tie.getAttribute("type") === "stop")
              || tiedNodes.some((tie) => tie.getAttribute("type") === "stop");
            const velocityNode = childByName(node, "velocity");
            const velocity = velocityNode ? U.clamp(parseFloat(velocityNode.textContent) / 127, 0.1, 1) : 0.8;

            notes.push({
              id: U.uid("n"),
              pitch: U.clamp(Math.round(pitch), 0, 127),
              start: Math.round(startBeat * 96) / 96,
              dur: Math.max(1 / 96, Math.round(durationBeats * 96) / 96),
              vel: velocity,
              tieStart,
              tieStop,
            });
          }
        });

        measureStart += barBeats;
        if (changedBarLength) globalBeatsPerBar = barBeats;
      });

      if (!notes.length) return;

      notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
      const merged = [];
      notes.forEach((note) => {
        const previous = merged[merged.length - 1];
        if (
          previous
          && previous.tieStart
          && note.tieStop
          && previous.pitch === note.pitch
          && Math.abs(previous.start + previous.dur - note.start) < 0.02
        ) {
          previous.dur = Math.max(previous.dur, note.start + note.dur - previous.start);
          previous.tieStart = note.tieStart;
        } else {
          merged.push(note);
        }
      });

      const isDrum = /drum|perc|鼓|打击/i.test(partName);
      const program = partPrograms[partId];
      const role = NS.midi.guessRole(partName, program, merged, isDrum);
      const cleanedNotes = merged.map((note) => ({
        id: U.uid("n"),
        pitch: note.pitch,
        start: note.start,
        dur: note.dur,
        vel: note.vel,
      }));
      maxBeat = Math.max(maxBeat, cleanedNotes.reduce((max, note) => Math.max(max, note.start + note.dur), 0));

      tracks.push({
        id: U.uid("t"),
        name: partName || NS.model.ROLE_NAMES[role] || `Part ${partIndex + 1}`,
        role,
        instrument: NS.midi.instrumentForRole(role, program, partName),
        color: NS.model.ROLE_COLORS[role] || NS.model.ROLE_COLORS.extra,
        volume: role === "pad" ? 0.68 : role === "drums" ? 0.84 : 0.8,
        mute: false,
        solo: false,
        notes: cleanedNotes,
      });
    });

    if (!tracks.length) throw new Error("MusicXML 中没有可用的音符。");

    const beatsPerBar = [2, 3, 4, 5, 6].includes(globalBeatsPerBar) ? globalBeatsPerBar : 4;
    let bars = Math.max(4, maxMeasureCount, Math.ceil(maxBeat / beatsPerBar));
    if (bars > 64) {
      bars = 64;
      warnings.push("乐曲超过 64 小节，已截断。");
    }
    const total = bars * beatsPerBar;
    tracks.forEach((track) => {
      track.notes = track.notes.filter((note) => note.start < total).map((note) => ({
        id: U.uid("n"),
        pitch: note.pitch,
        start: Math.min(note.start, total - 0.05),
        dur: Math.max(0.04, Math.min(note.dur, total - note.start)),
        vel: note.vel,
      }));
    });

    tracks.sort((a, b) => b.notes.length - a.notes.length);
    const limited = tracks.slice(0, 16);
    if (tracks.length > 16) warnings.push(`检测到 ${tracks.length} 个声部，仅载入音符最多的 16 个。`);

    return {
      title: String(title).trim().slice(0, 40) || "IMPORTED MUSICXML",
      bpm,
      meter: globalMeter || `${beatsPerBar}/4`,
      beatsPerBar,
      bars,
      tracks: limited,
      fifths: firstFifths,
      warnings,
    };
  }

  /* ----------------------------- MXL unzip ----------------------------- */

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("当前浏览器不支持解压 .mxl。请将文件解压后导入其中的 .musicxml。");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }

  async function readZip(arrayBuffer) {
    const MAX_ENTRIES = 256;
    const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
    const MAX_TOTAL_BYTES = 48 * 1024 * 1024;
    const view = new DataView(arrayBuffer);
    let eocd = -1;
    const minPos = Math.max(0, arrayBuffer.byteLength - 65557);
    for (let i = arrayBuffer.byteLength - 22; i >= minPos; i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error("无法识别的 .mxl 压缩包。");
    const count = view.getUint16(eocd + 10, true);
    const centralOffset = view.getUint32(eocd + 16, true);
    if (count > MAX_ENTRIES) throw new Error("压缩包条目过多，已拒绝解析。");
    if (centralOffset + 46 > arrayBuffer.byteLength) throw new Error("压缩包的中央目录越界。");
    let pointer = centralOffset;
    const entries = new Map();
    const decoder = new TextDecoder("utf-8");
    let totalUncompressed = 0;

    for (let i = 0; i < count; i += 1) {
      if (pointer + 46 > arrayBuffer.byteLength) throw new Error("压缩包条目越界。");
      if (view.getUint32(pointer, true) !== 0x02014b50) break;
      const method = view.getUint16(pointer + 10, true);
      const compressedSize = view.getUint32(pointer + 20, true);
      const uncompressedSize = view.getUint32(pointer + 24, true);
      const nameLength = view.getUint16(pointer + 28, true);
      const extraLength = view.getUint16(pointer + 30, true);
      const commentLength = view.getUint16(pointer + 32, true);
      const localOffset = view.getUint32(pointer + 42, true);
      if (pointer + 46 + nameLength > arrayBuffer.byteLength) throw new Error("压缩包文件名越界。");
      const nameBytes = new Uint8Array(arrayBuffer, pointer + 46, nameLength);
      const name = decoder.decode(nameBytes).replace(/\\/g, "/");
      pointer += 46 + nameLength + extraLength + commentLength;
      if (name.endsWith("/")) continue;

      const lowerName = name.toLowerCase();
      const wanted = lowerName === "meta-inf/container.xml"
        || lowerName.endsWith(".musicxml")
        || lowerName.endsWith(".xml");
      if (!wanted) continue;

      if (method === 0) {
        if (compressedSize > MAX_ENTRY_BYTES) throw new Error("压缩包中的乐谱文件过大。");
      } else if (method === 8) {
        if (!uncompressedSize || uncompressedSize > MAX_ENTRY_BYTES) {
          throw new Error("压缩包声明的大小无效或过大。");
        }
      } else {
        continue;
      }
      totalUncompressed += method === 0 ? compressedSize : uncompressedSize;
      if (totalUncompressed > MAX_TOTAL_BYTES) throw new Error("压缩包解压后的内容过大。");

      if (localOffset + 30 > arrayBuffer.byteLength) throw new Error("压缩包局部头越界。");
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      if (dataStart + compressedSize > arrayBuffer.byteLength) throw new Error("压缩包数据越界。");
      let data;
      if (method === 0) {
        data = new Uint8Array(arrayBuffer, dataStart, compressedSize);
      } else {
        data = await inflateRaw(new Uint8Array(arrayBuffer, dataStart, compressedSize));
      }
      if (data.length > MAX_ENTRY_BYTES) throw new Error("解压后的乐谱文件过大。");
      entries.set(name, { data, uncompressedSize });
    }
    return entries;
  }

  function findEntry(entries, predicate) {
    for (const [name, entry] of entries.entries()) {
      if (predicate(name)) return { name, ...entry };
    }
    return null;
  }

  async function parseFile(arrayBuffer, filename, options) {
    const bytes = new Uint8Array(arrayBuffer);
    const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    const lower = String(filename || "").toLowerCase();
    if (!isZip && !lower.endsWith(".mxl")) {
      const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
      return parseScore(text, options);
    }

    const entries = await readZip(arrayBuffer);
    let rootPath = null;
    const container = findEntry(entries, (name) => name.toLowerCase() === "meta-inf/container.xml");
    if (container) {
      const xml = new TextDecoder("utf-8").decode(container.data);
      const doc = parseXml(xml);
      const rootfile = descendantsByName(doc.documentElement, "rootfile")[0];
      if (rootfile) rootPath = rootfile.getAttribute("full-path");
    }
    if (!rootPath) {
      const candidate = findEntry(entries, (name) => {
        const n = name.toLowerCase();
        return (n.endsWith(".musicxml") || n.endsWith(".xml")) && !n.startsWith("meta-inf/");
      });
      if (candidate) rootPath = candidate.name;
    }
    if (!rootPath) throw new Error("压缩包中没有找到 MusicXML 文件。");
    const entry = entries.get(rootPath)
      || findEntry(entries, (name) => name.toLowerCase() === rootPath.toLowerCase());
    if (!entry) throw new Error("压缩包中的 MusicXML 文件路径无效。");
    const text = new TextDecoder("utf-8").decode(entry.data).replace(/^\uFEFF/, "");
    return parseScore(text, options);
  }

  NS.musicxml = {
    parse: parseScore,
    parseFile,
    readZip,
  };
})();
