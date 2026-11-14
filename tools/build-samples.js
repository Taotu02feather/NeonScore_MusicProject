"use strict";

/**
 * Build the editable example scores in scores/.
 * The riff is the "Oriental riff" / 東方連復段:
 * C D E F G F# Eb C# C — a public, widely-circulated motif.
 * Sheet-music reference: Wikimedia Commons, AsianRiffSheetMusic.png (CC BY-SA 3.0).
 */

const fs = require("fs");
const path = require("path");

globalThis.NS = globalThis.NS || {};
require("../js/util.js");
require("../js/theory.js");
require("../js/presets.js");
const M = require("../js/model.js");
const MIDI = require("../js/midi.js");

const root = path.resolve(__dirname, "..");
const scoresDir = path.join(root, "scores");

const RIFF = [0, 2, 4, 5, 7, 6, 3, 1]; // C D E F G F# Eb C#
const RESPONSE = [7, 8, 7, 5]; // G Ab G F

function addRiff(track, startBeat, shift, velocity) {
  const base = 60 + shift;
  RIFF.forEach((offset, index) => {
    track.notes.push(M.note(base + offset, startBeat + index * 0.5, 0.46, velocity));
  });
  track.notes.push(M.note(base, startBeat + 4, 1.8, velocity + 0.04));
  RESPONSE.forEach((offset, index) => {
    track.notes.push(M.note(base + offset, startBeat + 6 + index * 0.5, 0.44, velocity - 0.08));
  });
}

function makeSynthwave() {
  const song = M.createSong({
    title: "東方連復段 · SYNTHWAVE",
    bpm: 108,
    meter: "4/4",
    bars: 16,
    root: 0,
    mode: "minor",
    progressionPreset: "bittersweet",
    styleId: "synthwave",
  });
  M.applyStyle(song, "synthwave");
  song.density = 70;

  const lead = song.tracks.find((track) => track.role === "lead");
  [0, 8].forEach((startBeat) => addRiff(lead, startBeat, 0, 0.9));
  [16, 24].forEach((startBeat) => addRiff(lead, startBeat, 12, 0.94));
  [48, 56].forEach((startBeat) => addRiff(lead, startBeat, 12, 0.96));

  const box = M.createTrack("extra", 5, "synthwave");
  box.name = "八音盒插段";
  box.instrument = "musicBox";
  box.color = "#ffd36e";
  box.volume = 0.8;
  [32, 40].forEach((startBeat) => addRiff(box, startBeat, 12, 0.82));
  song.tracks.push(box);

  M.generateArrangement(song, { preserveLead: true, seed: 1984 });

  const drums = song.tracks.find((track) => track.role === "drums");
  if (drums) {
    drums.notes = drums.notes.filter((note) => note.start < 32 || note.start >= 48);
    drums.notes.push(M.note(49, 48, 0.8, 0.25));
    drums.notes.push(M.note(49, 0, 0.8, 0.22));
  }

  song.fx = { reverb: 44, delay: 30, drive: 28, sidechain: 80, brightness: 62 };
  return song;
}

function makeMusicBox() {
  const song = M.createSong({
    title: "東方連復段 · 八音盒",
    bpm: 84,
    meter: "4/4",
    bars: 8,
    root: 0,
    mode: "minor",
    progressionPreset: "bittersweet",
    styleId: "musicbox",
  });
  M.applyStyle(song, "musicbox");
  song.density = 34;
  song.arpPattern = "up";
  song.swing = 0;
  const lead = song.tracks.find((track) => track.role === "lead");
  [0, 8, 16, 24].forEach((startBeat, index) => addRiff(lead, startBeat, index >= 2 ? 12 : 0, 0.84));
  lead.volume = 0.9;
  const pad = song.tracks.find((track) => track.role === "pad");
  if (pad) pad.volume = 0.66;
  M.generateArrangement(song, { preserveLead: true, seed: 84 });
  song.fx = { reverb: 68, delay: 38, drive: 4, sidechain: 18, brightness: 55 };
  return song;
}

