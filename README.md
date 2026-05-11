# Concerto

**Concerto** is a collaborative, generative music canvas for the web. Users join a shared 8000x8000px canvas, pick up a brush, and draw — each stroke is automatically mapped to a musical instrument and note based on its color, shape, and geometry, contributing to a living ambient composition that everyone on the canvas hears and shapes together.
Built with React, Vite, TypeScript, Supabase, and the Web Audio API. No audio files — every sound is synthesized in the browser.
Features

# Features
- Freehand drawing on a shared persistent canvas with pan and zoom
- 8 instrument timbres (808 bass, kick, snare, hi-hat, chimes, synth pad, horns, synth lead, vocal pad) each driven by color selection
- All notes snapped to a shared key so the canvas always sounds harmonious
- Per-drawing mute and volume control
- Tempo slider and tap-tempo
- Viewport Mode — pan the canvas to change what you hear
- Chord sheet export of your active sounds
- Admin dashboard for canvas and user management
