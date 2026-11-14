(function () {
  "use strict";
  const NS = (window.NS = window.NS || {});
  const U = NS.util;
  const T = NS.theory;
  const M = NS.model;

  const el = {};
  const state = {
    song: null,
    selectedTrackId: null,
    playing: false,
    playhead: 0,
    loop: true,
    snap: 0.5,
    noteLength: 1,
    tool: "draw",
    dirty: false,
    history: [],
    redo: [],
    seekResume: false,
    busy: false,
    lastFxNotice: 0,
  };

  let editor = null;
  let scopeCtx = null;
  let modalCloseHandler = null;
  let toastTimer = 0;

  const $ = (id) => document.getElementById(id);

  function init() {
    [
      "project-title", "btn-new", "btn-import", "btn-save", "btn-help",
      "btn-play", "btn-stop", "position-bar", "position-beat", "position-tick",
      "bpm", "btn-loop", "meter", "bars", "style-name", "btn-generate",
      "track-tabs", "btn-add-track", "track-count", "note-count-top",
      "tool-switch", "note-length", "snap", "btn-undo", "btn-redo",
      "btn-zoom-out", "btn-zoom-in", "zoom-value", "btn-clear-track",
      "roll", "keyboard", "roll-shell", "roll-viewport", "roll-content",
      "playhead", "edit-cursor", "selection-info",
      "scope", "scope-state", "scope-key", "scope-bpm",
      "style-packs", "track-name", "role-badge", "inspector-dot",
      "instrument-select", "instrument-desc", "btn-audition",
      "btn-track-mute", "btn-track-solo", "track-volume", "track-volume-value",
      "btn-delete-track", "fx-reverb", "fx-delay", "fx-drive", "fx-sidechain",
      "fx-brightness", "fx-reverb-value", "fx-delay-value", "fx-drive-value",
      "fx-sidechain-value", "fx-brightness-value",
      "key-root", "key-mode", "progression-select", "chord-chips", "btn-detect-key",
      "btn-harmonize", "arp-pattern", "drum-style", "density", "density-value", "swing", "swing-value",
      "btn-generate-2", "render-length", "btn-render-wav", "btn-export-midi",
      "btn-export-text", "btn-import-2", "btn-save-2", "btn-load-json", "project-stats",
      "file-input", "json-input", "modal-root", "modal-kicker", "modal-title",
      "modal-body", "modal-foot", "busy", "busy-title", "busy-desc", "busy-progress",
      "toast-root",
    ].forEach((id) => { el[id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())] = $(id); });
    el.title = $("project-title");

    scopeCtx = el.scope.getContext("2d");
    state.song = M.createDemoSong();
    state.selectedTrackId = state.song.tracks[0].id;

    buildKeyRoot();
    buildStylePacks();
    editor = new NS.PianoRollEditor({
      canvas: el.roll,
      keys: el.keyboard,
      viewport: el.rollViewport,
      content: el.rollContent,
      playhead: el.playhead,
      cursor: el.editCursor,
      shell: el.rollShell,
      host: {
        getSong: () => state.song,
        getSelectedTrack: getSelectedTrack,
        getState: () => ({ snap: state.snap, noteLength: state.noteLength, tool: state.tool }),
        onSelection: (selection) => syncSelectionInfo(selection),
        onBeforeEdit: () => { ensureStoppedForEdit(); pushHistory(); },
        onMutate: (info) => {
          markDirty();
          syncTrackTabs();
          syncStats();
          syncSelectionInfo();
          if (info && info.kind === "add") syncArrange();
        },
        onLiveEdit: () => syncSelectionInfo(),
        onSeek: (beat, final) => seekTo(beat, final),
        onPreview: (pitch) => {
          const track = getSelectedTrack();
          if (track) NS.audio.preview(state.song, track, pitch);
        },
        onZoom: (percent) => { el.zoomValue.textContent = `${percent}%`; },
      },
    });

    bindEvents();
    syncAll();
    setClean();
    requestAnimationFrame(animate);
    setTimeout(() => {
      toast("示例工程 NEON DREAM 已加载。按空格播放，或导入自己的乐谱。", "success", 4200);
    }, 650);
    setTimeout(() => {
      editor.resize();
      editor.render();
    }, 80);
  }

  function getSelectedTrack() {
    if (!state.song) return null;
    return state.song.tracks.find((track) => track.id === state.selectedTrackId) || state.song.tracks[0] || null;
  }

  function ensureSelectedTrack() {
    const track = getSelectedTrack();
    if (track) state.selectedTrackId = track.id;
    return track;
  }

  /* ------------------------------- UI construction ------------------------------- */

  function buildKeyRoot() {
    el.keyRoot.innerHTML = U.SHARP_NAMES.map((name, index) => `<option value="${index}">${name}</option>`).join("");
  }

  function buildStylePacks() {
    el.stylePacks.innerHTML = NS.STYLE_PACKS.map((pack) => `
      <button class="style-pack" data-pack="${pack.id}" style="--pack-color:${pack.color}" title="${U.escapeHtml(pack.desc)}">
        <span class="pack-name">${U.escapeHtml(pack.name)}</span>
        <span class="pack-en">${U.escapeHtml(pack.en)}</span>
        <span class="pack-bars"><i></i><i></i><i></i></span>
      </button>
    `).join("");
  }

  function instrumentListFor(track) {
    const isDrums = track.role === "drums";
    const groups = isDrums ? ["drums"] : ["lead", "arp", "bass", "pad"];
    const all = NS.allInstruments();
    const html = [];
    groups.forEach((category) => {
      const group = NS.PRESET_GROUPS.find((item) => item.id === category);
      const items = all.filter((preset) => preset.category === category);
      if (!items.length) return;
      html.push(`<optgroup label="${U.escapeHtml(group ? group.name : category)}">`);
      items.forEach((preset) => {
        html.push(`<option value="${preset.id}">${U.escapeHtml(preset.name)} · ${U.escapeHtml(preset.en)}</option>`);
      });
      html.push("</optgroup>");
    });
    if (!all.some((preset) => preset.id === track.instrument)) {
      html.push(`<optgroup label="其他"><option value="${U.escapeHtml(track.instrument)}">${U.escapeHtml(track.instrument)}</option></optgroup>`);
    }
    return html.join("");
  }

  function buildTrackTabs() {
    const song = state.song;
    if (!song) return;
    el.trackTabs.innerHTML = song.tracks.map((track) => {
      const active = track.id === state.selectedTrackId;
      return `
        <div class="track-tab ${active ? "active" : ""}" data-track="${U.escapeHtml(track.id)}" style="--track-color:${U.escapeHtml(track.color)}" role="tab" aria-selected="${active}" tabindex="0" title="${U.escapeHtml(track.name)} · ${track.notes.length} 个音符">
          <span class="track-dot"></span>
          <span class="track-tab-name">${U.escapeHtml(track.name)}</span>
          <span class="track-tab-meta">${track.notes.length}</span>
          <span class="tab-flags">
            <button class="tab-flag ${track.mute ? "on" : ""}" data-flag="mute" title="静音">M</button>
            <button class="tab-flag ${track.solo ? "on" : ""}" data-flag="solo" title="独奏">S</button>
          </span>
        </div>
      `;
    }).join("");
    el.trackCount.textContent = `${song.tracks.length} TRACKS`;
  }

  function syncTrackTabs() {
    buildTrackTabs();
    const active = el.trackTabs.querySelector(".track-tab.active");
    if (active) {
      try { active.scrollIntoView({ inline: "nearest", block: "nearest" }); } catch (_) { /* noop */ }
    }
  }

  function syncStylePacks() {
    const style = NS.STYLE_PACKS.find((pack) => pack.id === state.song.styleId) || NS.STYLE_PACKS[0];
    el.styleName.textContent = style.en;
    el.stylePacks.querySelectorAll("[data-pack]").forEach((button) => {
      button.classList.toggle("active", button.dataset.pack === style.id);
    });
  }

  function syncInspector() {
    const track = ensureSelectedTrack();
    if (!track) return;
    el.trackName.value = track.name;
    el.inspectorDot.style.background = track.color;
    el.inspectorDot.style.color = track.color;
    el.roleBadge.textContent = NS.ROLE_LABELS[track.role] || track.role.toUpperCase();
    const selection = track.instrument;
    if (el.instrumentSelect.dataset.track !== track.id || el.instrumentSelect.dataset.role !== track.role) {
      el.instrumentSelect.innerHTML = instrumentListFor(track);
      el.instrumentSelect.dataset.track = track.id;
      el.instrumentSelect.dataset.role = track.role;
    }
    el.instrumentSelect.value = selection;
    if (el.instrumentSelect.value !== selection && el.instrumentSelect.options.length) {
      el.instrumentSelect.value = el.instrumentSelect.options[0].value;
    }
    const preset = NS.getPreset(selection);
    el.instrumentDesc.textContent = preset ? preset.desc : "自定义音色";
    el.trackVolume.value = String(Math.round(track.volume * 100));
    el.trackVolumeValue.textContent = String(Math.round(track.volume * 100));
    el.btnTrackMute.classList.toggle("on", Boolean(track.mute));
    el.btnTrackSolo.classList.toggle("on", Boolean(track.solo));
    el.btnDeleteTrack.disabled = state.song.tracks.length <= 1;
  }

  function syncFx() {
    const mapping = [
      ["fxReverb", "fxReverbValue", "reverb"],
      ["fxDelay", "fxDelayValue", "delay"],
      ["fxDrive", "fxDriveValue", "drive"],
      ["fxSidechain", "fxSidechainValue", "sidechain"],
      ["fxBrightness", "fxBrightnessValue", "brightness"],
    ];
    mapping.forEach(([input, label, key]) => {
      const value = Math.round(state.song.fx[key] || 0);
      el[input].value = String(value);
      el[label].textContent = String(value);
    });
  }

  function syncArrangement() {
    const song = state.song;
    el.keyRoot.value = String(song.keyRoot);
    el.keyMode.value = song.keyMode;
    const mode = song.keyMode;
    if (el.progressionSelect.dataset.mode !== mode) {
      const defs = T.PROGRESSIONS[mode] || T.PROGRESSIONS.minor;
      el.progressionSelect.innerHTML = defs.map((def) => `<option value="${def.id}">${U.escapeHtml(def.name)} · ${def.roman}</option>`).join("");
      el.progressionSelect.dataset.mode = mode;
    }
    const presetExists = Array.from(el.progressionSelect.options).some((option) => option.value === song.progressionPreset);
    if (!presetExists) {
      song.progressionPreset = (T.PROGRESSIONS[mode] || T.PROGRESSIONS.minor)[0].id;
    }
    el.progressionSelect.value = song.progressionPreset;
    syncChordChips();
    el.arpPattern.value = song.arpPattern;
    el.drumStyle.value = song.drumStyle;
    el.density.value = String(song.density);
    el.densityValue.textContent = String(song.density);
    el.swing.value = String(song.swing);
    el.swingValue.textContent = String(song.swing);
  }

  function syncChordChips() {
    const chords = state.song.chords || [];
    const shown = chords.slice(0, 16);
    let html = shown.map((chord, index) => `<span class="chord-chip" title="第 ${index + 1} 小节">${U.escapeHtml(chord)}</span>`).join("");
    if (chords.length > 16) html += `<span class="chord-chip">+${chords.length - 16}</span>`;
    el.chordChips.innerHTML = html;
  }

  function syncStats() {
    const song = state.song;
    const notes = M.noteCount(song);
    const duration = M.durationSeconds(song);
    const pack = NS.STYLE_PACKS.find((item) => item.id === song.styleId) || NS.STYLE_PACKS[0];
    el.noteCountTop.textContent = `${notes} NOTES`;
    el.trackCount.textContent = `${song.tracks.length} TRACKS`;
    el.styleName.textContent = pack.en;
    el.scopeKey.textContent = `${U.pcName(song.keyRoot)} ${song.keyMode.toUpperCase()}`;
    el.scopeBpm.textContent = `${song.bpm} BPM`;
    el.renderLength.textContent = `~${U.formatClock(duration + 3)}`;
    const stats = [
      ["NOTES", String(notes)],
      ["TRACKS", String(song.tracks.length)],
      ["BARS", String(song.bars)],
      ["TEMPO", `${song.bpm} BPM`],
      ["KEY", `${U.pcName(song.keyRoot)} ${song.keyMode === "minor" ? "MIN" : "MAJ"}`],
      ["LENGTH", U.formatClock(duration)],
    ];
    el.projectStats.innerHTML = stats.map(([label, value]) => `<div class="stat"><span>${label}</span><b>${value}</b></div>`).join("");
  }

  function syncSelectionInfo(selection) {
    const selected = selection || (editor ? editor.getSelectedNote() : null);
    if (!selected) {
      el.selectionInfo.textContent = "NO NOTE SELECTED";
      return;
    }
    const { note, track } = selected;
    const label = track.role === "drums" && M.DRUM_NAMES[note.pitch] ? M.DRUM_NAMES[note.pitch] : U.midiToName(note.pitch);
    const pos = U.formatPosition(note.start, state.song.beatsPerBar);
    const dur = Number(note.dur.toFixed(2));
    el.selectionInfo.textContent = `${track.name.toUpperCase()} · ${label} · ${pos.bar}:${pos.beat} · ${dur} BEAT · VEL ${Math.round(note.vel * 127)}`;
  }

  function syncPlayButton() {
    el.btnPlay.classList.toggle("playing", state.playing);
    el.btnPlay.setAttribute("aria-label", state.playing ? "暂停" : "播放");
    el.scopeState.textContent = state.playing ? "LIVE" : "IDLE";
    el.scopeState.classList.toggle("live", state.playing);
  }

  function syncUndoButtons() {
    el.btnUndo.disabled = state.history.length === 0;
    el.btnRedo.disabled = state.redo.length === 0;
  }

  function syncTransport() {
    const song = state.song;
    el.title.value = song.title;
    el.bpm.value = String(song.bpm);
    if (!Array.from(el.meter.options).some((option) => option.value === song.meter)) {
      const option = document.createElement("option");
      option.value = song.meter;
      option.textContent = song.meter.replace("/", " / ");
      el.meter.appendChild(option);
    }
    el.meter.value = song.meter;
    if (!Array.from(el.bars.options).some((option) => option.value === String(song.bars))) {
      const option = document.createElement("option");
      option.value = String(song.bars);
      option.textContent = String(song.bars);
      el.bars.appendChild(option);
    }
    el.bars.value = String(song.bars);
    el.btnLoop.classList.toggle("active", state.loop);
    el.btnLoop.setAttribute("aria-pressed", String(state.loop));
    updatePosition(state.playhead);
  }

  function syncAll() {
    if (!state.song) return;
    ensureSelectedTrack();
    syncTransport();
    syncStylePacks();
    syncTrackTabs();
    syncInspector();
    syncFx();
    syncArrangement();
    syncStats();
    syncPlayButton();
    syncUndoButtons();
    if (editor) {
      editor.resize();
      editor.render();
      editor.setPlayhead(state.playhead);
    }
    updateTitle();
  }

  function setRackTab(tabId) {
    document.querySelectorAll(".rack-tabs button").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tabId);
    });
    document.querySelectorAll(".rack-panel").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tabId;
    });
  }

  /* ------------------------------- playback ------------------------------- */

  function currentBeat() {
    if (state.playing) {
      const beat = NS.audio.getBeat();
      if (beat != null && Number.isFinite(beat)) return beat;
    }
    return state.playhead;
  }

  function playFrom(beat) {
    if (!state.song) return;
    if (M.noteCount(state.song) === 0) {
      toast("这个工程还没有音符。先写几个音符，或导入乐谱。", "error");
      return;
    }
    const total = M.totalBeats(state.song);
    let start = U.clamp(Number(beat) || 0, 0, total);
    if (start >= total - 0.01) start = 0;
    state.playhead = start;
    NS.audio.onended = () => {
      state.playing = false;
      state.playhead = 0;
      editor.setPlayhead(0);
      updatePosition(0);
      syncPlayButton();
    };
    try {
      NS.audio.play(state.song, start, state.loop);
      state.playing = true;
      state.seekResume = false;
      syncPlayButton();
      updatePosition(start);
    } catch (error) {
      state.playing = false;
      syncPlayButton();
      toast(error.message || "播放失败，请检查浏览器音频权限。", "error");
    }
  }

  function togglePlay() {
    if (state.playing) {
      state.playhead = currentBeat();
      NS.audio.stop();
      state.playing = false;
      syncPlayButton();
      updatePosition(state.playhead);
      return;
    }
    playFrom(state.playhead);
  }

  function stopPlayback(reset) {
    if (state.playing || NS.audio.playingState) NS.audio.stop();
    state.playing = false;
    state.seekResume = false;
    if (reset) {
      state.playhead = 0;
      editor.setPlayhead(0);
      updatePosition(0);
    }
    syncPlayButton();
  }

  function ensureStoppedForEdit() {
    if (!state.playing) return;
    const beat = currentBeat();
    NS.audio.stop();
    state.playing = false;
    state.playhead = beat;
    syncPlayButton();
    updatePosition(beat);
  }

  function seekTo(beat, final) {
    if (!state.song) return;
    const total = M.totalBeats(state.song);
    const target = U.clamp(Number(beat) || 0, 0, total);
    state.playhead = target;
    editor.setPlayhead(target);
    updatePosition(target);
    if (state.playing) {
      if (!state.seekResume) {
        state.seekResume = true;
        NS.audio.stop();
        state.playing = false;
        syncPlayButton();
      }
    }
    if (final && state.seekResume) {
      state.seekResume = false;
      playFrom(state.playhead);
    }
  }

  function updatePosition(beat) {
    if (!state.song) return;
    const pos = U.formatPosition(beat, state.song.beatsPerBar);
    el.positionBar.textContent = pos.bar;
    el.positionBeat.textContent = pos.beat;
    el.positionTick.textContent = pos.tick;
  }

  /* ------------------------------- history ------------------------------- */

  function snapshot() {
    return {
      song: U.deepClone(state.song),
      selectedTrackId: state.selectedTrackId,
    };
  }

  function pushHistory() {
    if (!state.song) return;
    state.history.push(snapshot());
    if (state.history.length > 80) state.history.shift();
    state.redo = [];
    syncUndoButtons();
    markDirty();
  }

  function undo() {
    if (!state.history.length) return;
    stopPlayback(false);
    const current = snapshot();
    const previous = state.history.pop();
    state.redo.push(current);
    state.song = previous.song;
    state.selectedTrackId = previous.selectedTrackId;
    if (!state.song.tracks.some((track) => track.id === state.selectedTrackId)) {
      state.selectedTrackId = state.song.tracks[0] ? state.song.tracks[0].id : null;
    }
    state.playhead = 0;
    if (editor) editor.selection = null;
    syncAll();
    syncSelectionInfo(null);
    markDirty();
    toast("已撤销。");
  }

  function redo() {
    if (!state.redo.length) return;
    stopPlayback(false);
    const current = snapshot();
    const next = state.redo.pop();
    state.history.push(current);
    state.song = next.song;
    state.selectedTrackId = next.selectedTrackId;
    if (!state.song.tracks.some((track) => track.id === state.selectedTrackId)) {
      state.selectedTrackId = state.song.tracks[0] ? state.song.tracks[0].id : null;
    }
    state.playhead = 0;
    if (editor) editor.selection = null;
    syncAll();
    syncSelectionInfo(null);
    markDirty();
    toast("已重做。");
  }

  /* ------------------------------- editing ------------------------------- */

  function setTool(tool) {
    state.tool = tool;
    document.querySelectorAll("#tool-switch button").forEach((button) => {
      button.classList.toggle("active", button.dataset.tool === tool);
    });
    el.roll.style.cursor = tool === "draw" ? "crosshair" : "default";
  }

  function deleteSelected() {
    const selected = editor ? editor.getSelectedNote() : null;
    if (!selected) return;
    ensureStoppedForEdit();
    pushHistory();
    const { note, track } = selected;
    track.notes = track.notes.filter((item) => item.id !== note.id);
    editor.clearSelection();
    syncTrackTabs();
    syncStats();
    syncSelectionInfo();
    editor.render();
    markDirty();
  }

  function duplicateSelected() {
    const selected = editor ? editor.getSelectedNote() : null;
    if (!selected) return;
    ensureStoppedForEdit();
    pushHistory();
    const { note, track } = selected;
    const total = M.totalBeats(state.song);
    const start = U.clamp(note.start + note.dur, 0, Math.max(0, total - note.dur));
    const copy = M.note(note.pitch, start, note.dur, note.vel);
    track.notes.push(copy);
    editor.setSelection(copy, track.id);
    syncTrackTabs();
    syncStats();
    syncSelectionInfo();
    editor.render();
    markDirty();
  }

  function nudgeSelected(key, shift) {
    const selected = editor ? editor.getSelectedNote() : null;
    if (!selected) return;
    ensureStoppedForEdit();
    pushHistory();
    const { note } = selected;
    const total = M.totalBeats(state.song);
    const step = state.snap > 0 ? state.snap : 0.25;
    if (key === "ArrowLeft") note.start = U.clamp(note.start - step, 0, total - note.dur);
    else if (key === "ArrowRight") note.start = U.clamp(note.start + step, 0, total - note.dur);
    else if (key === "ArrowUp") note.pitch = U.clamp(note.pitch + (shift ? 12 : 1), 0, 127);
    else if (key === "ArrowDown") note.pitch = U.clamp(note.pitch - (shift ? 12 : 1), 0, 127);
    syncSelectionInfo();
    editor.resize();
    editor.render();
    markDirty();
  }

  function selectTrack(trackId) {
    if (!state.song.tracks.some((track) => track.id === trackId)) return;
    state.selectedTrackId = trackId;
    if (editor) editor.clearSelection();
    syncTrackTabs();
    syncInspector();
    syncSelectionInfo(null);
    editor.render();
    setRackTab("sound");
    syncUndoButtons();
  }

  function toggleTrackFlag(trackId, flag) {
    const track = state.song.tracks.find((item) => item.id === trackId);
    if (!track) return;
    pushHistory();
    track[flag] = !track[flag];
    syncTrackTabs();
    syncInspector();
    NS.audio.updateMix(state.song);
    markDirty();
  }

  function changeVolume(value) {
    const track = getSelectedTrack();
    if (!track) return;
    track.volume = U.clamp(Number(value) / 100, 0, 1);
    el.trackVolumeValue.textContent = String(Math.round(track.volume * 100));
    NS.audio.updateMix(state.song);
    markDirty();
  }

  function changeInstrument(instrument) {
    const track = getSelectedTrack();
    if (!track) return;
    const wasPlaying = state.playing;
    const beat = currentBeat();
    if (wasPlaying) {
      NS.audio.stop();
      state.playing = false;
    }
    pushHistory();
    track.instrument = instrument;
    syncInspector();
    markDirty();
    if (wasPlaying) {
      playFrom(beat);
    } else {
      setTimeout(() => auditionTrack(), 80);
    }
    toast(`音色已切换为「${(NS.getPreset(instrument) || {}).name || instrument}」。`);
  }

  function auditionTrack() {
    const track = getSelectedTrack();
    if (!track) return;
    let pitches;
    if (track.role === "drums") pitches = [36, 38, 42, 46];
    else if (track.role === "bass") pitches = [36, 43, 48];
    else if (track.role === "pad") pitches = [60, 64, 67, 71];
    else pitches = [60, 64, 67, 72];
    pitches.forEach((pitch, index) => {
      setTimeout(() => {
        if (state.song && state.song.tracks.some((item) => item.id === track.id)) {
          NS.audio.preview(state.song, track, pitch);
        }
      }, index * 120);
    });
  }

  function clearTrack() {
    const track = getSelectedTrack();
    if (!track) return;
    if (!track.notes.length) {
      toast("当前轨道没有音符。");
      return;
    }
    confirmDialog("清空轨道", `确定清空「${track.name}」中的 ${track.notes.length} 个音符吗？`, "清空").then((ok) => {
      if (!ok) return;
      ensureStoppedForEdit();
      pushHistory();
      track.notes = [];
      editor.clearSelection();
      syncTrackTabs();
      syncStats();
      syncSelectionInfo(null);
      editor.render();
      markDirty();
      toast("轨道已清空。");
    });
  }

  /* ------------------------------- song-level changes ------------------------------- */

  function applyStylePack(styleId) {
    const pack = NS.STYLE_PACKS.find((item) => item.id === styleId);
    if (!pack) return;
    ensureStoppedForEdit();
    pushHistory();
    M.applyStyle(state.song, styleId);
    syncAll();
    markDirty();
    toast(`已应用「${pack.name}」音色包。点“一键编曲”可重写伴奏织体。`, "success", 3600);
  }

  function generateArrangement() {
    ensureStoppedForEdit();
    pushHistory();
    M.syncChords(state.song);
    const result = M.generateArrangement(state.song, { preserveLead: true });
    state.playhead = 0;
    syncAll();
    markDirty();
    if (result.melodyCreated) {
      toast(`主旋律为空，已自动作曲并生成伴奏 · ${result.notes} 个音符。`, "success", 3800);
    } else {
      toast(`伴奏已生成 · ${result.notes} 个音符。按空格试听。`, "success", 3200);
    }
  }

  function detectKey() {
    const leadNotes = M.melodyPitches(state.song);
    const allNotes = [];
    state.song.tracks.forEach((track) => track.notes.forEach((note) => allNotes.push(note)));
    const notes = leadNotes.length ? leadNotes : allNotes;
    if (!notes.length) {
      toast("还没有音符可以分析。", "error");
      return;
    }
    const result = T.detectKey(notes);
    ensureStoppedForEdit();
    pushHistory();
    state.song.keyRoot = result.root;
    state.song.keyMode = result.mode;
    const defs = T.PROGRESSIONS[result.mode];
    if (!defs.some((item) => item.id === state.song.progressionPreset)) {
      state.song.progressionPreset = defs[0].id;
    }
    M.regenerateChords(state.song);
    syncAll();
    markDirty();
    toast(`检测为 ${U.pcName(result.root)} ${result.mode === "minor" ? "小调" : "大调"} · 置信度 ${Math.round(result.confidence * 100)}%。`, "success", 3600);
  }

  function diatonicQuality(rootPc, mode, pitchClass) {
    const scales = {
      major: { intervals: [0, 2, 4, 5, 7, 9, 11], qualities: ["", "m", "m", "", "", "m", "dim"] },
      minor: { intervals: [0, 2, 3, 5, 7, 8, 10], qualities: ["m", "dim", "", "m", "m", "", ""] },
    };
    const scale = scales[mode] || scales.minor;
    const interval = ((pitchClass - rootPc) % 12 + 12) % 12;
    const degree = scale.intervals.indexOf(interval);
    return degree >= 0 ? scale.qualities[degree] : "m";
  }

  function harmonizeSelected() {
    const selected = editor ? editor.getSelectedNote() : null;
    if (!selected) {
      toast("先在钢琴卷帘里选中一个音符，再点“为选中根音配和弦”。", "error", 4200);
      return;
    }
    const { note, track } = selected;
    if (track.role === "drums") {
      toast("鼓组音符不能配和弦。请选中主旋律、琶音或铺底里的音符。", "error", 4200);
      return;
    }
    const bpb = state.song.beatsPerBar;
    const total = M.totalBeats(state.song);
    const bar = Math.max(0, Math.min(state.song.bars - 1, Math.floor(note.start / bpb + 0.0001)));
    const barChord = state.song.chords[bar % state.song.chords.length];
    const parsedBar = T.parseChord(barChord);
    const notePc = U.pc(note.pitch);
    const preferFlat = state.song.chords.some((chord) => chord.includes("b"));
    let quality;
    let chordName;
    if (notePc === parsedBar.rootPc) {
      quality = parsedBar.quality;
      chordName = barChord;
    } else {
      quality = diatonicQuality(state.song.keyRoot, state.song.keyMode, notePc);
      chordName = `${U.pcName(notePc, preferFlat)}${quality}`;
    }
    const intervals = T.parseChord(chordName).intervals;
    let rootMidi = note.pitch;
    while (rootMidi > 72) rootMidi -= 12;
    while (rootMidi < 48) rootMidi += 12;
    while (rootMidi + Math.max(...intervals) > 84 && rootMidi - 12 >= 36) rootMidi -= 12;
    const pitches = intervals.map((interval) => U.clamp(rootMidi + interval, 0, 127));
    const start = note.start;
    const end = Math.min(total, (bar + 1) * bpb);
    const duration = Math.max(0.25, end - start - 0.04);

    ensureStoppedForEdit();
    pushHistory();
    const target = M.ensureTrack(state.song, "pad", state.song.styleId);
    target.notes = target.notes.filter((existing) => existing.start >= end - 0.001 || existing.start + existing.dur <= start + 0.001);
    pitches.forEach((pitch, index) => {
      target.notes.push(M.note(pitch, start, duration, index === 0 ? 0.48 : 0.34));
    });
    syncAll();
    markDirty();
    const names = pitches.map((pitch) => U.midiToName(pitch, preferFlat)).join(" · ");
    toast(`根音 ${U.midiToName(note.pitch, preferFlat)} → ${chordName} 和弦：${names}。已写入「${target.name}」。`, "success", 4600);
  }

  function changeKey() {
    ensureStoppedForEdit();
    pushHistory();
    state.song.keyRoot = Number(el.keyRoot.value);
    state.song.keyMode = el.keyMode.value;
    const defs = T.PROGRESSIONS[state.song.keyMode];
    if (!defs.some((item) => item.id === state.song.progressionPreset)) {
      state.song.progressionPreset = defs[0].id;
    }
    M.regenerateChords(state.song);
    syncAll();
    markDirty();
  }

  function changeProgression() {
    ensureStoppedForEdit();
    pushHistory();
    state.song.progressionPreset = el.progressionSelect.value;
    M.regenerateChords(state.song);
    syncChordChips();
    syncStats();
    editor.render();
    markDirty();
  }

  function changeBpm() {
    const next = U.clamp(Math.round(Number(el.bpm.value) || 100), 40, 220);
    if (next === state.song.bpm) {
      el.bpm.value = String(state.song.bpm);
      return;
    }
    const wasPlaying = state.playing;
    const beat = currentBeat();
    if (wasPlaying) {
      NS.audio.stop();
      state.playing = false;
    }
    pushHistory();
    state.song.bpm = next;
    el.bpm.value = String(next);
    syncStats();
    markDirty();
    if (wasPlaying) playFrom(beat);
  }

  function countNotesOutside(song, total) {
    let count = 0;
    song.tracks.forEach((track) => {
      track.notes.forEach((note) => {
        if (note.start >= total || note.start + note.dur > total + 0.001) count += 1;
      });
    });
    return count;
  }

  function trimNotes(song) {
    const total = M.totalBeats(song);
    let changed = 0;
    song.tracks.forEach((track) => {
      const kept = [];
      track.notes.forEach((note) => {
        if (note.start >= total) {
          changed += 1;
          return;
        }
        if (note.start + note.dur > total) {
          note.dur = Math.max(0.04, total - note.start);
          changed += 1;
        }
        kept.push(note);
      });
      track.notes = kept;
    });
    return changed;
  }

  async function changeBars() {
    const target = U.clamp(parseInt(el.bars.value, 10) || 8, 1, 64);
    if (target === state.song.bars) return;
    const newTotal = target * state.song.beatsPerBar;
    const outside = target < state.song.bars ? countNotesOutside(state.song, newTotal) : 0;
    if (outside > 0) {
      const ok = await confirmDialog("缩短工程", `缩短到 ${target} 小节会删除或截断 ${outside} 个超出的音符。继续吗？`, "继续");
      if (!ok) {
        syncTransport();
        return;
      }
    }
    ensureStoppedForEdit();
    pushHistory();
    state.song.bars = target;
    M.regenerateChords(state.song);
    const trimmed = trimNotes(state.song);
    state.playhead = Math.min(state.playhead, M.totalBeats(state.song));
    syncAll();
    markDirty();
    if (trimmed) toast(`已截断 ${trimmed} 个超出范围的音符。`);
  }

  async function changeMeter() {
    const meter = el.meter.value;
    const beats = M.meterToBeats(meter);
    if (!beats) {
      syncTransport();
      return;
    }
    if (meter === state.song.meter) return;
    const newTotal = state.song.bars * beats;
    const outside = countNotesOutside(state.song, newTotal);
    if (outside > 0) {
      const ok = await confirmDialog("改变拍号", `改变拍号会删除或截断 ${outside} 个超出的音符。继续吗？`, "继续");
      if (!ok) {
        syncTransport();
        return;
      }
    }
    ensureStoppedForEdit();
    pushHistory();
    state.song.meter = meter;
    state.song.beatsPerBar = beats;
    M.regenerateChords(state.song);
    const trimmed = trimNotes(state.song);
    state.playhead = Math.min(state.playhead, M.totalBeats(state.song));
    syncAll();
    markDirty();
    if (trimmed) toast(`已截断 ${trimmed} 个超出范围的音符。`);
  }

  function toggleLoop() {
    state.loop = !state.loop;
    el.btnLoop.classList.toggle("active", state.loop);
    el.btnLoop.setAttribute("aria-pressed", String(state.loop));
    if (state.playing) {
      const beat = currentBeat();
      NS.audio.stop();
      state.playing = false;
      playFrom(beat);
    }
  }

  function changeArrangeSetting(key, value) {
    ensureStoppedForEdit();
    pushHistory();
    if (key === "density" || key === "swing") state.song[key] = U.clamp(Number(value), 0, 100);
    else state.song[key] = value;
    markDirty();
    if (key === "density") {
      el.densityValue.textContent = String(state.song.density);
    } else if (key === "swing") {
      el.swingValue.textContent = String(state.song.swing);
    }
  }

  /* ------------------------------- import / export ------------------------------- */

  function loadParsedSong(parsed, options) {
    const opts = options || {};
    const source = parsed && (parsed.song || parsed.data) ? (parsed.song || parsed.data) : parsed;
    if (!source || !Array.isArray(source.tracks) || !source.tracks.length) {
      throw new Error("乐谱中没有可用的声部。");
    }
    const notes = [];
    source.tracks.forEach((track) => {
      (track.notes || []).forEach((note) => notes.push(note));
    });
    if (!notes.length) throw new Error("乐谱中没有可用的音符。");

    let keyRoot = Number(source.keyRoot);
    let keyMode = source.keyMode === "major" ? "major" : "minor";
    if (!Number.isFinite(keyRoot)) {
      const detected = T.detectKey(notes);
      keyRoot = detected.root;
      keyMode = detected.mode;
    }
    keyRoot = U.clamp(Math.round(keyRoot), 0, 11);

    const styleId = NS.STYLE_PACKS.some((pack) => pack.id === (source.styleId || opts.styleId))
      ? (source.styleId || opts.styleId)
      : "synthwave";
    const meter = M.meterToBeats(source.meter)
      ? source.meter
      : M.beatsToMeter([2, 3, 4, 5].includes(Number(source.beatsPerBar)) ? Number(source.beatsPerBar) : 4);
    const beatsPerBar = M.meterToBeats(meter) || 4;
    let bars = U.clamp(Math.round(Number(source.bars) || Math.ceil(notes.reduce((max, note) => Math.max(max, (Number(note.start) || 0) + (Number(note.dur) || 0)), 0) / beatsPerBar)), 1, 64);
    bars = Math.max(1, bars);
    const modePresets = T.PROGRESSIONS[keyMode] || T.PROGRESSIONS.minor;
    const progressionPreset = modePresets.some((preset) => preset.id === source.progressionPreset)
      ? source.progressionPreset
      : modePresets[0].id;
    const title = String(opts.title || source.title || opts.sourceTitle || "IMPORTED SCORE").slice(0, 40);

    const base = M.createSong({
      title,
      bpm: U.clamp(Number(source.bpm) || 100, 40, 220),
      meter,
      bars,
      root: keyRoot,
      mode: keyMode,
      progressionPreset,
      styleId,
    });
    base.tracks = U.deepClone(source.tracks);
    if (Array.isArray(source.chords) && source.chords.length === bars && source.chords.every((chord) => typeof chord === "string")) {
      base.chords = source.chords.slice();
    }
    if (source.fx && typeof source.fx === "object") {
      ["reverb", "delay", "drive", "sidechain", "brightness"].forEach((key) => {
        if (Number.isFinite(Number(source.fx[key]))) base.fx[key] = U.clamp(Number(source.fx[key]), 0, 100);
      });
    }
    ["arpPattern", "drumStyle"].forEach((key) => {
      if (typeof source[key] === "string") base[key] = source[key];
    });
    ["density", "swing"].forEach((key) => {
      if (Number.isFinite(Number(source[key]))) base[key] = U.clamp(Number(source[key]), 0, 100);
    });

    const song = M.normalizeSong(base);
    let melodyCreated = false;
    if (opts.autoArrange !== false && song.tracks.length === 1 && song.tracks[0].role === "lead") {
      const result = M.generateArrangement(song, { preserveLead: true });
      melodyCreated = Boolean(result.melodyCreated);
    }
    setSong(song, { dirty: opts.dirty !== false });
    state.playhead = 0;
    if (editor) {
      editor.viewport.scrollLeft = 0;
      editor.setPlayhead(0);
    }
    updatePosition(0);
    const warningText = (source.warnings || []).concat(parsed.warnings || []).filter(Boolean);
    toast(`已载入《${song.title}》 · ${song.bars} 小节 · ${song.tracks.length} 轨 · ${M.noteCount(song)} 音符${melodyCreated ? " · 已自动编曲" : ""}。`, "success", 4200);
    warningText.slice(0, 2).forEach((text) => toast(text, "error", 4500));
  }

  function setSong(song, options) {
    const opts = options || {};
    stopPlayback(false);
    state.song = song;
    state.selectedTrackId = song.tracks[0] ? song.tracks[0].id : null;
    state.playhead = 0;
    state.seekResume = false;
    state.history = [];
    state.redo = [];
    if (editor) {
      editor.selection = null;
      editor.viewport.scrollLeft = 0;
    }
    syncAll();
    if (editor) {
      editor.setPlayhead(0);
      editor.render();
    }
    state.dirty = opts.dirty !== false;
    updateTitle();
    syncUndoButtons();
    syncSelectionInfo(null);
  }

  function loadProject(raw, sourceName) {
    const song = M.normalizeSong(raw);
    setSong(song, { dirty: false });
    toast(`工程《${song.title}》已打开${sourceName ? ` · ${sourceName}` : ""}。`, "success", 3600);
  }

  async function handleFile(file) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    const ext = lower.split(".").pop();
    const base = file.name.replace(/\.[^.]+$/, "");
    if (file.size > 25 * 1024 * 1024) {
      toast("文件太大（超过 25MB），请先精简乐谱。", "error");
      return;
    }
    try {
      setBusy(true, "READING SCORE", `正在读取 ${file.name}…`);
      await new Promise((resolve) => setTimeout(resolve, 40));
      if (ext === "json" || ext === "nsscore") {
        const text = await U.readAsText(file);
        const data = JSON.parse(text);
        loadProject(data, file.name);
      } else if (ext === "mid" || ext === "midi") {
        const buffer = await U.readAsArrayBuffer(file);
        const parsed = NS.midi.parse(buffer, { title: base });
        loadParsedSong(parsed, { sourceTitle: base, autoArrange: true });
      } else if (ext === "musicxml" || ext === "xml" || ext === "mxl") {
        const buffer = await U.readAsArrayBuffer(file);
        const parsed = await NS.musicxml.parseFile(buffer, file.name, { title: base });
        loadParsedSong(parsed, { sourceTitle: base, autoArrange: true });
      } else if (ext === "txt" || ext === "text" || ext === "nst" || ext === "nstext") {
        const text = await U.readAsText(file);
        const parsed = NS.textscore.parse(text, { title: base });
        loadParsedSong(parsed, { sourceTitle: base, autoArrange: true });
      } else {
        throw new Error("不支持这个文件类型。请选择 MIDI、MusicXML、.mxl、文本谱或工程 JSON。");
      }
    } catch (error) {
      toast(error.message || String(error), "error", 5200);
    } finally {
      setBusy(false);
      el.fileInput.value = "";
    }
  }

  function saveProject() {
    const data = M.serializeSong(state.song);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    U.downloadBlob(blob, `${U.safeFilename(state.song.title, "neonscore")}.nsscore.json`);
    setClean();
    toast("工程已保存为 .nsscore.json。建议放入 scores/output/ 目录。", "success", 3800);
  }

  function exportMidi() {
    if (!M.noteCount(state.song)) {
      toast("没有音符可以导出。", "error");
      return;
    }
    const blob = NS.midi.write(state.song);
    U.downloadBlob(blob, `${U.safeFilename(state.song.title, "neonscore")}.mid`);
    toast("MIDI 已导出，可在 DAW 或制谱软件里继续编辑。", "success", 3600);
  }

  function exportTextScore() {
    if (!M.noteCount(state.song)) {
      toast("没有音符可以导出。", "error");
      return;
    }
    const text = NS.textscore.stringify(state.song);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    U.downloadBlob(blob, `${U.safeFilename(state.song.title, "neonscore")}.nst`);
    toast("文本谱 .nst 已导出。用 VSCode 或记事本打开即可继续写。", "success", 4200);
  }

  async function renderWav() {
    if (state.busy) return;
    if (!M.noteCount(state.song)) {
      toast("没有音符可以渲染。", "error");
      return;
    }
    const duration = M.durationSeconds(state.song) + 3;
    if (duration > 360) {
      toast("工程超过 6 分钟，渲染会比较久，请稍候。", "error", 4200);
    }
    try {
      setBusy(true, "RENDERING WAV", "正在离线构建合成器、鼓组与效果器…");
      setBusyProgress(0.06);
      const result = await NS.audio.renderWav(state.song, (progress) => setBusyProgress(progress));
      setBusyProgress(1);
      const pack = NS.STYLE_PACKS.find((item) => item.id === state.song.styleId) || NS.STYLE_PACKS[0];
      U.downloadBlob(result.blob, `${U.safeFilename(state.song.title, "neonscore")} - ${pack.en}.wav`);
      toast(`WAV 已渲染完成（${(result.blob.size / 1024 / 1024).toFixed(1)} MB）。`, "success", 4200);
    } catch (error) {
      toast(error.message || "音频渲染失败。", "error", 5200);
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------- modals ------------------------------- */

  function openModal(options) {
    if (!el.modalRoot.hidden) closeModal();
    el.modalKicker.textContent = options.kicker || "NEONSCORE";
    el.modalTitle.textContent = options.title || "";
    el.modalBody.innerHTML = options.body || "";
    el.modalFoot.innerHTML = "";
    modalCloseHandler = options.onClose || null;
    const actions = options.actions || [{ label: "关闭" }];
    actions.forEach((action) => {
      const button = document.createElement("button");
      button.className = `modal-btn ${action.primary ? "primary" : ""}`;
      button.textContent = action.label;
      button.addEventListener("click", () => {
        if (action.onClick) action.onClick();
        else closeModal();
      });
      el.modalFoot.appendChild(button);
    });
    el.modalRoot.hidden = false;
    if (options.onMount) options.onMount(el.modalBody, el.modalFoot);
    setTimeout(() => {
      const focusable = el.modalBody.querySelector("textarea, input, select, button");
      if (focusable) focusable.focus();
    }, 30);
  }

  function closeModal() {
    if (el.modalRoot.hidden) return;
    el.modalRoot.hidden = true;
    const callback = modalCloseHandler;
    modalCloseHandler = null;
    if (callback) callback();
  }

  function confirmDialog(title, message, confirmLabel, kicker) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        closeModal();
        resolve(value);
      };
      openModal({
        kicker: kicker || "CONFIRM",
        title,
        body: `<p>${U.escapeHtml(message)}</p>`,
        actions: [
          { label: "取消", onClick: () => finish(false) },
          { label: confirmLabel || "确定", primary: true, onClick: () => finish(true) },
        ],
        onClose: () => {
          if (!settled) {
            settled = true;
            resolve(false);
          }
        },
      });
    });
  }

  function openImportModal() {
    const localLibrary = Array.isArray(window.NEON_LOCAL_LIBRARY) ? window.NEON_LOCAL_LIBRARY : [];
    const library = (Array.isArray(window.NEON_SCORE_LIBRARY) ? window.NEON_SCORE_LIBRARY : []).concat(localLibrary);
    const sampleCards = library.length ? library.map((entry, index) => {
      const raw = entry.song || entry.data || entry;
      const bars = raw.bars || 8;
      const notes = (raw.tracks || []).reduce((sum, track) => sum + ((track.notes || []).length), 0);
      const sampleColor = /^#[0-9a-f]{6}$/i.test(entry.color || "") ? entry.color : "#ff4fd8";
      return `
        <button class="sample-card" data-sample="${index}" style="--sample-color:${sampleColor}">
          <span class="sample-tag">${U.escapeHtml(entry.badge || "SCORE")}</span>
          <b>${U.escapeHtml(entry.title || raw.title || "未命名示例")}</b>
          <span>${U.escapeHtml(entry.description || "打开即可试听与编辑。")}</span>
          <em>${bars} BARS · ${notes} NOTES · ${U.escapeHtml(entry.styleLabel || entry.style || "SYNTH")}</em>
        </button>
      `;
    }).join("") : `<p class="modal-note">还没有示例谱库。你仍然可以导入本地文件，或把乐谱放到 scores/ 目录。</p>`;

    openModal({
      kicker: "IMPORT / SCORE LIBRARY",
      title: "导入乐谱",
      body: `
        <h3>示例谱库</h3>
        <p class="modal-note">直接载入内置工程，试听不同音色与编曲。示例数据位于 <code>scores/</code>。</p>
        <div class="sample-grid">${sampleCards}</div>
        <h3>从文件导入</h3>
        <div class="import-actions">
          <button class="wide-btn primary" id="modal-pick-file">选择本地乐谱文件</button>
          <button class="wide-btn" id="modal-paste-text">粘贴文本谱</button>
          <button class="wide-btn" id="modal-open-json">打开工程 JSON</button>
        </div>
        <div class="format-grid">
          <div class="format-card"><b>MIDI</b><span>.mid / .midi · 多轨、鼓组、速度与拍号</span></div>
          <div class="format-card"><b>MUSICXML</b><span>.musicxml / .xml / .mxl · 制谱软件导出</span></div>
          <div class="format-card"><b>NST TEXT</b><span>.nst / .txt · 记事本可写，支持自动和弦</span></div>
          <div class="format-card"><b>PROJECT</b><span>.nsscore.json · 完整保留音色与效果</span></div>
        </div>
        <p class="modal-note">文本谱格式说明在 <code>scores/NST-FORMAT.md</code>。支持 <code>/4</code> 四分音符、<code>chords: Cm | Ab</code> 自动配和弦，也支持 VSCode 语法高亮。</p>
        <p class="modal-note">支持导入乐谱，<strong>不支持扫描图片或 PDF 的 OCR 识谱</strong>。图片谱请先转成 MusicXML 或 MIDI。</p>
        <p class="modal-note">示例「東方連復段」的旋律素材来自 Wikimedia Commons 的 <a href="https://commons.wikimedia.org/wiki/File:AsianRiffSheetMusic.png" target="_blank" rel="noopener">AsianRiffSheetMusic</a>（CC BY-SA 3.0）；本工程中的合成器编曲、音色与鼓组为原创改编。</p>
        ${localLibrary.length ? `<p class="modal-note">LOCAL 标签条目来自你工作区的 MIDI。以「TH06_05 おてんば恋娘」为例，原曲版权归 ZUN / Team Shanghai Alice，仅用于本地个人编辑，请勿再分发该改编文件。</p>` : ""}
      `,
      actions: [{ label: "关闭" }],
      onMount: (body) => {
        body.querySelectorAll("[data-sample]").forEach((button) => {
          button.addEventListener("click", () => {
            const entry = library[Number(button.dataset.sample)];
            if (!entry) return;
            closeModal();
            try {
              loadParsedSong(entry.song || entry.data || entry, {
                title: entry.title,
                autoArrange: false,
                dirty: false,
              });
            } catch (error) {
              toast(error.message || String(error), "error", 5200);
            }
          });
        });
        body.querySelector("#modal-pick-file")?.addEventListener("click", () => {
          closeModal();
          el.fileInput.click();
        });
        body.querySelector("#modal-paste-text")?.addEventListener("click", () => {
          closeModal();
          openTextModal();
        });
        body.querySelector("#modal-open-json")?.addEventListener("click", () => {
          closeModal();
          el.jsonInput.click();
        });
      },
    });
  }

  function openTextModal() {
    openModal({
      kicker: "TEXT SCORE",
      title: "粘贴文本谱",
      body: `
        <p class="modal-note">用空格分隔音符；<code>C5/4</code> 是四分音符，<code>D5/8</code> 是八分音符，<code>R/4</code> 是休止；<code>C5:maj7</code> 会自动补全 C E G B；<code>[C5,E5,G5]/2</code> 是显式和弦。也支持 <code>C5:1</code> 表示 1 拍。</p>
        <textarea id="text-score-input" spellcheck="false">${U.escapeHtml(NS.textscore.EXAMPLE)}</textarea>
        <p class="modal-error" id="text-score-error"></p>
        <p class="modal-note">可用 <code>track lead "主旋律" instrument=neonSaw</code> 开轨，用 <code>chords: Cm | Ab | Fm | G</code> 每小节自动生成一个和弦。导入后会自动识别调性，并为单旋律生成伴奏。</p>
      `,
      actions: [
        { label: "取消" },
        {
          label: "导入文本谱",
          primary: true,
          onClick: () => {
            const textarea = el.modalBody.querySelector("#text-score-input");
            const errorEl = el.modalBody.querySelector("#text-score-error");
            try {
              const parsed = NS.textscore.parse(textarea.value);
              closeModal();
              loadParsedSong(parsed, { autoArrange: true, title: parsed.title, dirty: true });
            } catch (error) {
              if (errorEl) errorEl.textContent = error.message || String(error);
            }
          },
        },
      ],
    });
  }

  function openHelpModal() {
    openModal({
      kicker: "GUIDE / SHORTCUTS",
      title: "使用说明",
      body: `
        <h3>三步做出电子波音乐</h3>
        <ul>
          <li><strong>写：</strong>在钢琴卷帘上点一下写入音符，拖动移动，拖右边缘改时值。轨道标签可以切换主音、琶音、贝斯、铺底与鼓组。</li>
          <li><strong>配：</strong>右侧「音色」里给每条轨道换乐器；「音色包」会一次性换整套配器与效果。</li>
          <li><strong>编：</strong>点击「一键编曲」，程序会根据和弦走向生成贝斯、琶音、铺底与鼓，主旋律会保留。</li>
        </ul>
        <h3>支持导入</h3>
        <div class="format-grid">
          <div class="format-card"><b>MIDI</b><span>.mid / .midi</span></div>
          <div class="format-card"><b>MUSICXML</b><span>.musicxml / .xml / .mxl</span></div>
          <div class="format-card"><b>NST TEXT</b><span>.nst / .txt · 记事本可写</span></div>
          <div class="format-card"><b>PROJECT</b><span>.nsscore.json</span></div>
        </div>
        <p>导入 MIDI 时按 1/16 量化；MusicXML 保留原始时值。图片/PDF 扫描谱需要先转换为 MusicXML 或 MIDI。</p>
        <h3>文本谱 .nst</h3>
        <p>纯文本格式，适合 VSCode / 记事本。用 <code>C5/4</code>、<code>D5/8</code> 写时值，<code>R/4</code> 写休止；<code>track lead "主旋律" instrument=neonSaw</code> 开轨；<code>chords: Cm | Ab | Fm | G</code> 每小节自动补全和弦。格式文档在 <code>scores/NST-FORMAT.md</code>。</p>
        <h3>自动配和弦</h3>
        <p>在钢琴卷帘中选中一个音符，点击「为选中根音配和弦」（或按 <span class="kbd">H</span>），程序会以它为根音，按当前调性/小节和弦补全三和弦或七和弦，并写入铺底轨道。文本谱里的 <code>C5:maj7</code> 也会自动展开成 C E G B。</p>
        <h3>音色库</h3>
        <p>包括霓虹锯齿、方波英雄、八音盒、水晶主音、玻璃琶音、星尘钟琴、FM 电钢、模拟/Sub/FM/芯片贝斯、暖色/玻璃/弦乐/暗色/风琴铺底，以及门限 80s、808、芯片、录音棚、磁带鼓组。</p>
        <h3>快捷键</h3>
        <ul>
          <li><span class="kbd">Space</span> 播放 / 暂停 · <span class="kbd">Del</span> 删除音符 · <span class="kbd">Ctrl</span> + <span class="kbd">D</span> 复制 · <span class="kbd">H</span> 配和弦</li>
          <li><span class="kbd">Ctrl</span> + <span class="kbd">Z</span> 撤销 · <span class="kbd">Ctrl</span> + <span class="kbd">Shift</span> + <span class="kbd">Z</span> 重做 · <span class="kbd">Ctrl</span> + <span class="kbd">S</span> 保存工程</li>
          <li>方向键微调位置，<span class="kbd">Shift</span> + 上下键移动八度</li>
        </ul>
        <p class="modal-note">工程导出建议保存到 <code>scores/output/</code>；内置示例在 <code>scores/</code>。示例旋律来源：Wikimedia Commons「AsianRiffSheetMusic」，CC BY-SA 3.0。</p>
      `,
      actions: [{ label: "开始制作", primary: true }],
    });
  }

  function openAddTrackModal() {
    const roles = [
      ["lead", "主旋律", "LEAD", "再写一条旋律或副旋律"],
      ["arp", "琶音", "ARP", "高频律动与分解和弦"],
      ["bass", "低音", "BASS", "根音、八度与切分低音"],
      ["pad", "铺底", "PAD", "长音和声与氛围"],
      ["drums", "鼓组", "DRUMS", "电子鼓、军鼓与踩镲"],
    ];
    openModal({
      kicker: "NEW CHANNEL",
      title: "添加轨道",
      body: `<p class="modal-note">选择轨道角色。之后可以为它单独选择音色、调整音量，并用画笔写入音符。</p>
        <div class="role-grid">${roles.map(([role, name, en, desc]) => `
          <button class="role-choice" data-role="${role}">
            <b>${name}</b><span>${en}</span><em>${desc}</em>
          </button>
        `).join("")}</div>`,
      actions: [{ label: "取消" }],
      onMount: (body) => {
        body.querySelectorAll("[data-role]").forEach((button) => {
          button.addEventListener("click", () => {
            const role = button.dataset.role;
            closeModal();
            addTrack(role);
          });
        });
      },
    });
  }

  function addTrack(role) {
    ensureStoppedForEdit();
    pushHistory();
    const count = state.song.tracks.filter((track) => track.role === role).length;
    const track = M.createTrack(role, state.song.tracks.length, state.song.styleId);
    track.name = count ? `${M.ROLE_NAMES[role]} ${count + 1}` : M.ROLE_NAMES[role];
    state.song.tracks.push(track);
    state.selectedTrackId = track.id;
    if (editor) editor.clearSelection();
    syncAll();
    markDirty();
    toast(`已添加「${track.name}」轨道。`);
  }

  function deleteTrack() {
    const track = getSelectedTrack();
    if (!track) return;
    if (state.song.tracks.length <= 1) {
      toast("至少保留一条轨道。", "error");
      return;
    }
    confirmDialog("删除轨道", `确定删除「${track.name}」及其 ${track.notes.length} 个音符吗？`, "删除").then((ok) => {
      if (!ok) return;
      ensureStoppedForEdit();
      pushHistory();
      state.song.tracks = state.song.tracks.filter((item) => item.id !== track.id);
      state.selectedTrackId = state.song.tracks[0].id;
      if (editor) editor.clearSelection();
      syncAll();
      markDirty();
      toast("轨道已删除。");
    });
  }

  function newProject() {
    const start = () => {
      const song = M.createSong({
        title: "UNTITLED",
        bpm: 100,
        meter: "4/4",
        bars: 8,
        root: 9,
        mode: "minor",
        progressionPreset: "bittersweet",
        styleId: "synthwave",
      });
      setSong(song, { dirty: true });
      toast("空白工程已创建。点击钢琴卷帘写入第一个音符，或导入乐谱。", "success", 3800);
    };
    if (!state.dirty) {
      start();
      return;
    }
    confirmDialog("新建工程", "当前工程还有未保存的改动，确定新建吗？", "新建").then((ok) => {
      if (ok) start();
    });
  }

  /* ------------------------------- file + misc ------------------------------- */

  function markDirty() {
    state.dirty = true;
    updateTitle();
  }

  function setClean() {
    state.dirty = false;
    updateTitle();
  }

  function updateTitle() {
    if (!state.song) return;
    const prefix = state.dirty ? "● " : "";
    document.title = `${prefix}${state.song.title || "UNTITLED"} — NEONSCORE`;
  }

  function toast(message, type, duration) {
    const node = document.createElement("div");
    node.className = `toast ${type || "info"}`;
    node.textContent = message;
    el.toastRoot.appendChild(node);
    while (el.toastRoot.children.length > 4) el.toastRoot.firstChild.remove();
    setTimeout(() => {
      node.classList.add("out");
      setTimeout(() => node.remove(), 240);
    }, duration || 3000);
  }

  function setBusy(show, title, desc) {
    state.busy = Boolean(show);
    el.busy.hidden = !show;
    if (title) el.busyTitle.textContent = title;
    if (desc) el.busyDesc.textContent = desc;
    if (show) setBusyProgress(0);
  }

  function setBusyProgress(value) {
    el.busyProgress.style.width = `${U.clamp(value * 100, 0, 100)}%`;
  }

  function isTypingTarget(target) {
    return target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
  }

  function animateScope(time) {
    const canvas = el.scope;
    if (!scopeCtx) return;
    const width = Math.max(200, canvas.clientWidth || 300);
    const height = Math.max(60, canvas.clientHeight || 88);
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = scopeCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const analyser = NS.audio.getAnalyser();
    if (state.playing && analyser) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const bars = 46;
      const gap = 2;
      const barWidth = Math.max(1, (width - 12) / bars - gap);
      for (let i = 0; i < bars; i += 1) {
        const index = Math.floor(Math.pow(i / bars, 1.55) * data.length * 0.7);
        const value = data[index] / 255;
        const barHeight = Math.max(1, value * (height - 14));
        const x = 6 + i * (barWidth + gap);
        const y = height - 5 - barHeight;
        const gradient = ctx.createLinearGradient(0, y, 0, height);
        gradient.addColorStop(0, "rgba(255,79,216,0.95)");
        gradient.addColorStop(0.6, "rgba(155,108,255,0.75)");
        gradient.addColorStop(1, "rgba(85,230,255,0.18)");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);
      }
      ctx.strokeStyle = "rgba(85,230,255,0.14)";
      ctx.beginPath();
      ctx.moveTo(2, height - 5.5);
      ctx.lineTo(width - 2, height - 5.5);
      ctx.stroke();
    } else {
      const t = time * 0.001;
      for (let layer = 0; layer < 3; layer += 1) {
        ctx.beginPath();
        for (let x = 0; x <= width; x += 2) {
          const y = height * 0.55
            + Math.sin(x * 0.042 + t * (0.65 + layer * 0.15) + layer * 1.7) * (5 + layer * 4)
            + Math.sin(x * 0.012 - t * 0.35) * 4;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = layer === 0 ? "rgba(255,79,216,0.44)" : layer === 1 ? "rgba(85,230,255,0.24)" : "rgba(155,108,255,0.2)";
        ctx.lineWidth = layer === 0 ? 1.2 : 0.8;
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      for (let i = 0; i < 12; i += 1) {
        const x = (i / 11) * width;
        ctx.fillRect(x, 0, 1, height);
      }
    }
  }

  function animate(time) {
    if (state.playing) {
      const beat = NS.audio.getBeat();
      if (beat != null && Number.isFinite(beat)) {
        state.playhead = beat;
        updatePosition(beat);
        editor.setPlayhead(beat);
        editor.follow(beat);
      }
    }
    animateScope(time);
    requestAnimationFrame(animate);
  }

  /* ------------------------------- events ------------------------------- */

  function bindEvents() {
    el.btnPlay.addEventListener("click", togglePlay);
    el.btnStop.addEventListener("click", () => stopPlayback(true));
    el.btnLoop.addEventListener("click", toggleLoop);
    el.bpm.addEventListener("change", changeBpm);
    el.meter.addEventListener("change", changeMeter);
    el.bars.addEventListener("change", changeBars);
    el.btnGenerate.addEventListener("click", generateArrangement);
    el.btnGenerate2.addEventListener("click", generateArrangement);

    el.btnNew.addEventListener("click", newProject);
    el.btnImport.addEventListener("click", openImportModal);
    el.btnImport2.addEventListener("click", openImportModal);
    el.btnSave.addEventListener("click", saveProject);
    el.btnSave2.addEventListener("click", saveProject);
    el.btnLoadJson.addEventListener("click", () => el.jsonInput.click());
    el.btnHelp.addEventListener("click", openHelpModal);

    el.toolSwitch.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tool]");
      if (button) setTool(button.dataset.tool);
    });
    el.noteLength.addEventListener("change", () => {
      state.noteLength = Number(el.noteLength.value) || 1;
    });
    el.snap.addEventListener("change", () => {
      state.snap = Number(el.snap.value);
    });
    el.btnUndo.addEventListener("click", undo);
    el.btnRedo.addEventListener("click", redo);
    el.btnZoomIn.addEventListener("click", () => editor.zoomIn());
    el.btnZoomOut.addEventListener("click", () => editor.zoomOut());
    el.btnClearTrack.addEventListener("click", clearTrack);

    el.trackTabs.addEventListener("click", (event) => {
      const flag = event.target.closest("[data-flag]");
      const tab = event.target.closest("[data-track]");
      if (!tab) return;
      if (flag) {
        event.stopPropagation();
        toggleTrackFlag(tab.dataset.track, flag.dataset.flag);
        return;
      }
      selectTrack(tab.dataset.track);
    });
    el.trackTabs.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const tab = event.target.closest("[data-track]");
      if (tab) {
        event.preventDefault();
        selectTrack(tab.dataset.track);
      }
    });
    el.btnAddTrack.addEventListener("click", openAddTrackModal);

    el.stylePacks.addEventListener("click", (event) => {
      const button = event.target.closest("[data-pack]");
      if (button) applyStylePack(button.dataset.pack);
    });
    el.instrumentSelect.addEventListener("change", () => changeInstrument(el.instrumentSelect.value));
    el.btnAudition.addEventListener("click", auditionTrack);
    el.btnTrackMute.addEventListener("click", () => {
      const track = getSelectedTrack();
      if (track) toggleTrackFlag(track.id, "mute");
    });
    el.btnTrackSolo.addEventListener("click", () => {
      const track = getSelectedTrack();
      if (track) toggleTrackFlag(track.id, "solo");
    });
    el.trackVolume.addEventListener("input", () => changeVolume(el.trackVolume.value));
    el.trackVolume.addEventListener("change", markDirty);
    el.trackName.addEventListener("input", () => {
      const track = getSelectedTrack();
      if (!track) return;
      track.name = el.trackName.value.slice(0, 24) || "未命名轨道";
      const activeName = el.trackTabs.querySelector(".track-tab.active .track-tab-name");
      if (activeName) activeName.textContent = track.name;
      markDirty();
    });
    el.btnDeleteTrack.addEventListener("click", deleteTrack);

    bindFxSlider("fxReverb", "fxReverbValue", "reverb");
    bindFxSlider("fxDelay", "fxDelayValue", "delay");
    bindFxSlider("fxDrive", "fxDriveValue", "drive");
    bindFxSlider("fxSidechain", "fxSidechainValue", "sidechain");
    bindFxSlider("fxBrightness", "fxBrightnessValue", "brightness");

    el.keyRoot.addEventListener("change", changeKey);
    el.keyMode.addEventListener("change", changeKey);
    el.progressionSelect.addEventListener("change", changeProgression);
    el.btnDetectKey.addEventListener("click", detectKey);
    el.btnHarmonize.addEventListener("click", harmonizeSelected);
    el.arpPattern.addEventListener("change", () => changeArrangeSetting("arpPattern", el.arpPattern.value));
    el.drumStyle.addEventListener("change", () => changeArrangeSetting("drumStyle", el.drumStyle.value));
    el.density.addEventListener("input", () => {
      el.densityValue.textContent = el.density.value;
      state.song.density = Number(el.density.value);
    });
    el.density.addEventListener("change", markDirty);
    el.swing.addEventListener("input", () => {
      el.swingValue.textContent = el.swing.value;
      state.song.swing = Number(el.swing.value);
    });
    el.swing.addEventListener("change", markDirty);

    el.btnRenderWav.addEventListener("click", renderWav);
    el.btnExportMidi.addEventListener("click", exportMidi);
    el.btnExportText.addEventListener("click", exportTextScore);

    el.title.addEventListener("input", () => {
      state.song.title = el.title.value.slice(0, 36) || "UNTITLED";
      markDirty();
    });
    el.title.addEventListener("keydown", (event) => {
      if (event.key === "Enter") el.title.blur();
    });

    document.querySelectorAll(".rack-tabs button").forEach((button) => {
      button.addEventListener("click", () => setRackTab(button.dataset.tab));
    });

    el.fileInput.addEventListener("change", () => {
      const file = el.fileInput.files && el.fileInput.files[0];
      if (file) handleFile(file);
    });
    el.jsonInput.addEventListener("change", () => {
      const file = el.jsonInput.files && el.jsonInput.files[0];
      if (file) handleFile(file);
      el.jsonInput.value = "";
    });

    el.modalRoot.addEventListener("click", (event) => {
      if (event.target.closest("[data-close]")) closeModal();
    });

    document.addEventListener("keydown", handleKeyDown);

    window.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    window.addEventListener("drop", (event) => {
      event.preventDefault();
      if (!el.modalRoot.hidden) return;
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function bindFxSlider(inputId, labelId, key) {
    const input = el[inputId];
    const label = el[labelId];
    input.addEventListener("input", () => {
      const value = Number(input.value);
      state.song.fx[key] = value;
      label.textContent = String(value);
    });
    input.addEventListener("change", () => {
      markDirty();
      if (state.playing && Date.now() - state.lastFxNotice > 6000) {
        state.lastFxNotice = Date.now();
        toast("主效果器参数会在下一次播放时重新构建。");
      }
    });
  }

  function handleKeyDown(event) {
    if (!el.modalRoot.hidden) {
      if (event.key === "Escape") closeModal();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveProject();
      return;
    }
    if (isTypingTarget(event.target)) return;

    if (event.code === "Space") {
      event.preventDefault();
      togglePlay();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelected();
      return;
    }
    if (event.key === "Escape") {
      if (editor) editor.clearSelection();
      return;
    }
    if (event.key === "?" || (event.shiftKey && event.key === "/")) {
      event.preventDefault();
      openHelpModal();
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (mod && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelected();
      return;
    }
    if (!mod && event.key.toLowerCase() === "h") {
      event.preventDefault();
      harmonizeSelected();
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      nudgeSelected(event.key, event.shiftKey);
    }
  }

  init();
})();