function makeChiptune() {
  const song = M.createSong({
    title: "東方連復段 · CHIPTUNE",
    bpm: 138,
    meter: "4/4",
    bars: 8,
    root: 0,
    mode: "minor",
    progressionPreset: "bittersweet",
    styleId: "chip",
  });
  M.applyStyle(song, "chip");
  song.density = 84;
  song.arpPattern = "up";
  const lead = song.tracks.find((track) => track.role === "lead");
  [0, 8].forEach((startBeat) => addRiff(lead, startBeat, 0, 0.86));
  [16, 24].forEach((startBeat) => addRiff(lead, startBeat, 12, 0.9));
  lead.volume = 0.82;
  M.generateArrangement(song, { preserveLead: true, seed: 138 });
  song.fx = { reverb: 9, delay: 20, drive: 40, sidechain: 45, brightness: 84 };
  return song;
}

function project(song) {
  return {
    app: "NEONSCORE",
    schema: 1,
    savedAt: new Date().toISOString(),
    song,
  };
}

function writeJson(name, song) {
  fs.writeFileSync(path.join(scoresDir, name), `${JSON.stringify(project(song), null, 2)}\n`, "utf8");
}

async function writeMidi(name, song) {
  const blob = MIDI.write(song);
  const bytes = Buffer.from(await blob.arrayBuffer());
  fs.writeFileSync(path.join(scoresDir, name), bytes);
}

async function main() {
  fs.mkdirSync(path.join(scoresDir, "input"), { recursive: true });
  fs.mkdirSync(path.join(scoresDir, "output"), { recursive: true });

  const synthwave = makeSynthwave();
  const musicbox = makeMusicBox();
  const chiptune = makeChiptune();

  const files = [
    ["oriental-riff-synthwave.json", synthwave],
    ["oriental-riff-musicbox.json", musicbox],
    ["oriental-riff-chiptune.json", chiptune],
  ];
  files.forEach(([name, song]) => writeJson(name, song));

  const library = [
    {
      id: "oriental-riff-synthwave",
      title: "東方連復段 · SYNTHWAVE",
      description: "16 小节完整编曲。第 9–12 小节切到八音盒插段，再回到全乐队，用来展示音色切换。",
      styleLabel: "SYNTHWAVE",
      style: "synthwave",
      color: "#ff4fd8",
      badge: "16 BARS",
      license: "Melody reference: Wikimedia Commons, AsianRiffSheetMusic.png, CC BY-SA 3.0. Arrangement: NeonScore.",
      song: synthwave,
    },
    {
      id: "oriental-riff-musicbox",
      title: "東方連復段 · 八音盒",
      description: "84 BPM 的纯八音盒版本：音乐盒主音、玻璃铺底、稀疏低音，没有鼓组。",
      styleLabel: "MUSIC BOX",
      style: "musicbox",
      color: "#ffd36e",
      badge: "8 BARS",
      license: "Melody reference: Wikimedia Commons, AsianRiffSheetMusic.png, CC BY-SA 3.0. Arrangement: NeonScore.",
      song: musicbox,
    },
    {
      id: "oriental-riff-chiptune",
      title: "東方連復段 · CHIPTUNE",
      description: "138 BPM 的 8-bit 版本：脉冲波主音、三角波贝斯、芯片鼓组，第二遍升八度。",
      styleLabel: "CHIPTUNE",
      style: "chip",
      color: "#58f5b0",
      badge: "8 BARS",
      license: "Melody reference: Wikimedia Commons, AsianRiffSheetMusic.png, CC BY-SA 3.0. Arrangement: NeonScore.",
      song: chiptune,
    },
  ];

  const libraryCode = `/* Generated by tools/build-samples.js — do not edit by hand. */\nwindow.NEON_SCORE_LIBRARY = ${JSON.stringify(library, null, 2)};\n`;
  fs.writeFileSync(path.join(scoresDir, "library.js"), libraryCode, "utf8");

  await writeMidi("oriental-riff-synthwave.mid", synthwave);

  files.forEach(([name, song]) => {
    console.log(`${name}: ${song.tracks.length} tracks, ${M.noteCount(song)} notes, ${M.durationSeconds(song).toFixed(1)}s`);
  });
  console.log(`library.js: ${(libraryCode.length / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
