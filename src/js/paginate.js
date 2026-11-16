/* Lueur — pagination au format scénario standard (1 page ≈ 1 minute) */
const Paginate = (() => {
  'use strict';
  // Largeurs en caractères (police à chasse fixe, 10 caractères par pouce)
  const W = { scene: 60, action: 60, transition: 60, character: 38, paren: 26, dialogue: 35 };
  // Retrait depuis la marge gauche, en caractères
  const INDENT = { scene: 0, action: 0, transition: 0, character: 22, paren: 16, dialogue: 10 };
  const SB = { scene: 1, action: 1, transition: 1, character: 1, paren: 0, dialogue: 0 };
  const DLG = new Set(['character', 'paren', 'dialogue']);
  const UPPER = new Set(['scene', 'character', 'transition']);

  function wrap(text, width) {
    const out = [];
    for (const para of String(text).split('\n')) {
      if (!para.trim()) { out.push(''); continue; }
      let line = '';
      for (let w of para.split(/ +/)) {
        if (!w) continue;
        while (w.length > width) {
          if (line) { out.push(line); line = ''; }
          out.push(w.slice(0, width)); w = w.slice(width);
        }
        if (!w) continue;
        if (!line) line = w;
        else if (line.length + 1 + w.length <= width) line += ' ' + w;
        else { out.push(line); line = w; }
      }
      out.push(line);
    }
    return out.length ? out : [''];
  }

  /**
   * @returns {{pages: Array<Array<{i,t,lines,sb,off,more?}>>, startPage:number[], cost:number[], lpp:number}}
   */
  function run(blocks, lpp, lang) {
    const CONT = lang === 'en' ? " (CONT'D)" : ' (SUITE)';
    const pages = [[]];
    const startPage = new Array(blocks.length).fill(0);
    const cost = new Array(blocks.length).fill(0);
    const lines = blocks.map(b => wrap(UPPER.has(b.t) ? String(b.x).toUpperCase() : String(b.x), W[b.t] || 60));
    let used = 0, speaker = '';
    const br = () => { pages.push([]); used = 0; };
    const place = (it, i) => {
      pages[pages.length - 1].push(it);
      const n = it.sb + it.lines.length + (it.more ? 1 : 0);
      used += n; cost[i] += n;
    };

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i], L = lines[i];
      startPage[i] = pages.length - 1;
      if (!String(b.x).trim()) continue;
      if (b.t === 'character') speaker = Fountain.speaker(b.x);
      let sb = SB[b.t] ?? 1;
      if ((b.t === 'paren' || b.t === 'dialogue') && !(i > 0 && DLG.has(blocks[i - 1].t))) sb = 1;

      let keep = 0;
      const n = blocks[i + 1];
      if (n && String(n.x).trim() && (b.t === 'scene' || b.t === 'character' || (b.t === 'paren' && n.t === 'dialogue'))) {
        keep = (b.t === 'scene' ? (SB[n.t] ?? 1) : 0) + Math.min(2, lines[i + 1].length);
      }

      let rem = L, off = 0, first = true;
      while (rem.length) {
        const s = used === 0 ? 0 : sb;
        const room = lpp - used;
        const k = used === 0 ? 0 : keep;
        if (s + rem.length + k <= room) {
          if (first) startPage[i] = pages.length - 1;
          place({ i, t: b.t, lines: rem, sb: s, off }, i);
          break;
        }
        const isDlg = b.t === 'dialogue';
        const extra = isDlg ? 1 : 0;
        let fit = room - s - extra;
        const canSplit = (b.t === 'action' || isDlg) && rem.length >= 4 && fit >= 2;
        if (canSplit || used === 0) {
          fit = used === 0 ? Math.max(1, room - extra) : Math.min(fit, rem.length - 2);
          if (first) startPage[i] = pages.length - 1;
          place({ i, t: b.t, lines: rem.slice(0, fit), sb: s, off, more: isDlg }, i);
          rem = rem.slice(fit); off += fit; first = false; sb = 0;
          br();
          if (isDlg && speaker) place({ i, t: 'character', lines: [speaker + CONT], sb: 0, off, cont: true }, i);
          continue;
        }
        br();
      }
    }
    return { pages, startPage, cost, lpp };
  }

  function eighths(lines, lpp) {
    if (!lines) return '';
    const e = Math.max(1, Math.round(lines * 8 / lpp));
    const w = Math.floor(e / 8), f = e % 8;
    return (w ? String(w) : '') + (w && f ? ' ' : '') + (f ? f + '/8' : '');
  }

  /** Durée estimée (1 page ≈ 1 minute), à partir des lignes réellement occupées */
  function minutes(pag) {
    const lines = pag.cost.reduce((a, b) => a + b, 0);
    return lines ? Math.max(1, Math.round(lines / pag.lpp)) : 0;
  }
  function duration(pag) {
    const m = minutes(pag);
    if (!m) return '≈ 0 min';
    if (m < 60) return `≈ ${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return `≈ ${h} h${r ? ' ' + String(r).padStart(2, '0') : ''}`;
  }

  return { run, wrap, eighths, minutes, duration, INDENT, W };
})();
