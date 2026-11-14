"use strict";

/**
 * Build full-length local NeonScore edits from user-provided Touhou MIDIs.
 * Personal local arrangements only; compositions remain © ZUN / Team Shanghai Alice.
 */

const fs = require("fs");
const path = require("path");

globalThis.NS = globalThis.NS || {};
const U = require("../js/util.js");
require("../js/theory.js");
require("../js/presets.js");
const M = require("../js/model.js");
const MIDI = require("../js/midi.js");
const TEXT = require("../js/textscore.js");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "TouhouMid");
const outDir = path.join(root, "scores", "Touhou");
fs.mkdirSync(outDir, { recursive: true });

const CONFIGS = [
  {
    file: "th06_05.mid",
    slug: "th06_05",
    title: "TH06_05 おてんば恋娘 · Full NeonScore Edit",
    displayTitle: "TH06_05 おてんば恋娘（全曲）",
    game: "東方紅魔郷 ～ the Embodiment of Scarlet Devil.",
    originalTitle: "おてんば恋娘 / Beloved Tomboyish Girl",
    keyRoot: 2,
    keyMode: "major",
    progressionPreset: "axis",
    styleId: "synthwave",
    styleLabel: "SYNTHWAVE",
    color: "#ff5f9e",
    chords: [
      "Bm7", "Bm7", "Bm7", "Bm7",
      "G", "G", "G", "A",
    ],
    density: 72,
    arpPattern: "updown",
    drumStyle: "classic",
    swing: 0,
    fx: { reverb: 38, delay: 24, drive: 34, sidechain: 82, brightness: 64 },
    tracks: [
      { role: "lead", name: "主旋律（原曲电钢）", channel: 2, transpose: 0, instrument: "electricPiano", color: "#ff4fd8", volume: 0.9 },
      { role: "arp", name: "原曲琶音层", channel: 4, transpose: 0, instrument: "glassArp", color: "#55e6ff", volume: 0.58 },
      { role: "bass", name: "原曲贝斯", channel: 1, transpose: 12, instrument: "analogBass", color: "#ff9d5c", volume: 0.8 },
      { role: "pad", name: "电钢和声", channel: 8, transpose: 0, instrument: "electricPiano", color: "#9b8cff", volume: 0.42 },
      { role: "extra", name: "弦乐层", channel: 6, transpose: 0, instrument: "stringPad", color: "#9d9bff", volume: 0.34 },
      { role: "drums", name: "原曲鼓组", channel: 9, transpose: 0, instrument: "gated80s", color: "#58f5b0", volume: 0.86 },
      { role: "extra", name: "高音副旋律", channel: 7, transpose: -12, instrument: "crystalLead", color: "#7fe8ff", volume: 0.26 },
    ],
    seed: 6505,
    description: "全曲 57 小节。主旋律为原曲 Ch3 电钢，Ch7 高音为副旋律；保留原曲琶音、弦乐与鼓组。",
  },
  {
    file: "th06_14.mid",
    slug: "th06_14",
    title: "TH06_14 魔法少女達の百年祭 · Full NeonScore Edit",
    displayTitle: "TH06_14 魔法少女達の百年祭（全曲）",
    game: "東方紅魔郷 ～ the Embodiment of Scarlet Devil.",
    originalTitle: "魔法少女達の百年祭 / The Centennial Festival for Magical Girls",
    keyRoot: 10,
    keyMode: "minor",
    progressionPreset: "dark",
    styleId: "darksynth",
    styleLabel: "DARKSYNTH",
    color: "#ff6d8d",
    chords: ["Ebm7", "Ebm7", "Ebm7", "Bmaj7"],
    density: 84,
    arpPattern: "offbeat",
    drumStyle: "four",
    swing: 0,
    fx: { reverb: 22, delay: 18, drive: 60, sidechain: 88, brightness: 70 },
    tracks: [
      { role: "lead", name: "主旋律（原曲方波）", channel: 2, transpose: -12, instrument: "squareHero", color: "#ff4fd8", volume: 0.9 },
      { role: "lead", name: "東方連復段（原曲 Ch8）", channel: 7, transpose: -12, instrument: "crystalLead", color: "#7fe8ff", volume: 0.72 },
      { role: "bass", name: "原曲贝斯", channel: 1, transpose: 0, instrument: "fmBass", color: "#ff9d5c", volume: 0.8 },
      { role: "pad", name: "原曲弦乐", channel: 4, transpose: -12, instrument: "stringPad", color: "#9b8cff", volume: 0.55 },
      { role: "extra", name: "铜管层", channel: 5, transpose: -12, instrument: "crystalLead", color: "#ffd36e", volume: 0.26 },
      { role: "extra", name: "高音副旋律", channel: 6, transpose: -12, instrument: "crystalLead", color: "#7fe8ff", volume: 0.24 },
      { role: "extra", name: "电钢层", channel: 3, transpose: 0, instrument: "electricPiano", color: "#ffb36b", volume: 0.34 },
      { role: "drums", name: "原曲鼓组", channel: 9, transpose: 0, instrument: "gated80s", color: "#58f5b0", volume: 0.86 },
    ],
    seed: 6014,
    description: "全曲 64 小节。原曲方波主音、弦乐、铜管、电钢、贝斯与鼓组完整保留；第 22–29 小节的 Ch8 琶音段其实是该段主旋律「東方連復段」，已单独提升为 lead。Darksynth 配器。",
  },
  {
    file: "th09_04.mid",
    slug: "th09_04",
    title: "TH09_04 フラワリングナイト · Full NeonScore Edit",
    displayTitle: "TH09_04 フラワリングナイト（全曲）",
    game: "東方花映塚 ～ Phantasmagoria of Flower View.",
    originalTitle: "フラワリングナイト / Flowering Night",
    keyRoot: 7,
    keyMode: "minor",
    progressionPreset: "bittersweet",
    styleId: "citypop",
    styleLabel: "CITY POP",
    color: "#ffae73",
    chords: ["Dm7", "Cm7", "Gm7", "D7", "Dm7", "Cm7", "Gm7", "Bbmaj7"],
    density: 66,
    arpPattern: "offbeat",
    drumStyle: "city",
    swing: 18,
    fx: { reverb: 32, delay: 20, drive: 18, sidechain: 34, brightness: 66 },
    tracks: [
      { role: "lead", name: "主旋律（原曲钢琴）", channel: 0, transpose: -12, instrument: "electricPiano", color: "#ff4fd8", volume: 0.88 },
      { role: "arp", name: "原曲琶音层", channel: 14, transpose: -12, instrument: "glassArp", color: "#55e6ff", volume: 0.32 },
      { role: "bass", name: "原曲贝斯", channel: 12, transpose: 0, instrument: "rubberBass", color: "#ff9d5c", volume: 0.8 },
      { role: "pad", name: "原曲弦乐", channel: 11, transpose: -12, instrument: "stringPad", color: "#9b8cff", volume: 0.52 },
      { role: "extra", name: "前奏铺底", channel: 15, transpose: 0, instrument: "glassPad", color: "#76b9ff", volume: 0.32 },
      { role: "extra", name: "间奏主音", channel: 8, transpose: -12, instrument: "crystalLead", color: "#ffd36e", volume: 0.28 },
      { role: "drums", name: "原曲鼓组", channel: 9, transpose: 0, instrument: "studio84", color: "#58f5b0", volume: 0.86 },
    ],
    seed: 9004,
    description: "全曲 64 小节。原曲电钢主旋律、弦乐、贝斯、琶音、前奏铺底与鼓组完整保留，City Pop 配器。",
  },
];

