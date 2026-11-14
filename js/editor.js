(function () {
  "use strict";
  const NS = (window.NS = window.NS || {});
  const U = NS.util;

  const MIN_MIDI = 36;
  const MAX_MIDI = 84;
  const ROWS = MAX_MIDI - MIN_MIDI + 1;
  const RULER_H = 30;
  const ZOOMS = [32, 42, 54, 66, 84, 104];
  const DRUM_LABELS = NS.model ? NS.model.DRUM_NAMES : {};

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function rgba(hex, alpha) {
    const value = String(hex || "#ff4fd8").replace("#", "");
    const num = parseInt(value.length === 3 ? value.split("").map((char) => char + char).join("") : value, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function darken(hex, factor) {
    const value = String(hex || "#ff4fd8").replace("#", "");
    const num = parseInt(value, 16);
    const r = Math.floor(((num >> 16) & 255) * factor);
    const g = Math.floor(((num >> 8) & 255) * factor);
    const b = Math.floor((num & 255) * factor);
    return `rgb(${r}, ${g}, ${b})`;
  }

  class PianoRollEditor {
    constructor(options) {
      this.canvas = options.canvas;
      this.keys = options.keys;
      this.viewport = options.viewport;
      this.content = options.content;
      this.playheadEl = options.playhead;
      this.cursorEl = options.cursor;
      this.shell = options.shell;
      this.host = options.host;
      this.ctx = this.canvas.getContext("2d");
      this.keysCtx = this.keys.getContext("2d");
      this.dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
      this.zoomIndex = 2;
      this.pxPerBeat = ZOOMS[this.zoomIndex];
      this.rowH = 12;
      this.minMidi = MIN_MIDI;
      this.maxMidi = MAX_MIDI;
      this.rows = ROWS;
      this.height = RULER_H + this.rows * this.rowH;
      this.width = 800;
      this.selection = null;
      this.hover = null;
      this.drag = null;
      this.activeKey = null;
      this.activeKeyTimer = 0;
      this._raf = 0;
      this._lastHoverKey = "";
      this._scrollPlayhead = true;

      this._bind();
      this.resize();
      this.render();
    }

    _bind() {
      this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
      this.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
      this.canvas.addEventListener("pointerup", (event) => this.onPointerUp(event));
      this.canvas.addEventListener("pointercancel", (event) => this.onPointerUp(event));
      this.canvas.addEventListener("pointerleave", () => {
        if (!this.drag) {
          this.hover = null;
          this.hideCursor();
          this.scheduleRender();
        }
      });
      this.canvas.addEventListener("contextmenu", (event) => this.onContextMenu(event));
      this.canvas.addEventListener("dblclick", (event) => this.onDoubleClick(event));
      this.keys.addEventListener("pointerdown", (event) => this.onKeyDown(event));
      this.viewport.addEventListener("scroll", () => {
        this.updateCursorPosition();
      });
      if (typeof ResizeObserver !== "undefined") {
        this._resizeObserver = new ResizeObserver(() => {
          this.resize();
          this.render();
        });
        this._resizeObserver.observe(this.shell);
      }
      window.addEventListener("resize", () => {
        this.resize();
        this.render();
      });
    }

    get song() {
      return this.host.getSong();
    }

    get track() {
      return this.host.getSelectedTrack();
    }

    get totalBeats() {
      const song = this.song;
      return song ? song.bars * song.beatsPerBar : 32;
    }

    get state() {
      return this.host.getState();
    }

    computeRange() {
      let min = MIN_MIDI;
      let max = MAX_MIDI;
      if (this.song) {
        this.song.tracks.forEach((track) => {
          track.notes.forEach((note) => {
            if (note.pitch < min) min = Math.max(21, note.pitch - 1);
            if (note.pitch > max) max = Math.min(108, note.pitch + 1);
          });
        });
      }
      this.minMidi = min;
      this.maxMidi = max;
      this.rows = max - min + 1;
    }

    resize() {
      this.computeRange();
      const shellHeight = this.shell ? this.shell.clientHeight : 540;
      const available = Math.max(260, shellHeight);
      this.rowH = U.clamp((available - RULER_H) / this.rows, 6, 18);
      this.height = Math.round(RULER_H + this.rows * this.rowH);
      const totalBeats = Math.max(4, this.totalBeats);
      this.width = Math.max(300, Math.round(totalBeats * this.pxPerBeat + 1));
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.keys.width = Math.round(62 * this.dpr);
      this.keys.height = Math.round(this.height * this.dpr);
      this.keys.style.height = `${this.height}px`;
      this.content.style.width = `${this.width}px`;
      this.content.style.height = `${this.height}px`;
      this.playheadEl.style.height = `${this.height}px`;
      this.cursorEl.style.height = `${Math.max(0, this.height - RULER_H)}px`;
    }

    setZoom(index) {
      const next = U.clamp(index, 0, ZOOMS.length - 1);
      if (next === this.zoomIndex) return;
      const centerBeat = (this.viewport.scrollLeft + this.viewport.clientWidth / 2) / this.pxPerBeat;
      this.zoomIndex = next;
      this.pxPerBeat = ZOOMS[next];
      this.resize();
      this.render();
      this.viewport.scrollLeft = Math.max(0, centerBeat * this.pxPerBeat - this.viewport.clientWidth / 2);
      if (this.host.onZoom) this.host.onZoom(Math.round((this.pxPerBeat / 54) * 100), next);
    }

    zoomIn() { this.setZoom(this.zoomIndex + 1); }
    zoomOut() { this.setZoom(this.zoomIndex - 1); }

    setSelection(note, trackId) {
      if (!note) {
        this.selection = null;
      } else {
        this.selection = { trackId: trackId || (this.track && this.track.id), noteId: note.id };
      }
      if (this.host.onSelection) {
        this.host.onSelection(note ? { note, track: this.track } : null);
      }
      this.scheduleRender();
    }

    getSelectedNote() {
      if (!this.selection) return null;
      const track = this.song && this.song.tracks.find((item) => item.id === this.selection.trackId);
      if (!track) return null;
      const note = track.notes.find((item) => item.id === this.selection.noteId);
      return note ? { note, track } : null;
    }

    clearSelection() {
      this.selection = null;
      if (this.host.onSelection) this.host.onSelection(null);
      this.scheduleRender();
    }

    findNoteAt(x, y) {
      const track = this.track;
      if (!track) return null;
      const midi = this.yToMidi(y);
      if (midi < this.minMidi || midi > this.maxMidi) return null;
      for (let i = track.notes.length - 1; i >= 0; i -= 1) {
        const note = track.notes[i];
        if (note.pitch !== midi) continue;
        const noteX = this.beatToX(note.start);
        const noteW = Math.max(5, note.dur * this.pxPerBeat - 1);
        if (x >= noteX - 2 && x <= noteX + noteW + 2) return note;
      }
      return null;
    }

    beatToX(beat) { return beat * this.pxPerBeat; }
    xToBeat(x) { return x / this.pxPerBeat; }
    midiToY(midi) { return RULER_H + (this.maxMidi - midi) * this.rowH; }
    yToMidi(y) {
      const row = Math.floor((y - RULER_H) / this.rowH);
      return this.maxMidi - row;
    }

    snapBeat(beat) {
      const snap = this.state.snap;
      if (!snap || snap <= 0) return beat;
      return Math.round(beat / snap) * snap;
    }

    pointerPosition(event) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    onPointerDown(event) {
      if (event.button !== 0) return;
      const { x, y } = this.pointerPosition(event);
      const state = this.state;
      if (y < RULER_H) {
        const beat = U.clamp(this.snapBeat(this.xToBeat(x)), 0, this.totalBeats);
        this.drag = { mode: "seek", pointerId: event.pointerId };
        this.canvas.setPointerCapture(event.pointerId);
        if (this.host.onSeek) this.host.onSeek(beat, false);
        this.setPlayhead(beat);
        return;
      }

      const note = this.findNoteAt(x, y);
      if (note) {
        this.setSelection(note, this.track.id);
        const noteX = this.beatToX(note.start);
        const noteW = Math.max(5, note.dur * this.pxPerBeat - 1);
        const nearEdge = x >= noteX + noteW - 7;
        this.drag = {
          mode: nearEdge ? "resize" : "move",
          pointerId: event.pointerId,
          note,
          startX: x,
          startY: y,
          startPitch: this.yToMidi(y),
          origStart: note.start,
          origPitch: note.pitch,
          origDur: note.dur,
          started: false,
        };
        this.canvas.setPointerCapture(event.pointerId);
        this.updateCursor(x, y);
        return;
      }

      if (state.tool === "draw") {
        const beat = U.clamp(this.snapBeat(this.xToBeat(x)), 0, this.totalBeats - 0.05);
        const pitch = U.clamp(this.yToMidi(y), this.minMidi, this.maxMidi);
        const length = Math.max(0.05, Math.min(state.noteLength || 1, this.totalBeats - beat));
        if (this.host.onBeforeEdit) this.host.onBeforeEdit();
        const note = NS.model.note(pitch, beat, length, 0.82);
        this.track.notes.push(note);
        this.setSelection(note, this.track.id);
        if (this.host.onMutate) this.host.onMutate({ kind: "add", note });
        this.scheduleRender();
      } else {
        this.clearSelection();
        const beat = U.clamp(this.snapBeat(this.xToBeat(x)), 0, this.totalBeats);
        this.setPlayhead(beat);
        if (this.host.onSeek) this.host.onSeek(beat, true);
      }
      this.updateCursor(x, y);
    }

    onPointerMove(event) {
      const { x, y } = this.pointerPosition(event);
      if (this.drag) {
        if (this.drag.mode === "seek") {
          const beat = U.clamp(this.snapBeat(this.xToBeat(x)), 0, this.totalBeats);
          this.setPlayhead(beat);
          if (this.host.onSeek) this.host.onSeek(beat, false);
          return;
        }
        const drag = this.drag;
        const dx = x - drag.startX;
        const dy = y - drag.startY;
        if (!drag.started && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        if (!drag.started) {
          drag.started = true;
          if (this.host.onBeforeEdit) this.host.onBeforeEdit();
          if (this.host.onLiveStart) this.host.onLiveStart();
        }
        if (drag.mode === "resize") {
          const rawEnd = this.xToBeat(x);
          const end = this.snapBeat(rawEnd);
          const minDur = this.state.snap > 0 ? this.state.snap : 0.0625;
          drag.note.dur = U.clamp(end - drag.origStart, minDur, this.totalBeats - drag.origStart);
        } else {
          const rawStart = drag.origStart + dx / this.pxPerBeat;
          drag.note.start = U.clamp(this.snapBeat(rawStart), 0, this.totalBeats - drag.note.dur);
          const deltaPitch = this.yToMidi(y) - drag.startPitch;
          drag.note.pitch = U.clamp(drag.origPitch + deltaPitch, this.minMidi, this.maxMidi);
        }
        this.setSelection(drag.note, this.track.id);
        if (this.host.onLiveEdit) this.host.onLiveEdit(drag.note);
        this.scheduleRender();
        this.updateCursor(x, y);
        return;
      }

      const midi = this.yToMidi(y);
      const beat = this.xToBeat(x);
      const key = `${Math.floor(beat * 16)}:${midi}`;
      if (key !== this._lastHoverKey) {
        this._lastHoverKey = key;
        this.hover = { x, y, midi, beat };
        this.scheduleRender();
      }
      this.updateCursor(x, y);
    }

    onPointerUp(event) {
      if (!this.drag) return;
      const drag = this.drag;
      this.drag = null;
      try { this.canvas.releasePointerCapture(event.pointerId); } catch (_) { /* noop */ }
      if (drag.mode === "seek") {
        if (this.host.onSeek) this.host.onSeek(this.snapBeat(this.xToBeat(this.pointerPosition(event).x)), true);
      } else if (drag.started && this.host.onMutate) {
        this.host.onMutate({ kind: drag.mode, note: drag.note });
      }
      this.scheduleRender();
    }

    onContextMenu(event) {
      event.preventDefault();
      const { x, y } = this.pointerPosition(event);
      const note = this.findNoteAt(x, y);
      if (!note) return;
      if (this.host.onBeforeEdit) this.host.onBeforeEdit();
      const index = this.track.notes.indexOf(note);
      if (index >= 0) this.track.notes.splice(index, 1);
      if (this.selection && this.selection.noteId === note.id) this.clearSelection();
      if (this.host.onMutate) this.host.onMutate({ kind: "delete", note });
      this.scheduleRender();
    }

    onDoubleClick(event) {
      const { x, y } = this.pointerPosition(event);
      if (y < RULER_H) return;
      const note = this.findNoteAt(x, y);
      if (!note) return;
      if (this.host.onBeforeEdit) this.host.onBeforeEdit();
      const index = this.track.notes.indexOf(note);
      if (index >= 0) this.track.notes.splice(index, 1);
      this.clearSelection();
      if (this.host.onMutate) this.host.onMutate({ kind: "delete", note });
      this.scheduleRender();
    }

    onKeyDown(event) {
      const rect = this.keys.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const midi = this.yToMidi(y);
      if (midi < this.minMidi || midi > this.maxMidi) return;
      this.activeKey = midi;
      clearTimeout(this.activeKeyTimer);
      this.activeKeyTimer = setTimeout(() => {
        this.activeKey = null;
        this.render();
      }, 170);
      if (this.host.onPreview) this.host.onPreview(midi);
      this.render();
    }

    updateCursor(x, y) {
      if (!this.cursorEl) return;
      if (y < RULER_H) {
        this.hideCursor();
        return;
      }
      const beat = U.clamp(this.snapBeat(this.xToBeat(x)), 0, this.totalBeats);
      this.cursorEl.classList.add("on");
      this.cursorEl.style.transform = `translateX(${this.beatToX(beat)}px)`;
      this.cursorEl.style.top = `${RULER_H}px`;
      this.cursorEl.style.height = `${Math.max(0, this.height - RULER_H)}px`;
    }

    updateCursorPosition() {
      this.hideCursor();
    }

    hideCursor() {
      if (this.cursorEl) this.cursorEl.classList.remove("on");
    }

    setPlayhead(beat) {
      const value = U.clamp(beat || 0, 0, this.totalBeats);
      this.playheadEl.style.transform = `translateX(${this.beatToX(value)}px)`;
      this.playheadEl.dataset.beat = String(value);
    }

    follow(beat) {
      if (!this._scrollPlayhead) return;
      const x = this.beatToX(beat);
      const left = this.viewport.scrollLeft;
      const width = this.viewport.clientWidth;
      if (x < left + 24 || x > left + width - 50) {
        this.viewport.scrollLeft = Math.max(0, x - width * 0.32);
      }
    }

    scheduleRender() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this.render();
      });
    }

    render() {
      if (!this.ctx) return;
      const width = this.width;
      const height = this.height;
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      this.drawGrid(ctx, width, height);
      this.drawNotes(ctx);
      this.drawHover(ctx);
      this.drawKeyboard();
    }

    drawGrid(ctx, width, height) {
      const song = this.song;
      if (!song) return;
      const bpb = song.beatsPerBar;
      const total = this.totalBeats;
      const track = this.track;

      ctx.fillStyle = "#080813";
      ctx.fillRect(0, 0, width, height);

      for (let midi = this.maxMidi; midi >= this.minMidi; midi -= 1) {
        const y = this.midiToY(midi);
        const black = U.isBlack(midi);
        ctx.fillStyle = black ? "rgba(255,255,255,0.018)" : "rgba(255,255,255,0.005)";
        ctx.fillRect(0, y, width, this.rowH);
        if (midi % 12 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.09)";
          ctx.fillRect(0, y + this.rowH - 1, width, 1);
        }
      }

      const subdivision = this.pxPerBeat >= 78 ? 0.25 : 0.5;
      for (let beat = 0; beat <= total + 0.001; beat += subdivision) {
        const x = Math.round(this.beatToX(beat)) + 0.5;
        const isBar = Math.abs(beat % bpb) < 0.001;
        const isBeat = Math.abs(beat - Math.round(beat)) < 0.001;
        ctx.strokeStyle = isBar ? "rgba(255,255,255,0.15)" : isBeat ? "rgba(255,255,255,0.075)" : "rgba(255,255,255,0.032)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, RULER_H);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(10, 9, 22, 0.98)";
      ctx.fillRect(0, 0, width, RULER_H);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(0, RULER_H - 0.5);
      ctx.lineTo(width, RULER_H - 0.5);
      ctx.stroke();

      const barWidth = bpb * this.pxPerBeat;
      for (let bar = 0; bar < song.bars; bar += 1) {
        const x = this.beatToX(bar * bpb);
        if (x > width) break;
        ctx.fillStyle = "rgba(255,79,216,0.58)";
        ctx.fillRect(x + 0.5, 0, 1, RULER_H);
        ctx.font = "600 9px 'Cascadia Code', Consolas, monospace";
        ctx.fillStyle = "rgba(245, 241, 255, 0.78)";
        ctx.textAlign = "left";
        ctx.fillText(String(bar + 1).padStart(2, "0"), x + 5, 12);
        if (barWidth > 36) {
          ctx.font = "8px 'Cascadia Code', Consolas, monospace";
          ctx.fillStyle = "rgba(85, 230, 255, 0.78)";
          const chord = song.chords[bar % song.chords.length];
          ctx.fillText(chord || "", x + 5, 24);
        }
      }

      // selected region markers on the left edge
      if (track) {
        ctx.fillStyle = rgba(track.color, 0.9);
        ctx.fillRect(0, RULER_H, 2, height - RULER_H);
      }
    }

    drawNotes(ctx) {
      const song = this.song;
      if (!song) return;
      const selectedId = this.selection && this.selection.noteId;
      const currentTrack = this.track;
      const allTracks = song.tracks.slice().sort((a, b) => (a.id === currentTrack.id ? 1 : b.id === currentTrack.id ? -1 : 0));

      allTracks.forEach((track) => {
        const isCurrent = currentTrack && track.id === currentTrack.id;
        track.notes.forEach((note) => {
          if (note.pitch < this.minMidi || note.pitch > this.maxMidi) return;
          const x = this.beatToX(note.start);
          const y = this.midiToY(note.pitch) + 1;
          const w = Math.max(4, note.dur * this.pxPerBeat - 1);
          const h = Math.max(4, this.rowH - 2);
          if (x > this.width + 10) return;
          const selected = isCurrent && note.id === selectedId;

          if (!isCurrent) {
            ctx.fillStyle = rgba(track.color, 0.16);
            roundRect(ctx, x, y, w, h, Math.min(3, h / 2));
            ctx.fill();
            return;
          }

          const gradient = ctx.createLinearGradient(x, y, x, y + h);
          gradient.addColorStop(0, rgba(track.color, selected ? 1 : 0.88));
          gradient.addColorStop(1, darken(track.color, selected ? 0.7 : 0.55));
          if (selected) {
            ctx.shadowColor = track.color;
            ctx.shadowBlur = 12;
          }
          ctx.fillStyle = gradient;
          roundRect(ctx, x, y, w, h, Math.min(3.5, h / 2));
          ctx.fill();
          ctx.shadowBlur = 0;
          if (selected) {
            ctx.strokeStyle = "rgba(255,255,255,0.92)";
            ctx.lineWidth = 1.2;
            roundRect(ctx, x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1), Math.min(3.5, h / 2));
            ctx.stroke();
          } else {
            ctx.strokeStyle = "rgba(255,255,255,0.18)";
            ctx.lineWidth = 0.8;
            roundRect(ctx, x + 0.4, y + 0.4, Math.max(1, w - 0.8), Math.max(1, h - 0.8), Math.min(3, h / 2));
            ctx.stroke();
          }
          if (w > 30 && this.rowH >= 10) {
            const label = track.role === "drums" && DRUM_LABELS[note.pitch] ? DRUM_LABELS[note.pitch] : U.midiToName(note.pitch);
            ctx.font = "600 7.5px 'Cascadia Code', Consolas, monospace";
            ctx.fillStyle = "rgba(10, 8, 20, 0.8)";
            ctx.textAlign = "left";
            ctx.fillText(label, x + 3, y + h / 2 + 2.7);
          }
        });
      });
    }

    drawHover(ctx) {
      if (!this.hover || this.drag) return;
      const state = this.state;
      if (state.tool !== "draw") return;
      if (this.hover.y < RULER_H) return;
      const midi = this.hover.midi;
      if (midi < this.minMidi || midi > this.maxMidi) return;
      if (this.findNoteAt(this.hover.x, this.hover.y)) return;
      const beat = U.clamp(this.snapBeat(this.xToBeat(this.hover.x)), 0, this.totalBeats - 0.05);
      const duration = Math.min(state.noteLength || 1, this.totalBeats - beat);
      const x = this.beatToX(beat);
      const y = this.midiToY(midi) + 1;
      const w = Math.max(4, duration * this.pxPerBeat - 1);
      const h = Math.max(4, this.rowH - 2);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(85,230,255,0.65)";
      ctx.fillStyle = "rgba(85,230,255,0.08)";
      ctx.lineWidth = 1;
      roundRect(ctx, x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1), 3);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    drawKeyboard() {
      const ctx = this.keysCtx;
      const width = 62;
      const height = this.height;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0d0c19";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(10, 9, 22, 0.98)";
      ctx.fillRect(0, 0, width, RULER_H);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.moveTo(0, RULER_H - 0.5);
      ctx.lineTo(width, RULER_H - 0.5);
      ctx.stroke();
      ctx.font = "6px 'Cascadia Code', Consolas, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.textAlign = "left";
      ctx.fillText("KEY", 5, 18);

      for (let midi = this.maxMidi; midi >= this.minMidi; midi -= 1) {
        const y = this.midiToY(midi);
        const black = U.isBlack(midi);
        const active = this.activeKey === midi;
        if (black) {
          ctx.fillStyle = active ? "#ff4fd8" : "#07070e";
          ctx.fillRect(16, y + 0.5, width - 16, Math.max(1, this.rowH - 1));
          ctx.strokeStyle = "rgba(255,255,255,0.08)";
          ctx.strokeRect(16.5, y + 0.5, width - 17, Math.max(1, this.rowH - 1));
        } else {
          ctx.fillStyle = active ? "#ffd0f5" : "#171627";
          ctx.fillRect(0, y + 0.5, width, Math.max(1, this.rowH - 1));
          ctx.strokeStyle = "rgba(255,255,255,0.07)";
          ctx.beginPath();
          ctx.moveTo(0, y + this.rowH - 0.5);
          ctx.lineTo(width, y + this.rowH - 0.5);
          ctx.stroke();
        }
        if (midi % 12 === 0) {
          ctx.font = "600 7px 'Cascadia Code', Consolas, monospace";
          ctx.fillStyle = active ? "rgba(255,79,216,0.95)" : "rgba(255,255,255,0.42)";
          ctx.fillText(U.midiToName(midi), 4, y + this.rowH / 2 + 2.6);
        }
      }
      ctx.fillStyle = "rgba(255,79,216,0.6)";
      ctx.fillRect(width - 2, RULER_H, 2, height - RULER_H);
    }
  }

  NS.PianoRollEditor = PianoRollEditor;
  NS.EDITOR_MIN_MIDI = MIN_MIDI;
  NS.EDITOR_MAX_MIDI = MAX_MIDI;
})();
