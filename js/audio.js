(function () {
  "use strict";
  const NS = (window.NS = window.NS || {});
  const U = NS.util;

  const waveCache = new WeakMap();

  function makeNoiseBuffer(ctx, seconds) {
    const length = Math.floor(ctx.sampleRate * (seconds || 2));
    const buffer = ctx.createBuffer(1, Math.max(1, length), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.35 + white * 0.65;
      data[i] = last;
    }
    return buffer;
  }

  function makeImpulse(ctx, seconds, decay, gated) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const t = i / length;
        let env = Math.pow(1 - t, decay);
        if (gated) {
          const gateAt = 0.52;
          if (t > gateAt) env *= Math.max(0, 1 - (t - gateAt) / 0.1);
        }
        const noise = Math.random() * 2 - 1;
        data[i] = noise * env * (channel === 0 ? 0.92 : 0.88);
      }
      // A little bit of pre-delay smoothing to avoid a hard direct hit.
      for (let i = 1; i < 90; i += 1) data[i] *= i / 90;
    }
    return buffer;
  }

  function makeDriveCurve(amount) {
    const samples = 2048;
    const curve = new Float32Array(samples);
    if (amount <= 0.0001) {
      for (let i = 0; i < samples; i += 1) curve[i] = (i / (samples - 1)) * 2 - 1;
      return curve;
    }
    const k = Math.max(0.1, amount * 26);
    const norm = Math.tanh(k);
    for (let i = 0; i < samples; i += 1) {
      const x = (i / (samples - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / norm;
    }
    return curve;
  }

  function periodicWave(ctx, type) {
    let cache = waveCache.get(ctx);
    if (!cache) {
      cache = {};
      waveCache.set(ctx, cache);
    }
    if (cache[type]) return cache[type];

    const harmonics = 32;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    if (type === "pulse25" || type === "pulse12") {
      const duty = type === "pulse25" ? 0.25 : 0.125;
      for (let n = 1; n < harmonics; n += 1) {
        real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
      }
    } else if (type === "organ") {
      const drawbars = [
        [1, 1],
        [2, 0.62],
        [3, 0.4],
        [4, 0.24],
        [6, 0.16],
        [8, 0.1],
        [10, 0.07],
      ];
      drawbars.forEach(([harmonic, gain]) => {
        if (harmonic < harmonics) imag[harmonic] = gain;
      });
    } else {
      for (let n = 1; n < harmonics; n += 1) imag[n] = 1 / n;
    }
    const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    cache[type] = wave;
    return wave;
  }

  function setOscType(ctx, osc, type) {
    if (["sine", "square", "sawtooth", "triangle"].includes(type)) {
      osc.type = type;
    } else {
      osc.setPeriodicWave(periodicWave(ctx, type));
    }
  }

  function noiseSource(ctx, graph, when, stopAt) {
    const source = ctx.createBufferSource();
    source.buffer = graph.noiseBuffer;
    source.loop = true;
    source.start(when, Math.random() * 1.4);
    source.stop(stopAt);
    return source;
  }

  function midiFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  class SynthEngine {
    constructor() {
      this.ctx = null;
      this.graph = null;
      this.previewGraph = null;
      this.previewSong = null;
      this.playing = false;
      this.timer = 0;
      this.loop = true;
      this.firstPassTime = 0;
      this.firstPassFromBeat = 0;
      this.lastScheduledPass = 0;
      this.activePasses = [];
      this.activePassGains = [];
      this.lookahead = 1.8;
      this.song = null;
      this.onended = null;
      this._renderProgressTimer = 0;
    }

    ensureContext() {
      if (!this.ctx || this.ctx.state === "closed") {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) throw new Error("当前浏览器不支持 Web Audio。请使用最新版 Chrome 或 Edge。");
        this.ctx = new Ctor({ latencyHint: "interactive" });
        this.ctx._nsNoise = makeNoiseBuffer(this.ctx, 2);
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    get context() {
      return this.ctx;
    }

    buildGraph(ctx, song, options) {
      const opts = options || {};
      const fx = song.fx || { reverb: 40, delay: 25, drive: 20, sidechain: 70, brightness: 60 };
      const masterInput = ctx.createGain();
      masterInput.gain.value = 0.82;

      const drive = ctx.createWaveShaper();
      drive.curve = makeDriveCurve((fx.drive || 0) / 100);
      drive.oversample = "2x";

      const driveTrim = ctx.createGain();
      driveTrim.gain.value = 1 - ((fx.drive || 0) / 100) * 0.22;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 22;
      compressor.ratio.value = 3.5;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.24;

      const master = ctx.createGain();
      master.gain.value = opts.masterGain == null ? 0.78 : opts.masterGain;

      masterInput.connect(drive);
      drive.connect(driveTrim);
      driveTrim.connect(compressor);
      compressor.connect(master);
      master.connect(ctx.destination);

      let analyser = null;
      if (opts.analyser) {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.78;
        master.connect(analyser);
      }

      const reverbSend = ctx.createGain();
      reverbSend.gain.value = 1;
      const reverbPre = ctx.createDelay(0.1);
      reverbPre.delayTime.value = 0.018;
      const reverb = ctx.createConvolver();
      reverb.buffer = makeImpulse(ctx, 3.2, 2.4, false);
      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = ((fx.reverb || 0) / 100) * 0.9;
      reverbSend.connect(reverbPre);
      reverbPre.connect(reverb);
      reverb.connect(reverbReturn);
      reverbReturn.connect(masterInput);

      const delaySend = ctx.createGain();
      delaySend.gain.value = 1;
      const delayTime = U.clamp((60 / song.bpm) * 0.75, 0.12, 0.78);
      const delayL = ctx.createDelay(2);
      const delayR = ctx.createDelay(2);
      delayL.delayTime.value = delayTime;
      delayR.delayTime.value = delayTime * 1.035;
      const delayFilterL = ctx.createBiquadFilter();
      const delayFilterR = ctx.createBiquadFilter();
      delayFilterL.type = "lowpass";
      delayFilterR.type = "lowpass";
      delayFilterL.frequency.value = 3200;
      delayFilterR.frequency.value = 2900;
      const delayPanL = ctx.createStereoPanner();
      const delayPanR = ctx.createStereoPanner();
      delayPanL.pan.value = -0.55;
      delayPanR.pan.value = 0.55;
      const delayReturn = ctx.createGain();
      delayReturn.gain.value = ((fx.delay || 0) / 100) * 0.82;
      const feedbackL = ctx.createGain();
      const feedbackR = ctx.createGain();
      feedbackL.gain.value = 0.3;
      feedbackR.gain.value = 0.3;

      delaySend.connect(delayL);
      delaySend.connect(delayR);
      delayL.connect(delayFilterL);
      delayR.connect(delayFilterR);
      delayFilterL.connect(delayPanL);
      delayFilterR.connect(delayPanR);
      delayPanL.connect(delayReturn);
      delayPanR.connect(delayReturn);
      delayReturn.connect(masterInput);
      delayL.connect(feedbackL);
      feedbackL.connect(delayR);
      delayR.connect(feedbackR);
      feedbackR.connect(delayL);

      const gatedSend = ctx.createGain();
      gatedSend.gain.value = 1;
      const gatedPre = ctx.createDelay(0.05);
      gatedPre.delayTime.value = 0.008;
      const gated = ctx.createConvolver();
      gated.buffer = makeImpulse(ctx, 0.52, 1.05, true);
      const gatedReturn = ctx.createGain();
      gatedReturn.gain.value = 0.82;
      gatedSend.connect(gatedPre);
      gatedPre.connect(gated);
      gated.connect(gatedReturn);
      gatedReturn.connect(masterInput);

      const duckGain = ctx.createGain();
      duckGain.gain.value = 1;
      duckGain.connect(masterInput);

      const graph = {
        ctx,
        song,
        masterInput,
        master,
        drive,
        compressor,
        analyser,
        reverbSend,
        reverbReturn,
        delaySend,
        delayReturn,
        gatedSend,
        gatedReturn,
        duckGain,
        brightness: 0.55 + ((fx.brightness == null ? 60 : fx.brightness) / 100) * 0.95,
        sidechain: (fx.sidechain == null ? 70 : fx.sidechain) / 100,
        noiseBuffer: ctx._nsNoise || makeNoiseBuffer(ctx, 2),
        trackBuses: {},
        trackGated: {},
        trackPresets: {},
        preview: Boolean(opts.preview),
        ignoreMute: Boolean(opts.ignoreMute),
      };

      const hasSolo = song.tracks.some((track) => track.solo);
      song.tracks.forEach((track) => {
        const preset = NS.getPreset(track.instrument);
        const bus = ctx.createGain();
        const audible = graph.ignoreMute
          ? 1
          : track.mute
            ? 0
            : hasSolo && !track.solo
              ? 0
              : 1;
        bus.gain.value = track.volume * audible;
        if (track.role === "pad") bus.connect(duckGain);
        else bus.connect(masterInput);
        graph.trackBuses[track.id] = bus;
        graph.trackPresets[track.id] = preset;

        if (track.role === "drums") {
          const gatedTrack = ctx.createGain();
          gatedTrack.gain.value = track.volume * audible;
          gatedTrack.connect(gatedSend);
          graph.trackGated[track.id] = gatedTrack;
        }

        if (preset && preset.sends) {
          if (preset.sends.reverb > 0) {
            const send = ctx.createGain();
            send.gain.value = preset.sends.reverb;
            bus.connect(send);
            send.connect(reverbSend);
          }
          if (preset.sends.delay > 0) {
            const send = ctx.createGain();
            send.gain.value = preset.sends.delay;
            bus.connect(send);
            send.connect(delaySend);
          }
        }
      });

      return graph;
    }

    makePassGains(graph) {
      const pass = {};
      Object.keys(graph.trackBuses).forEach((trackId) => {
        const gain = graph.ctx.createGain();
        gain.gain.value = 1;
        gain.connect(graph.trackBuses[trackId]);
        pass[trackId] = gain;
      });
      return pass;
    }

    updateMix(song) {
      if (!this.graph || !this.ctx) return;
      const graph = this.graph;
      const hasSolo = song.tracks.some((track) => track.solo);
      const now = this.ctx.currentTime;
      song.tracks.forEach((track) => {
        const bus = graph.trackBuses[track.id];
        if (!bus) return;
        const audible = track.mute ? 0 : hasSolo && !track.solo ? 0 : 1;
        const target = track.volume * audible;
        try {
          bus.gain.cancelScheduledValues(now);
          bus.gain.setTargetAtTime(target, now, 0.015);
        } catch (_) {
          bus.gain.value = target;
        }
        const gated = graph.trackGated[track.id];
        if (gated) {
          try {
            gated.gain.cancelScheduledValues(now);
            gated.gain.setTargetAtTime(target, now, 0.015);
          } catch (_) {
            gated.gain.value = target;
          }
        }
      });
    }

    playVoice(graph, preset, midi, when, duration, velocity, destination) {
      const ctx = graph.ctx;
      const freq = midiFreq(midi);
      const amp = ctx.createGain();
      let input;

      if (preset.filter) {
        const filter = ctx.createBiquadFilter();
        filter.type = preset.filter.type || "lowpass";
        filter.Q.value = U.clamp(preset.filter.q == null ? 0.7 : preset.filter.q, 0.0001, 24);
        const keyFactor = Math.pow(2, ((midi - 60) / 12) * (preset.filter.key || 0));
        const base = U.clamp(preset.filter.freq * keyFactor * graph.brightness, 30, 18000);
        if (preset.filter.env > 0) {
          const peak = U.clamp(base + preset.filter.env * (0.35 + velocity * 0.75), 40, 18000);
          filter.frequency.setValueAtTime(peak, when);
          filter.frequency.exponentialRampToValueAtTime(base, when + Math.max(0.02, preset.filter.decay || 0.2));
        } else {
          filter.frequency.value = base;
        }
        input = ctx.createGain();
        input.gain.value = 1;
        input.connect(filter);
        filter.connect(amp);
        amp.connect(destination);
      } else {
        input = ctx.createGain();
        input.gain.value = 1;
        input.connect(amp);
        amp.connect(destination);
      }

      const releaseAt = when + Math.max(0.04, duration);
      const attack = Math.max(0.001, preset.amp.a || 0.005);
      const decay = Math.max(0.001, preset.amp.d || 0.1);
      const sustainLevel = preset.amp.s == null ? 0.6 : preset.amp.s;
      const release = Math.max(0.02, preset.amp.r || 0.1);
      const peak = Math.max(0.0001, preset.gain * velocity);
      const sustain = Math.max(0.0001, peak * sustainLevel);
      const attackEnd = when + Math.min(attack, Math.max(0.006, duration * 0.7));
      const decayEnd = Math.max(attackEnd, Math.min(releaseAt, when + attack + decay));

      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.linearRampToValueAtTime(peak, attackEnd);
      amp.gain.exponentialRampToValueAtTime(sustain, decayEnd);
      amp.gain.setValueAtTime(sustain, releaseAt);
      amp.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
      const stopAt = releaseAt + release + 0.08;

      const oscillators = [];
      preset.osc.forEach((layer, index) => {
        const osc = ctx.createOscillator();
        setOscType(ctx, osc, layer.type || "sawtooth");
        osc.frequency.value = freq * Math.pow(2, layer.octave || 0);
        osc.detune.value = layer.detune || 0;
        const layerGain = ctx.createGain();
        layerGain.gain.value = layer.gain == null ? 0.3 : layer.gain;
        if (layer.pan) {
          const panner = ctx.createStereoPanner();
          panner.pan.value = layer.pan;
          osc.connect(panner);
          panner.connect(layerGain);
        } else {
          osc.connect(layerGain);
        }
        layerGain.connect(input);
        osc.start(when);
        osc.stop(stopAt);
        oscillators.push({ osc, layer, index });
      });

      if (preset.fm && oscillators.length) {
        const target = oscillators.find((entry) => entry.index === (preset.fm.target || 0)) || oscillators[0];
        const modulator = ctx.createOscillator();
        modulator.type = "sine";
        modulator.frequency.value = target.osc.frequency.value * (preset.fm.ratio || 2);
        const fmGain = ctx.createGain();
        const indexHz = Math.max(1, preset.fm.index || 200);
        fmGain.gain.setValueAtTime(indexHz * (0.55 + velocity * 0.45), when);
        fmGain.gain.exponentialRampToValueAtTime(Math.max(1, indexHz * 0.025), when + Math.max(0.03, preset.fm.decay || 0.3));
        modulator.connect(fmGain);
        fmGain.connect(target.osc.frequency);
        modulator.start(when);
        modulator.stop(stopAt);
      }

      if (preset.noise && preset.noise.gain > 0) {
        const source = noiseSource(ctx, graph, when, stopAt);
        const filter = ctx.createBiquadFilter();
        filter.type = preset.noise.filter || "bandpass";
        filter.frequency.value = preset.noise.freq || 2000;
        filter.Q.value = preset.noise.q || 0.8;
        const gain = ctx.createGain();
        const nPeak = Math.max(0.0001, preset.noise.gain * velocity);
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.linearRampToValueAtTime(nPeak, when + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + (preset.noise.decay || 0.2));
        source.connect(filter);
        filter.connect(gain);
        gain.connect(input);
      }

      if (preset.vibrato && preset.vibrato.depth > 0) {
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = preset.vibrato.rate || 5;
        const lfoGain = ctx.createGain();
        const depth = preset.vibrato.depth;
        const delay = preset.vibrato.delay || 0;
        lfoGain.gain.setValueAtTime(0.0001, when);
        lfoGain.gain.setValueAtTime(0.0001, when + delay);
        lfoGain.gain.linearRampToValueAtTime(depth, when + delay + 0.18);
        lfo.connect(lfoGain);
        oscillators.forEach(({ osc }) => lfoGain.connect(osc.detune));
        lfo.start(when);
        lfo.stop(stopAt);
      }
    }

    playDrum(graph, kit, pitch, when, velocity, destination, gatedDestination) {
      const ctx = graph.ctx;
      const masterGain = (kit.gain || 0.8) * velocity;

      const connectGated = (node, amount) => {
        if (!gatedDestination || !amount) return;
        const send = ctx.createGain();
        send.gain.value = amount;
        node.connect(send);
        send.connect(gatedDestination);
      };

      if (pitch === 36) {
        const settings = kit.kick;
        const osc = ctx.createOscillator();
        osc.type = settings.wave === "square" ? "square" : "sine";
        const start = settings.start * (0.92 + velocity * 0.15);
        osc.frequency.setValueAtTime(start, when);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, settings.end), when + settings.pitchDecay);
        const gain = ctx.createGain();
        const peak = Math.max(0.0001, settings.gain * masterGain);
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.linearRampToValueAtTime(peak, when + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + settings.decay);
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = settings.wave === "square" ? 1900 : 5200;
        osc.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(destination);
        osc.start(when);
        osc.stop(when + settings.decay + 0.05);

        if (settings.click > 0) {
          const click = noiseSource(ctx, graph, when, when + 0.06);
          const hp = ctx.createBiquadFilter();
          hp.type = "highpass";
          hp.frequency.value = settings.clickFreq || 1800;
          const cg = ctx.createGain();
          cg.gain.setValueAtTime(Math.max(0.0001, settings.click * masterGain), when);
          cg.gain.exponentialRampToValueAtTime(0.0001, when + 0.025);
          click.connect(hp);
          hp.connect(cg);
          cg.connect(destination);
        }
        return;
      }

      if (pitch === 38) {
        const settings = kit.snare;
        const out = ctx.createGain();
        out.gain.value = 1;
        out.connect(destination);
        connectGated(out, settings.send || 0);

        const tone = ctx.createOscillator();
        tone.type = "triangle";
        tone.frequency.setValueAtTime(settings.tone, when);
        tone.frequency.exponentialRampToValueAtTime(settings.tone * 0.7, when + settings.decay * 0.6);
        const toneGain = ctx.createGain();
        toneGain.gain.setValueAtTime(Math.max(0.0001, settings.toneGain * masterGain), when);
        toneGain.gain.exponentialRampToValueAtTime(0.0001, when + settings.decay * 0.8);
        tone.connect(toneGain);
        toneGain.connect(out);
        tone.start(when);
        tone.stop(when + settings.decay + 0.05);

        const noise = noiseSource(ctx, graph, when, when + settings.decay + 0.06);
        const filter = ctx.createBiquadFilter();
        filter.type = settings.noiseType || "bandpass";
        filter.frequency.value = settings.noiseFreq || 1800;
        filter.Q.value = settings.noiseQ || 0.8;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(Math.max(0.0001, settings.noiseGain * masterGain), when);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + settings.decay);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(out);
        return;
      }

      if (pitch === 39) {
        const settings = kit.clap;
        const out = ctx.createGain();
        out.gain.value = 1;
        out.connect(destination);
        connectGated(out, settings.send || 0);
        const noise = noiseSource(ctx, graph, when, when + settings.decay + 0.12);
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = settings.freq || 1200;
        filter.Q.value = settings.q || 1.2;
        const gain = ctx.createGain();
        const peak = Math.max(0.0001, settings.gain * masterGain);
        gain.gain.setValueAtTime(0.0001, when);
        const bursts = settings.bursts || 3;
        for (let i = 0; i < bursts; i += 1) {
          const at = when + i * 0.011;
          gain.gain.setValueAtTime(peak, at);
          gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.16), at + 0.009);
        }
        gain.gain.setValueAtTime(0.0001, when + settings.decay);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(out);
        return;
      }

      if (pitch === 46 || pitch === 42) {
        const open = pitch === 46;
        const settings = open ? kit.openHat : kit.hat;
        const noise = noiseSource(ctx, graph, when, when + settings.decay + 0.05);
        const filter = ctx.createBiquadFilter();
        filter.type = settings.type || "highpass";
        filter.frequency.value = settings.freq || 7000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(Math.max(0.0001, settings.gain * masterGain), when);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + settings.decay);
        const panner = ctx.createStereoPanner();
        panner.pan.value = settings.pan || 0;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        panner.connect(destination);
        return;
      }

      if (pitch === 49) {
        const settings = kit.crash;
        const noise = noiseSource(ctx, graph, when, when + settings.decay + 0.15);
        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = settings.freq || 4200;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(Math.max(0.0001, settings.gain * masterGain), when);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + settings.decay);
        const panner = ctx.createStereoPanner();
        panner.pan.value = -0.18;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        panner.connect(destination);
        connectGated(panner, 0.4);
        return;
      }

      // Toms and anything else in the percussion range.
      const settings = kit.tom;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(settings.start, when);
      osc.frequency.exponentialRampToValueAtTime(settings.end, when + settings.decay * 0.7);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.0001, settings.gain * masterGain), when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + settings.decay);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(when);
      osc.stop(when + settings.decay + 0.05);
    }

    swingBeat(beat, swing) {
      if (!swing) return beat;
      const eighth = beat * 2;
      const rounded = Math.round(eighth);
      if (rounded % 2 === 1 && Math.abs(eighth - rounded) < 0.02) {
        return beat + (swing / 100) * 0.14;
      }
      return beat;
    }

    schedulePass(song, graph, passGains, passTime, fromBeat) {
      const spb = 60 / song.bpm;
      const total = NS.model.totalBeats(song);
      const ctx = graph.ctx;

      song.tracks.forEach((track) => {
        const destination = passGains[track.id];
        if (!destination) return;
        const preset = NS.getPreset(track.instrument) || (track.role === "drums" ? NS.KITS.gated80s : NS.PRESETS.neonSaw);
        const isDrum = track.role === "drums" || preset.category === "drums";
        const kit = isDrum ? (preset.category === "drums" ? preset : NS.KITS.gated80s) : null;

        track.notes.forEach((note) => {
          if (note.start + note.dur <= fromBeat) return;
          const startBeat = Math.max(note.start, fromBeat);
          if (startBeat >= total) return;
          const duration = Math.min(note.dur - (startBeat - note.start), total - startBeat);
          if (duration <= 0.015) return;
          const when = passTime + this.swingBeat(startBeat, song.swing) * spb;
          if (!Number.isFinite(when) || when < 0) return;
          if (isDrum) {
            this.playDrum(graph, kit, note.pitch, when, note.vel == null ? 0.8 : note.vel, destination, graph.trackGated[track.id]);
          } else {
            this.playVoice(graph, preset, note.pitch, when, duration, note.vel == null ? 0.8 : note.vel, destination);
          }
        });
      });
    }

    scheduleSidechain(song, graph, passTime, fromBeat) {
      const amount = graph.sidechain;
      if (amount <= 0.01) return;
      const spb = 60 / song.bpm;
      const kicks = [];
      song.tracks.filter((track) => track.role === "drums").forEach((track) => {
        track.notes.forEach((note) => {
          if (note.pitch === 36 && note.start >= fromBeat) kicks.push(note.start);
        });
      });
      kicks.sort((a, b) => a - b);
      const gain = graph.duckGain.gain;
      kicks.forEach((beat) => {
        const at = passTime + this.swingBeat(beat, song.swing) * spb;
        if (at < 0) return;
        gain.setValueAtTime(1, at);
        gain.linearRampToValueAtTime(1 - 0.62 * amount, at + 0.016);
        gain.linearRampToValueAtTime(1, at + 0.26);
      });
    }

    makeStreamPass(index, startTime, startBeat, endBeat) {
      const pass = {
        index,
        startTime,
        startBeat,
        endBeat,
        scheduledBeat: startBeat,
        fullyScheduled: false,
        gains: this.makePassGains(this.graph),
      };
      this.activePasses.push(pass);
      this.activePassGains.push(pass.gains);
      return pass;
    }

    playNoteAt(track, note, destination, when, duration) {
      if (duration <= 0.015) return;
      const preset = NS.getPreset(track.instrument) || (track.role === "drums" ? NS.KITS.gated80s : NS.PRESETS.neonSaw);
      const isDrum = track.role === "drums" || preset.category === "drums";
      if (isDrum) {
        const kit = preset.category === "drums" ? preset : NS.KITS.gated80s;
        this.playDrum(this.graph, kit, note.pitch, when, note.vel == null ? 0.8 : note.vel, destination, this.graph.trackGated[track.id]);
      } else {
        this.playVoice(this.graph, preset, note.pitch, when, duration, note.vel == null ? 0.8 : note.vel, destination);
      }
    }

    scheduleStartOverlaps(pass, startBeat) {
      if (startBeat <= 0.0001) return;
      const song = this.song;
      const spb = 60 / song.bpm;
      const total = NS.model.totalBeats(song);
      const when = pass.startTime + startBeat * spb;
      song.tracks.forEach((track) => {
        const destination = pass.gains[track.id];
        if (!destination) return;
        track.notes.forEach((note) => {
          if (note.start >= startBeat - 0.001) return;
          const end = Math.min(total, note.start + note.dur);
          if (end <= startBeat + 0.01) return;
          this.playNoteAt(track, note, destination, when, end - startBeat);
        });
      });
    }

    scheduleSidechainRange(pass, fromBeat, toBeat) {
      const graph = this.graph;
      const song = this.song;
      if (!graph || !song) return;
      const amount = graph.sidechain;
      if (amount <= 0.01) return;
      const spb = 60 / song.bpm;
      const gain = graph.duckGain.gain;
      song.tracks.filter((track) => track.role === "drums").forEach((track) => {
        track.notes.forEach((note) => {
          if (note.pitch !== 36 || note.start < fromBeat - 0.001 || note.start >= toBeat - 0.001) return;
          const at = pass.startTime + this.swingBeat(note.start, song.swing) * spb;
          if (at < 0) return;
          gain.setValueAtTime(1, at);
          gain.linearRampToValueAtTime(1 - 0.62 * amount, at + 0.016);
          gain.linearRampToValueAtTime(1, at + 0.26);
        });
      });
    }

    fillStreamPass(pass) {
      if (!this.playing || !this.graph || !this.song || pass.fullyScheduled) return;
      const ctx = this.ctx;
      const song = this.song;
      const spb = 60 / song.bpm;
      const total = NS.model.totalBeats(song);
      const now = ctx.currentTime;
      const windowStart = pass.scheduledBeat;
      const windowEnd = Math.min(pass.endBeat, (now + this.lookahead - pass.startTime) / spb);
      if (windowEnd <= windowStart + 0.001) {
        if (windowStart >= pass.endBeat - 0.001) pass.fullyScheduled = true;
        return;
      }

      song.tracks.forEach((track) => {
        const destination = pass.gains[track.id];
        if (!destination) return;
        track.notes.forEach((note) => {
          if (note.start < windowStart - 0.001 || note.start >= windowEnd - 0.001) return;
          const when = pass.startTime + this.swingBeat(note.start, song.swing) * spb;
          const safeWhen = Math.max(when, now + 0.005);
          const duration = Math.min(note.dur, total - note.start);
          this.playNoteAt(track, note, destination, safeWhen, duration);
        });
      });
      this.scheduleSidechainRange(pass, windowStart, windowEnd);
      pass.scheduledBeat = windowEnd;
      if (windowEnd >= pass.endBeat - 0.001) pass.fullyScheduled = true;
    }

    play(song, fromBeat, loop) {
      this.stop();
      const ctx = this.ensureContext();
      const total = NS.model.totalBeats(song);
      const spb = 60 / song.bpm;
      const startBeat = U.clamp(fromBeat || 0, 0, Math.max(0, total - 0.01));
      this.loop = loop !== false;
      this.song = song;
      this.disposePreview();
      this.graph = this.buildGraph(ctx, song, { analyser: true });
      this.firstPassFromBeat = startBeat;
      this.firstPassTime = ctx.currentTime + 0.11 - startBeat * spb;
      this.activePasses = [];
      this.activePassGains = [];
      this.playing = true;

      const pass = this.makeStreamPass(0, this.firstPassTime, startBeat, total);
      this.scheduleStartOverlaps(pass, startBeat);
      this.fillStreamPass(pass);

      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 55);
      return true;
    }

    tick() {
      if (!this.playing || !this.ctx || !this.graph || !this.song) return;
      const duration = NS.model.durationSeconds(this.song);
      const total = NS.model.totalBeats(this.song);
      const now = this.ctx.currentTime;

      this.activePasses.forEach((pass) => {
        if (!pass.fullyScheduled) this.fillStreamPass(pass);
      });

      if (this.loop) {
        const currentIndex = Math.floor((now - this.firstPassTime) / duration);
        const last = this.activePasses[this.activePasses.length - 1];
        if (last && last.index < currentIndex + 2) {
          const nextStart = this.firstPassTime + (last.index + 1) * duration;
          if (nextStart <= now + this.lookahead + 0.12) {
            const next = this.makeStreamPass(last.index + 1, nextStart, 0, total);
            this.fillStreamPass(next);
          }
        }
        while (this.activePasses.length > 2 && now > this.activePasses[0].startTime + duration + 2) {
          const old = this.activePasses.shift();
          this.activePassGains.shift();
          Object.values(old.gains).forEach((gain) => {
            try { gain.disconnect(); } catch (_) { /* noop */ }
          });
        }
      } else if (now > this.firstPassTime + duration + 2.2) {
        this.finish();
      }
    }

    getBeat() {
      if (!this.playing || !this.ctx || !this.song) return null;
      const spb = 60 / this.song.bpm;
      const total = NS.model.totalBeats(this.song);
      let beat = (this.ctx.currentTime - this.firstPassTime) / spb;
      if (beat < this.firstPassFromBeat) beat = this.firstPassFromBeat;
      if (this.loop) {
        beat = ((beat % total) + total) % total;
      } else {
        beat = U.clamp(beat, 0, total);
      }
      return beat;
    }

    getAnalyser() {
      return this.graph ? this.graph.analyser : null;
    }

    get playingState() {
      return this.playing;
    }

    disposePreview() {
      if (this.previewGraph) {
        try { this.previewGraph.master.disconnect(); } catch (_) { /* noop */ }
        this.previewGraph = null;
        this.previewSong = null;
      }
    }

    preview(song, track, pitch) {
      const ctx = this.ensureContext();
      if (this.playing && this.graph) {
        const preset = NS.getPreset(track.instrument) || NS.KITS.gated80s;
        const when = ctx.currentTime + 0.015;
        if (track.role === "drums" || preset.category === "drums") {
          const kit = preset.category === "drums" ? preset : NS.KITS.gated80s;
          this.playDrum(this.graph, kit, pitch || 36, when, 0.9, this.graph.trackBuses[track.id], this.graph.trackGated[track.id]);
        } else {
          this.playVoice(this.graph, preset, pitch || 69, when, 0.55, 0.9, this.graph.trackBuses[track.id]);
        }
        return;
      }
      if (!this.previewGraph || this.previewSong !== song) {
        this.disposePreview();
        this.previewGraph = this.buildGraph(ctx, song, { preview: true, ignoreMute: true, analyser: false });
        this.previewSong = song;
      }
      const graph = this.previewGraph;
      const preset = NS.getPreset(track.instrument) || (track.role === "drums" ? NS.KITS.gated80s : NS.PRESETS.neonSaw);
      const when = ctx.currentTime + 0.015;
      if (track.role === "drums" || preset.category === "drums") {
        const kit = preset.category === "drums" ? preset : NS.KITS.gated80s;
        this.playDrum(graph, kit, pitch || 36, when, 0.9, graph.trackBuses[track.id], graph.trackGated[track.id]);
      } else {
        this.playVoice(graph, preset, pitch || 69, when, 0.6, 0.9, graph.trackBuses[track.id]);
      }
    }

    stop() {
      this.playing = false;
      clearInterval(this.timer);
      this.timer = 0;
      if (!this.ctx || !this.graph) return;
      const graph = this.graph;
      const now = this.ctx.currentTime;
      this.activePassGains.forEach((pass) => {
        Object.values(pass).forEach((gain) => {
          try {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(0.0001, now + 0.045);
          } catch (_) { /* noop */ }
        });
      });
      try {
        graph.duckGain.gain.cancelScheduledValues(now);
        graph.duckGain.gain.setValueAtTime(1, now);
      } catch (_) { /* noop */ }
      setTimeout(() => {
        try { graph.master.disconnect(); } catch (_) { /* noop */ }
      }, 90);
      this.graph = null;
      this.activePasses = [];
      this.activePassGains = [];
    }

    finish() {
      if (!this.playing) return;
      this.playing = false;
      clearInterval(this.timer);
      this.timer = 0;
      const graph = this.graph;
      if (graph && this.ctx) {
        const now = this.ctx.currentTime;
        try {
          graph.master.gain.cancelScheduledValues(now);
          graph.master.gain.setValueAtTime(graph.master.gain.value, now);
          graph.master.gain.linearRampToValueAtTime(0.0001, now + 0.35);
        } catch (_) { /* noop */ }
        setTimeout(() => {
          try { graph.master.disconnect(); } catch (_) { /* noop */ }
        }, 450);
      }
      this.graph = null;
      this.activePasses = [];
      this.activePassGains = [];
      const callback = this.onended;
      if (typeof callback === "function") callback();
    }

    async renderWav(song, onProgress) {
      const sampleRate = 44100;
      const tail = 3.2;
      const duration = NS.model.durationSeconds(song) + tail;
      const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Ctor) throw new Error("当前浏览器不支持离线音频渲染。");
      const ctx = new Ctor(2, Math.ceil(sampleRate * duration), sampleRate);
      const graph = this.buildGraph(ctx, song, { analyser: false });
      const pass = this.makePassGains(graph);
      this.schedulePass(song, graph, pass, 0, 0);
      this.scheduleSidechain(song, graph, 0, 0);
      if (onProgress) onProgress(0.36);
      let simulated = 0.36;
      this._renderProgressTimer = setInterval(() => {
        simulated = Math.min(0.9, simulated + 0.018);
        if (onProgress) onProgress(simulated);
      }, 280);
      try {
        const buffer = await ctx.startRendering();
        clearInterval(this._renderProgressTimer);
        this._renderProgressTimer = 0;
        if (onProgress) onProgress(1);
        return { blob: encodeWav(buffer), buffer, duration };
      } catch (error) {
        clearInterval(this._renderProgressTimer);
        this._renderProgressTimer = 0;
        throw error;
      }
    }
  }

  function encodeWav(buffer) {
    const channels = Math.min(2, buffer.numberOfChannels);
    const frames = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const dataSize = frames * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, text) => {
      for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    const channelData = [];
    for (let c = 0; c < channels; c += 1) channelData.push(buffer.getChannelData(c));
    let offset = 44;
    for (let i = 0; i < frames; i += 1) {
      for (let c = 0; c < channels; c += 1) {
        let sample = channelData[c][i];
        if (!Number.isFinite(sample)) sample = 0;
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([arrayBuffer], { type: "audio/wav" });
  }

  NS.audio = new SynthEngine();
  NS.encodeWav = encodeWav;
})();