function buildTrack(spec, index, byChannel, styleId, totalBeats) {
  const source = byChannel.get(spec.channel);
  if (!source || !source.notes.length) return null;
  const track = M.createTrack(spec.role, index, styleId);
  track.name = spec.name;
  track.instrument = spec.instrument;
  track.color = spec.color;
  track.volume = spec.volume;
  track.notes = source.notes
    .filter((note) => note.start < totalBeats - 0.001)
    .map((note) => M.note(
      U.clamp(note.pitch + spec.transpose, 0, 127),
      note.start,
      Math.max(0.04, Math.min(note.dur, totalBeats - note.start)),
      note.vel
    ));
  return track;
}

function build(config) {
  const sourcePath = path.join(sourceDir, config.file);
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing source MIDI: ${sourcePath}`);
  const buffer = fs.readFileSync(sourcePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const midi = MIDI.parse(arrayBuffer, { title: config.file, maxTracks: 20 });
  const byChannel = new Map(midi.tracks.map((track) => [track.sourceChannel, track]));

  // Use the full parsed song length; no excerpt window.
  const bars = midi.bars;
  const totalBeats = bars * midi.beatsPerBar;

  const song = M.createSong({
    title: config.title,
    bpm: midi.bpm,
    meter: midi.meter,
    bars,
    root: config.keyRoot,
    mode: config.keyMode,
    progressionPreset: config.progressionPreset,
    styleId: config.styleId,
  });
  M.applyStyle(song, config.styleId);
  song.chords = Array.from({ length: bars }, (_, index) => config.chords[index % config.chords.length]);
  song.density = config.density;
  song.arpPattern = config.arpPattern;
  song.drumStyle = config.drumStyle;
  song.swing = config.swing;
  song.fx = { ...config.fx };
  song.tracks = [];

  config.tracks.forEach((spec, index) => {
    const track = buildTrack(spec, index, byChannel, config.styleId, totalBeats);
    if (track) song.tracks.push(track);
  });

  if (!song.tracks.length) throw new Error(`${config.file}: no usable tracks`);

  const normalized = M.normalizeSong(song);
  const project = {
    app: "NEONSCORE",
    schema: 1,
    savedAt: new Date().toISOString(),
    source: {
      file: `TouhouMid/${config.file}`,
      title: config.originalTitle,
      game: config.game,
      composer: "ZUN / Team Shanghai Alice",
      section: `full song · ${bars} bars`,
      note: "Local personal edit from user-provided MIDI. Original composition © ZUN / Team Shanghai Alice; not for redistribution.",
    },
    song: normalized,
  };

  fs.writeFileSync(path.join(outDir, `${config.slug}-neonscore.json`), `${JSON.stringify(project, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, `${config.slug}-neonscore.nst`), TEXT.stringify(normalized), "utf8");
  return { config, normalized, project };
}

