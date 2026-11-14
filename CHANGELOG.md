# Changelog

All notable changes to NeonScore Music Project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/), versioning follows SemVer for the app.

## [0.1.0] — 2026-11-15

### Added

- Browser-based NeonScore workstation: neon synthwave UI, transport, piano roll, track mixer and spectrum monitor.
- 28 built-in instruments across lead / arp / bass / pad / drums, plus 6 tone packs:
  Synthwave, Music Box, Chiptune, Dreamwave, Darksynth, City Pop.
- Web Audio synth engine with oscillator layering, FM bells, pulse waves, noise layers, filters, envelopes,
  vibrato, stereo spread, delay, convolution reverb, gated reverb, drive, compression and sidechain pumping.
- Automatic arrangement: bass, arpeggio, pad, drums, fills, and melody generation when the lead track is empty.
- Auto chord helper: select a root note and press `H` / “为选中根音配和弦” to write a triad or seventh chord
  into the pad track using the current key and bar chord.
- MIDI import: multi-track, multi-channel, drum channel, tempo, time signature, UTF-8 / Shift-JIS metadata,
  role and instrument heuristics.
- MusicXML import: partwise `.musicxml` / `.xml`, compressed `.mxl`, ties, chords, rests, voices, divisions.
- `.nst` text score format:
  - sequential shorthand and absolute `@bar:beat` positioning;
  - `/4`, `/8`, `/2`, dotted values and `:beats` durations;
  - explicit chords, `Root:quality` auto chords, `chords: Cm | Ab | Fm | G` per-bar harmony;
  - velocity `v=0..127`, drum shorthand `K/S/H/O/C/T/CR`;
  - multi-track headers with instrument, volume and start bar;
  - export preserves pitch, start, duration, velocity, instrument and drums.
- Dynamic piano roll range: imported high melodies and low basses automatically expand the visible range;
  vertical scrolling is enabled when the range cannot fit.
- Incremental audio scheduling with a 1.8 s lookahead, so large MIDI projects do not freeze the UI on play.
- WAV export via `OfflineAudioContext` (44.1 kHz / 16-bit stereo), MIDI export, NST export and project JSON.
- Example score library: three editable “東方連復段” arrangements (Synthwave / Music Box / Chiptune)
  and a local `TH06_05 おてんば恋娘` edit generated from the user-provided MIDI.
- VS Code extension for `.nst` syntax highlighting and snippets under `editors/vscode-nst/`.
- Repository README, changelog, development log and security audit.

### Security / hardening

- Sanitized imported project track IDs and note IDs before they reach DOM templates.
- Escaped track IDs/colors in track tabs; validated sample-card colors as six-digit hex.
- Hardened `.mxl` ZIP parsing: entry-count cap, per-entry size cap, total uncompressed cap,
  bounds checks, and only XML/container entries are decompressed.
- Hardened download filenames (`..`, path separators).
- Removed Node `vm` from the sample-generation tools. Shared modules now expose CommonJS exports
  and the tools use static `require()`; no local source string is executed.
- Added a CSP to `index.html` (`default-src 'self' file: blob: data:`, `connect-src 'none'`,
  no remote script sources) and tested file:// loading, MIDI/MusicXML import, WAV download,
  and project JSON download in Chrome.
- Verified no runtime `eval`, `new Function`, `child_process`, `fetch`, `axios`, remote scripts,
  Electron, or third-party npm dependencies.

### Known limitations

- No OMR/OCR for image or PDF scores.
- MIDI tempo/time-signature maps are reduced to the first tempo and meter.
- Very large projects remain visually dense; 14-track / 4,608-note import has been tested but canvas
  rendering is not virtualized.
- `.mxl` ZIP64 archives and non-UTF-8 XML encodings are not supported.
- Browser downloads cannot write directly into `scores/output/`.
