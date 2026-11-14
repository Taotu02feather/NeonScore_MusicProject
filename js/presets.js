(function () {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const NS = (root.NS = root.NS || {});

  const PRESET_GROUPS = [
    { id: "lead", name: "主音 / LEAD" },
    { id: "arp", name: "琶音 / ARP" },
    { id: "bass", name: "低音 / BASS" },
    { id: "pad", name: "铺底 / PAD" },
    { id: "drums", name: "鼓组 / DRUMS" },
  ];

  /**
   * Generic voice preset.
   * osc types: sine | triangle | sawtooth | square | pulse25 | pulse12 | organ
   * amp: attack, decay, sustain (0..1), release (seconds)
   * filter.env is the cutoff envelope amount in Hz; filter.key tracks pitch.
   */
  const PRESETS = {
    /* ----------------------------- LEADS ----------------------------- */
    neonSaw: {
      id: "neonSaw", name: "霓虹锯齿", en: "NEON SAW", category: "lead", color: "#ff4fd8",
      desc: "双锯齿失谐 + 低八度方波，宽银幕 80 年代主音。",
      gain: 0.24,
      osc: [
        { type: "sawtooth", detune: -9, gain: 0.48, pan: -0.16 },
        { type: "sawtooth", detune: 9, gain: 0.48, pan: 0.16 },
        { type: "square", octave: -1, gain: 0.12, pan: 0 },
      ],
      amp: { a: 0.012, d: 0.18, s: 0.72, r: 0.22 },
      filter: { type: "lowpass", freq: 1150, env: 2800, decay: 0.26, q: 1.15, key: 0.35 },
      vibrato: { rate: 5.1, depth: 5, delay: 0.22 },
      sends: { reverb: 0.24, delay: 0.22 },
    },
    squareHero: {
      id: "squareHero", name: "方波英雄", en: "SQUARE HERO", category: "lead", color: "#b77cff",
      desc: "干脆的方波主音，带一点低八度锯齿，适合强旋律。",
      gain: 0.21,
      osc: [
        { type: "square", detune: 0, gain: 0.5, pan: 0 },
        { type: "pulse25", detune: 7, gain: 0.28, pan: 0.18 },
        { type: "sawtooth", octave: -1, gain: 0.1, pan: -0.1 },
      ],
      amp: { a: 0.004, d: 0.13, s: 0.62, r: 0.13 },
      filter: { type: "lowpass", freq: 1500, env: 2600, decay: 0.19, q: 1.4, key: 0.3 },
      vibrato: { rate: 5.7, depth: 4, delay: 0.28 },
      sends: { reverb: 0.16, delay: 0.26 },
    },
    musicBox: {
      id: "musicBox", name: "八音盒", en: "MUSIC BOX", category: "lead", color: "#ffd36e",
      desc: "FM 金属簧片与高频泛音，带发条盒的清脆尾音。",
      gain: 0.45,
      osc: [
        { type: "sine", gain: 0.64, pan: 0 },
        { type: "sine", octave: 2, detune: 4, gain: 0.14, pan: -0.2 },
        { type: "sine", octave: 4, gain: 0.035, pan: 0.24 },
      ],
      fm: { ratio: 3.01, index: 1150, decay: 0.32, target: 0 },
      amp: { a: 0.002, d: 1.15, s: 0.015, r: 1.35 },
      filter: { type: "lowpass", freq: 9800, env: 0, decay: 0.2, q: 0.2, key: 0 },
      sends: { reverb: 0.5, delay: 0.3 },
    },
    crystalLead: {
      id: "crystalLead", name: "水晶主音", en: "CRYSTAL LEAD", category: "lead", color: "#7fe8ff",
      desc: "玻璃质感的 FM 钟声主音，清亮但不刺耳，适合梦幻段落。",
      gain: 0.34,
      osc: [
        { type: "sine", gain: 0.52, pan: 0 },
        { type: "triangle", octave: 1, gain: 0.2, pan: 0.15 },
        { type: "sine", octave: 2, gain: 0.08, pan: -0.2 },
      ],
      fm: { ratio: 2.0, index: 780, decay: 0.55, target: 0 },
      amp: { a: 0.006, d: 0.85, s: 0.12, r: 0.8 },
      filter: { type: "lowpass", freq: 7600, env: 900, decay: 0.4, q: 0.4, key: 0.15 },
      vibrato: { rate: 4.2, depth: 3, delay: 0.4 },
      sends: { reverb: 0.45, delay: 0.38 },
    },
    softFlute: {
      id: "softFlute", name: "呼吸长笛", en: "BREATH FLUTE", category: "lead", color: "#9cf7cf",
      desc: "柔和的正弦长笛，带一点气声与深颤音，适合慢速旋律。",
      gain: 0.3,
      osc: [
        { type: "sine", gain: 0.62, pan: 0 },
        { type: "triangle", octave: 1, gain: 0.12, pan: 0.1 },
      ],
      noise: { gain: 0.028, filter: "bandpass", freq: 2300, q: 0.8, decay: 0.22 },
      amp: { a: 0.09, d: 0.25, s: 0.8, r: 0.35 },
      filter: { type: "lowpass", freq: 3600, env: 600, decay: 0.4, q: 0.3, key: 0.25 },
      vibrato: { rate: 4.6, depth: 9, delay: 0.28 },
      sends: { reverb: 0.5, delay: 0.18 },
    },
    chipLead: {
      id: "chipLead", name: "芯片主音", en: "CHIP LEAD", category: "lead", color: "#58f5b0",
      desc: "25% 占空比脉冲波，干净利落的 8-bit 游戏机主音。",
      gain: 0.19,
      osc: [
        { type: "pulse25", gain: 0.6, pan: 0 },
        { type: "pulse12", octave: 1, gain: 0.12, pan: 0.12 },
      ],
      amp: { a: 0.002, d: 0.09, s: 0.55, r: 0.045 },
      filter: { type: "lowpass", freq: 5200, env: 1800, decay: 0.08, q: 0.7, key: 0.25 },
      vibrato: { rate: 6.5, depth: 3, delay: 0.15 },
      sends: { reverb: 0.06, delay: 0.16 },
    },
    electricPiano: {
      id: "electricPiano", name: "FM 电钢琴", en: "FM PIANO", category: "lead", color: "#ffae73",
      desc: "80 年代 DX 风格 FM 电钢，圆润、带一点钟声泛音。",
      gain: 0.33,
      osc: [
        { type: "sine", gain: 0.62, pan: 0 },
        { type: "sine", octave: 1, gain: 0.12, pan: 0.12 },
        { type: "sine", octave: 2, gain: 0.035, pan: -0.18 },
      ],
      fm: { ratio: 2.0, index: 620, decay: 0.7, target: 0 },
      amp: { a: 0.004, d: 1.35, s: 0.2, r: 0.55 },
      filter: { type: "lowpass", freq: 6200, env: 1200, decay: 0.5, q: 0.4, key: 0.2 },
      sends: { reverb: 0.28, delay: 0.14 },
    },

    /* ----------------------------- ARPS ----------------------------- */
    glassArp: {
      id: "glassArp", name: "玻璃琶音", en: "GLASS ARP", category: "arp", color: "#55e6ff",
      desc: "短促透明的三角波琶音，带立体声延迟，synthwave 标志性织体。",
      gain: 0.27,
      osc: [
        { type: "triangle", gain: 0.55, pan: -0.18 },
        { type: "sine", octave: 2, detune: 3, gain: 0.18, pan: 0.22 },
      ],
      amp: { a: 0.003, d: 0.3, s: 0.03, r: 0.28 },
      filter: { type: "highpass", freq: 260, env: 0, decay: 0.1, q: 0.4, key: 0 },
      sends: { reverb: 0.28, delay: 0.4 },
    },
    pluckArp: {
      id: "pluckArp", name: "模拟拨弦", en: "ANALOG PLUCK", category: "arp", color: "#b98cff",
      desc: "锯齿与方波叠加的短拨弦，滤波包络清晰，适合切分节奏。",
      gain: 0.25,
      osc: [
        { type: "sawtooth", detune: -6, gain: 0.44, pan: -0.14 },
        { type: "square", detune: 6, gain: 0.28, pan: 0.14 },
      ],
      amp: { a: 0.003, d: 0.22, s: 0.02, r: 0.16 },
      filter: { type: "lowpass", freq: 1000, env: 3600, decay: 0.16, q: 1.8, key: 0.3 },
      sends: { reverb: 0.2, delay: 0.3 },
    },
    bellArp: {
      id: "bellArp", name: "星尘钟琴", en: "STAR BELL", category: "arp", color: "#8ce8ff",
      desc: "清脆的 FM 钟琴，尾音长、泛音亮，适合梦幻与电影感段落。",
      gain: 0.36,
      osc: [
        { type: "sine", gain: 0.56, pan: 0 },
        { type: "sine", octave: 2, detune: 6, gain: 0.12, pan: 0.2 },
      ],
      fm: { ratio: 3.5, index: 980, decay: 0.22, target: 0 },
      amp: { a: 0.002, d: 0.72, s: 0.02, r: 0.72 },
      filter: { type: "lowpass", freq: 9600, env: 0, decay: 0.2, q: 0.2, key: 0 },
      sends: { reverb: 0.45, delay: 0.48 },
    },
    chipArp: {
      id: "chipArp", name: "芯片琶音", en: "CHIP ARP", category: "arp", color: "#48ffb8",
      desc: "12.5% 窄脉冲，干燥、颗粒感强，适合快速 8-bit 琶音。",
      gain: 0.18,
      osc: [
        { type: "pulse12", gain: 0.6, pan: 0 },
        { type: "square", octave: 1, gain: 0.08, pan: 0.15 },
      ],
      amp: { a: 0.001, d: 0.1, s: 0.1, r: 0.05 },
      filter: { type: "lowpass", freq: 7200, env: 0, decay: 0.1, q: 0.5, key: 0 },
      sends: { reverb: 0.05, delay: 0.2 },
    },
    marimbaArp: {
      id: "marimbaArp", name: "木质马林巴", en: "WOOD MARIMBA", category: "arp", color: "#ffb36b",
      desc: "圆润的木质敲击音，带一点簧片感，给电子编曲增加有机质地。",
      gain: 0.34,
      osc: [
        { type: "sine", gain: 0.7, pan: 0 },
        { type: "sine", octave: 2, detune: -3, gain: 0.1, pan: 0.1 },
      ],
      fm: { ratio: 4.0, index: 380, decay: 0.16, target: 0 },
      amp: { a: 0.002, d: 0.38, s: 0.01, r: 0.25 },
      filter: { type: "lowpass", freq: 4800, env: 0, decay: 0.2, q: 0.4, key: 0 },
      sends: { reverb: 0.25, delay: 0.18 },
    },

    /* ----------------------------- BASS ----------------------------- */
    analogBass: {
      id: "analogBass", name: "模拟贝斯", en: "ANALOG BASS", category: "bass", color: "#ff8d5d",
      desc: "锯齿 + 方波 + 正弦重量，低通包络紧实，经典 synthwave 低音。",
      gain: 0.4,
      osc: [
        { type: "sawtooth", detune: -4, gain: 0.4, pan: 0 },
        { type: "square", detune: 4, gain: 0.27, pan: 0 },
        { type: "sine", gain: 0.3, pan: 0 },
      ],
      amp: { a: 0.004, d: 0.17, s: 0.56, r: 0.09 },
      filter: { type: "lowpass", freq: 300, env: 1150, decay: 0.18, q: 2.1, key: 0.25 },
      sends: { reverb: 0.015, delay: 0 },
    },
    subBass: {
      id: "subBass", name: "深潜低音", en: "SUB BASS", category: "bass", color: "#ff6d8d",
      desc: "几乎纯正弦的次低音，干净、深沉，给和声一个稳固地基。",
      gain: 0.48,
      osc: [
        { type: "sine", gain: 0.72, pan: 0 },
        { type: "triangle", gain: 0.15, pan: 0 },
      ],
      amp: { a: 0.012, d: 0.12, s: 0.86, r: 0.14 },
      filter: { type: "lowpass", freq: 220, env: 180, decay: 0.2, q: 0.5, key: 0 },
      sends: { reverb: 0, delay: 0 },
    },
    fmBass: {
      id: "fmBass", name: "FM 贝斯", en: "FM BASS", category: "bass", color: "#ffa53d",
      desc: "带金属边缘的 FM 低音，起音有 click，适合 City Pop 与 Darksynth。",
      gain: 0.36,
      osc: [
        { type: "sine", gain: 0.62, pan: 0 },
        { type: "sine", octave: -1, gain: 0.18, pan: 0 },
      ],
      fm: { ratio: 1.5, index: 420, decay: 0.18, target: 0 },
      amp: { a: 0.003, d: 0.2, s: 0.52, r: 0.11 },
      filter: { type: "lowpass", freq: 420, env: 900, decay: 0.2, q: 1.2, key: 0.2 },
      sends: { reverb: 0.02, delay: 0 },
    },
    chipBass: {
      id: "chipBass", name: "三角芯片贝斯", en: "TRI CHIP", category: "bass", color: "#69f5a8",
      desc: "NES 风格三角波低音，干净、有弹性，不会盖住主旋律。",
      gain: 0.34,
      osc: [
        { type: "triangle", gain: 0.76, pan: 0 },
        { type: "pulse12", octave: 1, gain: 0.07, pan: 0 },
      ],
      amp: { a: 0.002, d: 0.06, s: 0.82, r: 0.04 },
      filter: { type: "lowpass", freq: 900, env: 200, decay: 0.1, q: 0.5, key: 0 },
      sends: { reverb: 0, delay: 0 },
    },
    rubberBass: {
      id: "rubberBass", name: "橡胶贝斯", en: "RUBBER BASS", category: "bass", color: "#ffca6b",
      desc: "弹性极强的滤波低音，带一点共振，适合 Funk 与 City Pop 切分。",
      gain: 0.36,
      osc: [
        { type: "sawtooth", detune: 0, gain: 0.38, pan: 0 },
        { type: "square", octave: 1, gain: 0.1, pan: 0 },
        { type: "sine", gain: 0.32, pan: 0 },
      ],
      amp: { a: 0.004, d: 0.15, s: 0.46, r: 0.08 },
      filter: { type: "lowpass", freq: 260, env: 1700, decay: 0.14, q: 3.2, key: 0.35 },
      sends: { reverb: 0.02, delay: 0 },
    },

    /* ----------------------------- PADS ----------------------------- */
    warmPad: {
      id: "warmPad", name: "暖色铺底", en: "WARM PAD", category: "pad", color: "#c88bff",
      desc: "四层失谐锯齿，慢起音、宽立体声，营造暖色背景墙。",
      gain: 0.115,
      osc: [
        { type: "sawtooth", detune: -14, gain: 0.28, pan: -0.55 },
        { type: "sawtooth", detune: -5, gain: 0.3, pan: -0.2 },
        { type: "sawtooth", detune: 5, gain: 0.3, pan: 0.2 },
        { type: "sawtooth", detune: 14, gain: 0.28, pan: 0.55 },
      ],
      amp: { a: 0.52, d: 0.45, s: 0.82, r: 1.15 },
      filter: { type: "lowpass", freq: 1050, env: 650, decay: 0.9, q: 0.55, key: 0.2 },
      vibrato: { rate: 0.35, depth: 3, delay: 0 },
      sends: { reverb: 0.52, delay: 0 },
    },
    glassPad: {
      id: "glassPad", name: "玻璃云层", en: "GLASS PAD", category: "pad", color: "#76b9ff",
      desc: "高频正弦泛音与柔和三角波，透明的空气感铺底，适合八音盒与梦幻曲。",
      gain: 0.105,
      osc: [
        { type: "sine", detune: -5, gain: 0.35, pan: -0.35 },
        { type: "triangle", detune: 6, gain: 0.3, pan: 0.35 },
        { type: "sine", octave: 1, gain: 0.08, pan: 0.1 },
      ],
      amp: { a: 0.75, d: 0.6, s: 0.78, r: 1.5 },
      filter: { type: "lowpass", freq: 2600, env: 400, decay: 1.1, q: 0.3, key: 0.15 },
      sends: { reverb: 0.65, delay: 0.12 },
    },
    stringPad: {
      id: "stringPad", name: "合成弦乐", en: "STRING ENS.", category: "pad", color: "#9d9bff",
      desc: "带有轻微颤音的弦乐群，温暖、宽阔，是 City Pop 的常用底色。",
      gain: 0.12,
      osc: [
        { type: "sawtooth", detune: -11, gain: 0.27, pan: -0.5 },
        { type: "sawtooth", detune: -4, gain: 0.28, pan: -0.16 },
        { type: "sawtooth", detune: 4, gain: 0.28, pan: 0.16 },
        { type: "sawtooth", detune: 11, gain: 0.27, pan: 0.5 },
      ],
      amp: { a: 0.3, d: 0.5, s: 0.85, r: 0.95 },
      filter: { type: "lowpass", freq: 1750, env: 550, decay: 0.7, q: 0.5, key: 0.25 },
      vibrato: { rate: 4.8, depth: 4, delay: 0.3 },
      sends: { reverb: 0.4, delay: 0.04 },
    },
    darkPad: {
      id: "darkPad", name: "暗色铺底", en: "DARK PAD", category: "pad", color: "#8b5cd6",
      desc: "低通锯齿与低八度方波，压迫感强，适合 Darksynth 的阴影层。",
      gain: 0.14,
      osc: [
        { type: "sawtooth", detune: -10, gain: 0.38, pan: -0.4 },
        { type: "sawtooth", detune: 10, gain: 0.38, pan: 0.4 },
        { type: "square", octave: -1, gain: 0.1, pan: 0 },
      ],
      amp: { a: 0.38, d: 0.35, s: 0.9, r: 0.8 },
      filter: { type: "lowpass", freq: 640, env: 350, decay: 0.8, q: 1.1, key: 0.2 },
      sends: { reverb: 0.32, delay: 0 },
    },
    organPad: {
      id: "organPad", name: "迷幻风琴", en: "FARFISA", category: "pad", color: "#ff9ad5",
      desc: "加法合成的复古风琴，带旋转感，适合 City Pop 与迷幻段落。",
      gain: 0.11,
      osc: [
        { type: "organ", gain: 0.55, pan: -0.2 },
        { type: "sine", octave: 1, gain: 0.1, pan: 0.25 },
      ],
      amp: { a: 0.035, d: 0.2, s: 0.9, r: 0.28 },
      filter: { type: "lowpass", freq: 3800, env: 300, decay: 0.4, q: 0.5, key: 0.15 },
      vibrato: { rate: 6.2, depth: 4, delay: 0.1 },
      sends: { reverb: 0.3, delay: 0.1 },
    },
    chipPad: {
      id: "chipPad", name: "芯片铺底", en: "CHIP PAD", category: "pad", color: "#58f5b0",
      desc: "窄脉冲与三角波构成的 8-bit 和声垫，干净、有颗粒。",
      gain: 0.075,
      osc: [
        { type: "pulse25", detune: -4, gain: 0.3, pan: -0.3 },
        { type: "pulse12", detune: 5, gain: 0.22, pan: 0.3 },
        { type: "triangle", octave: -1, gain: 0.2, pan: 0 },
      ],
      amp: { a: 0.16, d: 0.18, s: 0.8, r: 0.22 },
      filter: { type: "lowpass", freq: 2300, env: 300, decay: 0.3, q: 0.5, key: 0.15 },
      sends: { reverb: 0.1, delay: 0.12 },
    },
  };

  const KITS = {
    gated80s: {
      id: "gated80s", name: "门限鼓组", en: "GATED 80S", category: "drums", color: "#ff4fd8",
      desc: "巨大的门限混响军鼓、紧实电子底鼓，八十年代标志性鼓声。",
      gain: 0.84, gated: 0.72,
      kick: { wave: "sine", start: 142, end: 43, pitchDecay: 0.075, decay: 0.36, gain: 0.95, click: 0.48, clickFreq: 1900 },
      snare: { tone: 188, toneGain: 0.23, noiseType: "bandpass", noiseFreq: 1850, noiseQ: 0.8, noiseGain: 0.54, decay: 0.24, send: 0.66 },
      hat: { type: "highpass", freq: 7600, decay: 0.038, gain: 0.15, pan: 0.22 },
      openHat: { type: "highpass", freq: 6800, decay: 0.25, gain: 0.11, pan: 0.18 },
      clap: { freq: 1250, q: 1.2, bursts: 3, decay: 0.21, gain: 0.3, send: 0.55 },
      tom: { start: 178, end: 108, decay: 0.25, gain: 0.38 },
      crash: { freq: 4600, decay: 1.15, gain: 0.16 },
    },
    studio84: {
      id: "studio84", name: "录音棚 84", en: "STUDIO 84", category: "drums", color: "#ffae73",
      desc: "更干净、紧凑的录音棚鼓组，军鼓短促，适合 City Pop 与流行。",
      gain: 0.82, gated: 0.24,
      kick: { wave: "sine", start: 128, end: 47, pitchDecay: 0.06, decay: 0.28, gain: 0.9, click: 0.6, clickFreq: 2400 },
      snare: { tone: 210, toneGain: 0.2, noiseType: "bandpass", noiseFreq: 2200, noiseQ: 1.0, noiseGain: 0.46, decay: 0.16, send: 0.35 },
      hat: { type: "highpass", freq: 8200, decay: 0.03, gain: 0.14, pan: 0.18 },
      openHat: { type: "highpass", freq: 7200, decay: 0.18, gain: 0.09, pan: 0.18 },
      clap: { freq: 1500, q: 1.4, bursts: 3, decay: 0.15, gain: 0.26, send: 0.28 },
      tom: { start: 190, end: 120, decay: 0.2, gain: 0.34 },
      crash: { freq: 5200, decay: 0.8, gain: 0.13 },
    },
    drum808: {
      id: "drum808", name: "808 鼓机", en: "808 MACHINE", category: "drums", color: "#ff6d8d",
      desc: "长尾低频底鼓、金属感军鼓与清脆拍手，低音下潜极深。",
      gain: 0.86, gated: 0.12,
      kick: { wave: "sine", start: 105, end: 36, pitchDecay: 0.12, decay: 0.82, gain: 1.0, click: 0.3, clickFreq: 1500 },
      snare: { tone: 175, toneGain: 0.18, noiseType: "bandpass", noiseFreq: 1600, noiseQ: 0.6, noiseGain: 0.4, decay: 0.15, send: 0.32 },
      hat: { type: "highpass", freq: 9000, decay: 0.045, gain: 0.13, pan: 0.2 },
      openHat: { type: "highpass", freq: 7600, decay: 0.32, gain: 0.1, pan: 0.2 },
      clap: { freq: 1350, q: 1.6, bursts: 4, decay: 0.18, gain: 0.32, send: 0.4 },
      tom: { start: 145, end: 82, decay: 0.32, gain: 0.36 },
      crash: { freq: 4400, decay: 1.4, gain: 0.14 },
    },
    chipDrums: {
      id: "chipDrums", name: "芯片鼓组", en: "CHIP DRUMS", category: "drums", color: "#58f5b0",
      desc: "方波底鼓与噪声军鼓，短促、干燥，原汁原味的 8-bit 打击乐。",
      gain: 0.7, gated: 0,
      kick: { wave: "square", start: 230, end: 62, pitchDecay: 0.045, decay: 0.1, gain: 0.7, click: 0.18, clickFreq: 3200 },
      snare: { tone: 320, toneGain: 0.1, noiseType: "highpass", noiseFreq: 1600, noiseQ: 0.5, noiseGain: 0.46, decay: 0.11, send: 0.05 },
      hat: { type: "highpass", freq: 9800, decay: 0.024, gain: 0.13, pan: 0.16 },
      openHat: { type: "highpass", freq: 9200, decay: 0.1, gain: 0.08, pan: 0.16 },
      clap: { freq: 2000, q: 2.0, bursts: 2, decay: 0.08, gain: 0.2, send: 0.04 },
      tom: { start: 260, end: 140, decay: 0.1, gain: 0.28 },
      crash: { freq: 7000, decay: 0.45, gain: 0.1 },
    },
    lofiKit: {
      id: "lofiKit", name: "磁带鼓组", en: "TAPE KIT", category: "drums", color: "#9d9bff",
      desc: "低通、松软的磁带鼓，弱化瞬态，适合 Dreamwave 与慢速氛围。",
      gain: 0.7, gated: 0.08,
      kick: { wave: "sine", start: 115, end: 48, pitchDecay: 0.08, decay: 0.42, gain: 0.8, click: 0.16, clickFreq: 1200 },
      snare: { tone: 165, toneGain: 0.16, noiseType: "bandpass", noiseFreq: 1300, noiseQ: 0.6, noiseGain: 0.32, decay: 0.2, send: 0.3 },
      hat: { type: "highpass", freq: 6200, decay: 0.045, gain: 0.09, pan: 0.2 },
      openHat: { type: "highpass", freq: 5600, decay: 0.25, gain: 0.065, pan: 0.16 },
      clap: { freq: 1100, q: 1.2, bursts: 3, decay: 0.18, gain: 0.22, send: 0.3 },
      tom: { start: 150, end: 95, decay: 0.28, gain: 0.28 },
      crash: { freq: 3800, decay: 1.2, gain: 0.08 },
    },
  };

  const STYLE_PACKS = [
    {
      id: "synthwave", name: "合成器浪潮", en: "SYNTHWAVE", color: "#ff4fd8",
      desc: "宽银幕锯齿、玻璃琶音、门限混响与侧链泵动。",
      instruments: { lead: "neonSaw", arp: "glassArp", bass: "analogBass", pad: "warmPad", drums: "gated80s" },
      fx: { reverb: 42, delay: 28, drive: 26, sidechain: 78, brightness: 60 },
      arpPattern: "updown", drumStyle: "classic", density: 65, swing: 0,
    },
    {
      id: "musicbox", name: "八音盒", en: "MUSIC BOX", color: "#ffd36e",
      desc: "发条盒、玻璃钟琴与空气感铺底，温柔、透明、带一点旧玩具的颗粒。",
      instruments: { lead: "musicBox", arp: "musicBox", bass: "subBass", pad: "glassPad", drums: "lofiKit" },
      fx: { reverb: 62, delay: 34, drive: 6, sidechain: 18, brightness: 54 },
      arpPattern: "up", drumStyle: "none", density: 48, swing: 0,
    },
    {
      id: "chip", name: "芯片音乐", en: "CHIPTUNE", color: "#58f5b0",
      desc: "脉冲波主音、三角波贝斯与 8-bit 鼓组，干燥、明亮、像素感。",
      instruments: { lead: "chipLead", arp: "chipArp", bass: "chipBass", pad: "chipPad", drums: "chipDrums" },
      fx: { reverb: 10, delay: 18, drive: 38, sidechain: 42, brightness: 82 },
      arpPattern: "up", drumStyle: "chip", density: 78, swing: 0,
    },
    {
      id: "dream", name: "梦幻浪潮", en: "DREAMWAVE", color: "#9b8bff",
      desc: "呼吸长笛、星尘钟琴、玻璃云层与半速鼓，漂浮在夜色里。",
      instruments: { lead: "softFlute", arp: "bellArp", bass: "subBass", pad: "glassPad", drums: "lofiKit" },
      fx: { reverb: 68, delay: 44, drive: 8, sidechain: 36, brightness: 50 },
      arpPattern: "updown", drumStyle: "half", density: 52, swing: 0,
    },
    {
      id: "darksynth", name: "暗黑合成", en: "DARKSYNTH", color: "#ff6d8d",
      desc: "方波主音、FM 低音、暗色铺底与四踩鼓，压迫感十足的夜行曲。",
      instruments: { lead: "squareHero", arp: "pluckArp", bass: "fmBass", pad: "darkPad", drums: "gated80s" },
      fx: { reverb: 20, delay: 20, drive: 58, sidechain: 88, brightness: 68 },
      arpPattern: "offbeat", drumStyle: "four", density: 82, swing: 0,
    },
    {
      id: "citypop", name: "城市流行", en: "CITY POP", color: "#ffae73",
      desc: "FM 电钢、橡胶贝斯、合成弦乐与录音棚鼓，黄昏海岸线的浪漫。",
      instruments: { lead: "electricPiano", arp: "marimbaArp", bass: "rubberBass", pad: "stringPad", drums: "studio84" },
      fx: { reverb: 30, delay: 18, drive: 16, sidechain: 32, brightness: 64 },
      arpPattern: "offbeat", drumStyle: "city", density: 62, swing: 18,
    },
  ];

  const ROLE_LABELS = {
    lead: "LEAD",
    arp: "ARP",
    bass: "BASS",
    pad: "PAD",
    drums: "DRUMS",
    extra: "EXTRA",
  };

  function getPreset(id) {
    return PRESETS[id] || KITS[id] || null;
  }

  function allInstruments() {
    return Object.values(PRESETS).concat(Object.values(KITS));
  }

  function defaultForRole(role, styleId) {
    const pack = STYLE_PACKS.find((item) => item.id === styleId) || STYLE_PACKS[0];
    return pack.instruments[role] || pack.instruments.lead;
  }

  NS.PRESET_GROUPS = PRESET_GROUPS;
  NS.PRESETS = PRESETS;
  NS.KITS = KITS;
  NS.STYLE_PACKS = STYLE_PACKS;
  NS.ROLE_LABELS = ROLE_LABELS;
  NS.getPreset = getPreset;
  NS.allInstruments = allInstruments;
  NS.defaultForRole = defaultForRole;
  if (typeof module !== "undefined" && module.exports) module.exports = NS;
})();