async function main() {
  const built = [];
  for (const config of CONFIGS) {
    const result = build(config);
    const blob = MIDI.write(result.normalized);
    fs.writeFileSync(path.join(outDir, `${config.slug}-neonscore.mid`), Buffer.from(await blob.arrayBuffer()));
    built.push(result);
  }

  const localLibrary = built.map(({ config, normalized }) => ({
    id: `touhou-${config.slug.replace("_", "-")}`,
    title: config.displayTitle,
    description: config.description,
    styleLabel: config.styleLabel,
    style: config.styleId,
    color: config.color,
    badge: "LOCAL",
    license: "Touhou Project music © ZUN / Team Shanghai Alice. Local personal edit from user-provided MIDI; not for redistribution.",
    song: normalized,
  }));

  fs.writeFileSync(
    path.join(root, "scores", "local-library.js"),
    `/* Generated by tools/build-touhou-edit.js — full local Touhou edits. */\nwindow.NEON_LOCAL_LIBRARY = ${JSON.stringify(localLibrary, null, 2)};\n`,
    "utf8"
  );

  built.forEach(({ config, normalized }) => {
    console.log(`${config.slug}: ${normalized.bars} bars, ${normalized.tracks.length} tracks, ${M.noteCount(normalized)} notes, ${M.durationSeconds(normalized).toFixed(1)}s`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
