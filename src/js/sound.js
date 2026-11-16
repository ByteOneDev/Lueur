/* Lueur — ambiances sonores génératives + sons de frappe (Web Audio, aucun fichier, aucun réseau).
   Le choix de la source (Spotify / YouTube Music) viendra plus tard : cette couche sera alors une « source » parmi d’autres. */
const Sound = (() => {
  'use strict';
  let ctx = null, out = null, analyser = null, data = null, cur = null, idx = 0, playing = false, t0 = 0, acc = 0, white = null, brown = null;
  const TRACKS = [
    { name: 'Route de nuit', build: drive },
    { name: 'Pluie sur la vitre', build: rain },
    { name: 'Feu de bois', build: fire },
  ];

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain(); out.gain.value = .9;
      analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .8;
      out.connect(analyser); analyser.connect(ctx.destination);
      data = new Uint8Array(analyser.frequencyBinCount);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function whiteBuf() {
    if (!white) {
      const n = ctx.sampleRate * 3, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      white = b;
    }
    return white;
  }
  function brownBuf() {
    if (!brown) {
      const n = ctx.sampleRate * 4, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      let l = 0;
      for (let i = 0; i < n; i++) { l = (l + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; }
      brown = b;
    }
    return brown;
  }
  const loop = (buf, bag) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); bag.nodes.push(s); return s; };
  const filt = (type, f, q) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q != null) x.Q.value = q; return x; };
  const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function drive(dest, bag) {
    const CH = [[57, 64, 67, 72], [53, 60, 64, 69], [48, 55, 59, 64], [55, 62, 65, 71]];
    const lp = filt('lowpass', 1100, .6);
    lp.connect(gain(.55)).connect(dest);
    const lfo = ctx.createOscillator(); lfo.frequency.value = .05;
    lfo.connect(gain(450)).connect(lp.frequency); lfo.start(); bag.nodes.push(lfo);
    loop(whiteBuf(), bag).connect(filt('highpass', 4500)).connect(gain(.008)).connect(dest);
    let k = 0;
    const D = 7;
    const chord = () => {
      const when = ctx.currentTime + .05, notes = CH[k++ % CH.length];
      notes.forEach((m, j) => [-7, 7].forEach(det => {
        const o = ctx.createOscillator(); o.type = j === 0 ? 'triangle' : 'sawtooth';
        o.frequency.value = mtof(m); o.detune.value = det;
        const e = ctx.createGain();
        e.gain.setValueAtTime(0, when); e.gain.linearRampToValueAtTime(.032, when + 2.5);
        e.gain.setValueAtTime(.032, when + D - .5); e.gain.linearRampToValueAtTime(0, when + D + 2);
        o.connect(e).connect(lp); o.start(when); o.stop(when + D + 2.1);
      }));
      const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = mtof(notes[0] - 12);
      const be = ctx.createGain();
      be.gain.setValueAtTime(0, when); be.gain.linearRampToValueAtTime(.12, when + 1.5); be.gain.linearRampToValueAtTime(0, when + D + 1);
      b.connect(be).connect(dest); b.start(when); b.stop(when + D + 1.1);
      for (let s = 0; s < 4; s++) {
        const w = when + 1 + s * 1.5 + Math.random() * .2;
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(notes[(s + 1) % notes.length] + 12);
        const e = ctx.createGain();
        e.gain.setValueAtTime(0, w); e.gain.linearRampToValueAtTime(.022, w + .02); e.gain.exponentialRampToValueAtTime(.0001, w + 2.2);
        o.connect(e).connect(dest); o.start(w); o.stop(w + 2.3);
      }
    };
    chord();
    bag.timers.push(setInterval(chord, D * 1000));
  }

  function rain(dest, bag) {
    loop(whiteBuf(), bag).connect(filt('lowpass', 1300)).connect(gain(.3)).connect(dest);
    loop(whiteBuf(), bag).connect(filt('highpass', 5200)).connect(gain(.035)).connect(dest);
    const drop = when => {
      const o = ctx.createOscillator(), f = 1800 + Math.random() * 2600;
      o.frequency.setValueAtTime(f, when); o.frequency.exponentialRampToValueAtTime(f * .5, when + .04);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(.02 * Math.random(), when + .003); g.gain.exponentialRampToValueAtTime(.0001, when + .05);
      o.connect(g).connect(dest); o.start(when); o.stop(when + .06);
    };
    bag.timers.push(setInterval(() => { for (let k = 0; k < 4; k++) drop(ctx.currentTime + Math.random() * .25); }, 250));
  }

  function fire(dest, bag) {
    loop(brownBuf(), bag).connect(filt('lowpass', 520)).connect(gain(.55)).connect(dest);
    const crackle = when => {
      const s = ctx.createBufferSource(); s.buffer = whiteBuf();
      const g = ctx.createGain();
      g.gain.setValueAtTime(.04 + .14 * Math.random(), when); g.gain.exponentialRampToValueAtTime(.0001, when + .015 + Math.random() * .035);
      s.connect(filt('bandpass', 1200 + Math.random() * 3200, 1.2)).connect(g).connect(dest);
      s.start(when, Math.random() * 2, .08);
    };
    bag.timers.push(setInterval(() => { const n = Math.random() * 4 | 0; for (let k = 0; k < n; k++) crackle(ctx.currentTime + Math.random() * .2); }, 200));
  }

  function play() {
    if (playing || !ensure()) return;
    const bag = { nodes: [], timers: [], g: ctx.createGain() };
    bag.g.gain.setValueAtTime(0, ctx.currentTime);
    bag.g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    bag.g.connect(out);
    TRACKS[idx].build(bag.g, bag);
    cur = bag; playing = true; t0 = ctx.currentTime;
  }
  function kill(bag, fade = .6) {
    if (!bag) return;
    const now = ctx.currentTime;
    bag.g.gain.cancelScheduledValues(now); bag.g.gain.setValueAtTime(bag.g.gain.value, now); bag.g.gain.linearRampToValueAtTime(0, now + fade);
    bag.timers.forEach(clearInterval);
    setTimeout(() => { bag.nodes.forEach(n => { try { n.stop(); } catch (e) { /* déjà arrêté */ } }); bag.g.disconnect(); }, fade * 1000 + 120);
  }
  function pause() { if (!playing) return; acc += ctx.currentTime - t0; kill(cur); cur = null; playing = false; }
  function go(d) {
    const was = playing;
    if (playing) { kill(cur, .4); cur = null; playing = false; }
    idx = (idx + d + TRACKS.length) % TRACKS.length; acc = 0;
    if (was) play();
  }
  function levels(n) {
    if (!playing || !analyser) return null;
    analyser.getByteFrequencyData(data);
    const out = [];
    for (let i = 0; i < n; i++) out.push(data[Math.floor(2 + i * 56 / n)] / 255);
    return out;
  }

  /** Son de touche : 'key' | 'space' | 'enter' | 'back' */
  function key(kind) {
    if (!ensure()) return;
    const now = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = whiteBuf();
    const isEnter = kind === 'enter';
    const f = filt('bandpass', isEnter ? 650 : kind === 'space' ? 1300 : kind === 'back' ? 1700 : 2300 + Math.random() * 1500, isEnter ? 1.6 : 3.5);
    const g = ctx.createGain(), v = isEnter ? .55 : kind === 'space' ? .28 : .34;
    g.gain.setValueAtTime(v, now); g.gain.exponentialRampToValueAtTime(.0001, now + (isEnter ? .13 : .035));
    s.connect(f).connect(g).connect(ctx.destination);
    s.start(now, Math.random() * 2, .16);
    if (isEnter) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, now); o.frequency.exponentialRampToValueAtTime(70, now + .1);
      const og = ctx.createGain(); og.gain.setValueAtTime(.18, now); og.gain.exponentialRampToValueAtTime(.0001, now + .12);
      o.connect(og).connect(ctx.destination); o.start(now); o.stop(now + .13);
    }
  }

  return {
    play, pause, go, levels, key,
    isPlaying: () => playing,
    name: () => TRACKS[idx].name,
    elapsed: () => acc + (playing && ctx ? ctx.currentTime - t0 : 0),
  };
})();
