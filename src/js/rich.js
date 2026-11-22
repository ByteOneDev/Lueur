/* Lueur — mise en forme légère (Markdown / Fountain)
   **gras**  *italique*  ***gras italique***  _souligné_  ~~barré~~
   Le texte reste du texte brut : les marques sont conservées telles quelles (compatibles Fountain et Markdown).
   Ce module sait les afficher (HTML), les retirer (texte brut), les découper en lignes pour le PDF
   et ajouter / retirer une mise en forme sur une sélection. */
const Rich = (() => {
  'use strict';
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const RX = /\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*|\*\*(?=\S)(.+?)(?<=\S)\*\*|~~(?=\S)(.+?)(?<=\S)~~|\*(?=[^\s*])(.+?)(?<=[^\s*])\*|_(?=[^\s_])(.+?)(?<=[^\s_])_/gu;
  const KINDS = [null, ['b', 'i'], ['b'], ['s'], ['i'], ['u']];
  const MK = [0, 3, 2, 2, 1, 1];
  const has = s => /[*_~]/.test(String(s || ''));

  /** Arbre : chaînes de texte et nœuds { k: ['b'…], mk: '**', c: [...] } */
  function tree(s) {
    const out = [], rx = new RegExp(RX.source, 'gu');
    let last = 0, m;
    while ((m = rx.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index));
      const g = [1, 2, 3, 4, 5].find(i => m[i] !== undefined);
      out.push({ k: KINDS[g], mk: m[0].slice(0, MK[g]), c: tree(m[g]) });
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  }
  const htmlOf = nodes => nodes.map(n => typeof n === 'string' ? esc(n)
    : `<span class="mk">${esc(n.mk)}</span><span class="${n.k.map(k => 'r-' + k).join(' ')}">${htmlOf(n.c)}</span><span class="mk">${esc(n.mk)}</span>`).join('');
  const plainOf = nodes => nodes.map(n => typeof n === 'string' ? n : plainOf(n.c)).join('');
  /** Caractères bruts avec leurs styles : { ch, f: {b,i,u,s}, mk } */
  function charsOf(nodes, f = {}, out = []) {
    for (const n of nodes) {
      if (typeof n === 'string') { for (let k = 0; k < n.length; k++) out.push({ ch: n[k], f, mk: false }); continue; }
      const g = Object.assign({}, f);
      n.k.forEach(k => { g[k] = true; });
      for (let k = 0; k < n.mk.length; k++) out.push({ ch: n.mk[k], f, mk: true });
      charsOf(n.c, g, out);
      for (let k = 0; k < n.mk.length; k++) out.push({ ch: n.mk[k], f, mk: true });
    }
    return out;
  }

  /** Une ligne (sans \n) → HTML avec marques visibles (.mk) */
  const inline = s => (has(s) ? htmlOf(tree(String(s))) : esc(String(s || '')));
  const plain = s => (has(s) ? String(s).split('\n').map(l => plainOf(tree(l))).join('\n') : String(s || ''));

  /* ───────── Markdown multi-lignes (sections de bible) ───────── */
  const PREFIX = /^(#{1,3}\s+|\s*(?:[-*•+]|\d+[.)])\s+|>\s?)/;
  function lineHTML(l) {
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) return `<span class="md-hr">${esc(l)}</span>`;
    const p = PREFIX.exec(l);
    if (!p) return inline(l);
    const pre = p[1], rest = l.slice(pre.length);
    if (pre[0] === '#') return `<span class="md-h md-h${pre.trim().length}"><span class="mk">${esc(pre)}</span>${inline(rest)}</span>`;
    if (pre[0] === '>') return `<span class="md-q"><span class="mk">${esc(pre)}</span>${inline(rest)}</span>`;
    return `<span class="md-li"><span class="mk-li">${esc(pre)}</span>${inline(rest)}</span>`;
  }
  /** Texte multi-lignes → HTML (le \n final reçoit un <br> pour rester visible) */
  function md(text) {
    const s = String(text || '');
    if (!s) return '';
    return s.split('\n').map(lineHTML).join('\n') + (s.endsWith('\n') ? '<br class="tl">' : '');
  }

  /* ───────── Texte & curseur dans un élément éditable (multi-lignes) ───────── */
  function textIn(node) {
    let s = '';
    const walk = n => {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) s += c.data;
        else if (c.nodeName === 'BR') { if (!c.classList || !c.classList.contains('tl')) s += '\n'; }
        else if (c.nodeType === 1) {
          const blk = c.nodeName === 'DIV' || c.nodeName === 'P';
          if (blk && s && !s.endsWith('\n')) s += '\n';
          walk(c);
        } else if (c.nodeType === 11) walk(c);
      }
    };
    walk(node);
    return s.replace(/ /g, ' ');
  }
  function offsetOf(el, node, off) {
    const r = document.createRange();
    r.setStart(el, 0);
    try { r.setEnd(node, off); } catch (e) { return 0; }
    return textIn(r.cloneContents()).length;
  }
  function getSel(el) {
    const s = document.getSelection();
    if (!s || !s.rangeCount) return null;
    const r = s.getRangeAt(0);
    if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
    const a = offsetOf(el, r.startContainer, r.startOffset);
    return { a, z: r.collapsed ? a : offsetOf(el, r.endContainer, r.endOffset) };
  }
  function pointAt(el, o) {
    let rem = o, found = null;
    const walk = n => {
      for (let c = n.firstChild; c && !found; c = c.nextSibling) {
        if (c.nodeType === 3) {
          if (rem <= c.length) { found = [c, rem]; return; }
          rem -= c.length;
        } else if (c.nodeName === 'BR') {
          if (c.classList && c.classList.contains('tl')) continue;
          if (rem === 0) { found = [n, [...n.childNodes].indexOf(c)]; return; }
          rem -= 1;
        } else if (c.nodeType === 1) walk(c);
      }
    };
    walk(el);
    return found || [el, el.childNodes.length];
  }
  function setSel(el, a, z = a) {
    const s = document.getSelection(), r = document.createRange();
    const p = pointAt(el, a), q = z === a ? p : pointAt(el, z);
    r.setStart(p[0], p[1]); r.setEnd(q[0], q[1]);
    s.removeAllRanges(); s.addRange(r);
  }

  /* ───────── Ajouter / retirer une mise en forme ───────── */
  /** Réécrit une ligne à partir de ses caractères stylés */
  function serialize(chars) {
    let out = '';
    const map = []; // index brut de chaque caractère visible
    let i = 0;
    const same = (a, b) => !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u && !!a.s === !!b.s;
    const any = f => f.b || f.i || f.u || f.s;
    while (i < chars.length) {
      let j = i;
      while (j < chars.length && same(chars[j].f, chars[i].f)) j++;
      const run = chars.slice(i, j), f = chars[i].f;
      if (!any(f) || !run.some(c => c.ch.trim())) {
        run.forEach(c => { map.push(out.length); out += c.ch; });
      } else {
        let a = 0, z = run.length;
        while (!run[a].ch.trim()) a++;
        while (!run[z - 1].ch.trim()) z--;
        for (let k = 0; k < a; k++) { map.push(out.length); out += run[k].ch; }
        const em = f.b && f.i ? '***' : f.b ? '**' : f.i ? '*' : '';
        const open = (f.s ? '~~' : '') + (f.u ? '_' : '') + em, close = em + (f.u ? '_' : '') + (f.s ? '~~' : '');
        out += open;
        for (let k = a; k < z; k++) { map.push(out.length); out += run[k].ch; }
        out += close;
        for (let k = z; k < run.length; k++) { map.push(out.length); out += run[k].ch; }
      }
      i = j;
    }
    map.push(out.length);
    return { out, map };
  }
  /** Applique `kind` (b, i, u, s) aux caractères [a, z) d'une ligne ; `on` = ajouter */
  function applyLine(line, a, z, kind, on) {
    const all = charsOf(tree(line));
    const vis = [];
    let pa = -1, pz = 0;
    all.forEach((c, raw) => {
      if (c.mk) return;
      if (raw >= a && pa < 0) pa = vis.length;
      if (raw < z) pz = vis.length + 1;
      vis.push({ ch: c.ch, f: c.f });
    });
    if (pa < 0) pa = vis.length;
    pz = Math.max(pa, pz);
    for (let k = pa; k < pz; k++) vis[k] = { ch: vis[k].ch, f: Object.assign({}, vis[k].f, { [kind]: on }) };
    const { out, map } = serialize(vis);
    return { line: out, a: map[pa], z: pz > pa ? map[pz - 1] + 1 : map[pa] };
  }
  /** Les caractères visibles non blancs de [a, z) ont-ils tous `kind` ? */
  function isOn(line, a, z, kind) {
    const all = charsOf(tree(line));
    let seen = false;
    for (let raw = a; raw < Math.min(z, all.length); raw++) {
      const c = all[raw];
      if (c.mk || !c.ch.trim()) continue;
      seen = true;
      if (!c.f[kind]) return false;
    }
    return seen;
  }
  /** Bascule une mise en forme sur la sélection [a, z) d'un texte (une ou plusieurs lignes) */
  function toggle(text, a, z, kind, md = true) {
    const lines = String(text).split('\n');
    const segs = [];
    let pos = 0;
    lines.forEach((l, i) => {
      const start = pos, end = pos + l.length;
      pos = end + 1;
      const s = Math.max(a, start), e = Math.min(z, end);
      if (e <= s) return;
      const p = md ? PREFIX.exec(l) : null, pre = p ? p[1].length : 0;
      const ls = Math.max(s - start, pre), le = e - start;
      if (le > ls && l.slice(ls, le).trim()) segs.push({ i, ls, le });
    });
    if (!segs.length) return null;
    const on = !segs.every(g => isOn(lines[g.i], g.ls, g.le, kind));
    let na = null, nz = null;
    for (const g of segs) {
      const r = applyLine(lines[g.i], g.ls, g.le, kind, on);
      lines[g.i] = r.line;
      g.ra = r.a; g.rz = r.z;
    }
    const offs = [];
    pos = 0;
    lines.forEach(l => { offs.push(pos); pos += l.length + 1; });
    na = offs[segs[0].i] + segs[0].ra;
    const L = segs[segs.length - 1];
    nz = offs[L.i] + L.rz;
    return { text: lines.join('\n'), a: na, z: nz, on };
  }
  /** Styles actifs au début d'une sélection (pour allumer les boutons) */
  function stateAt(text, a, z, md = true) {
    const out = {};
    const lines = String(text).split('\n');
    let pos = 0;
    for (const l of lines) {
      const end = pos + l.length;
      if (a <= end) {
        const p = md ? PREFIX.exec(l) : null, s = Math.max(a - pos, p ? p[1].length : 0);
        for (const k of ['b', 'i', 'u', 's']) out[k] = isOn(l, s, Math.max(s + 1, Math.min(z, end) - pos), k);
        break;
      }
      pos = end + 1;
    }
    return out;
  }
  /** Préfixe de ligne Markdown : titre, liste, citation (bascule) */
  function linePrefix(text, a, z, kind) {
    const lines = String(text).split('\n');
    let pos = 0, first = -1, last = -1;
    lines.forEach((l, i) => { const e = pos + l.length; if (e >= a && pos <= z) { if (first < 0) first = i; last = i; } pos = e + 1; });
    if (first < 0) return null;
    const want = { h: '## ', li: '- ', q: '> ' }[kind];
    const test = { h: /^#{1,3}\s+/, li: /^\s*(?:[-*•+]|\d+[.)])\s+/, q: /^>\s?/ }[kind];
    const allOn = lines.slice(first, last + 1).every(l => test.test(l));
    let da = 0, dz = 0;
    for (let i = first; i <= last; i++) {
      const old = lines[i], p = PREFIX.exec(old), body = p ? old.slice(p[1].length) : old;
      const next = allOn ? body : want + body;
      const d = next.length - old.length;
      if (i === first) da = d;
      dz += d;
      lines[i] = next;
    }
    return { text: lines.join('\n'), a: Math.max(0, a + da), z: Math.max(0, z + dz) };
  }

  /* ───────── PDF : découpage en lignes en gardant les styles ───────── */
  /** Même découpage que Paginate.wrap, mais chaque ligne = [{ s, f }] */
  function wrap(text, width, upper) {
    const out = [];
    for (const raw of String(text || '').split('\n')) {
      let chars = charsOf(tree(raw)).filter(c => !c.mk);
      if (upper) chars = chars.flatMap(c => c.ch.toUpperCase().split('').map(ch => ({ ch, f: c.f })));
      const words = [];
      let cur = null;
      chars.forEach(c => {
        if (c.ch === ' ') { cur = null; return; }
        if (!cur) { cur = []; words.push(cur); }
        cur.push(c);
      });
      if (!words.length) { out.push([]); continue; }
      let line = [];
      const flush = () => { out.push(line); line = []; };
      for (let w of words) {
        while (w.length > width) {
          if (line.length) flush();
          line = w.slice(0, width); flush(); w = w.slice(width);
        }
        if (!w.length) continue;
        if (!line.length) line = w.slice();
        else if (line.length + 1 + w.length <= width) {
          const p = line[line.length - 1].f, n = w[0].f;
          line.push({ ch: ' ', f: { u: p.u && n.u, s: p.s && n.s } }, ...w);
        } else { flush(); line = w.slice(); }
      }
      flush();
    }
    return (out.length ? out : [[]]).map(line => {
      const segs = [];
      for (const c of line) {
        const l = segs[segs.length - 1];
        if (l && !!l.f.b === !!c.f.b && !!l.f.i === !!c.f.i && !!l.f.u === !!c.f.u && !!l.f.s === !!c.f.s) l.s += c.ch;
        else segs.push({ s: c.ch, f: c.f });
      }
      return segs;
    });
  }
  const lineText = segs => segs.map(g => g.s).join('');

  /** Markdown : le souligné n'existe pas, on le traduit en <u> */
  function toMarkdown(text) {
    if (!has(text)) return String(text || '');
    return String(text).split('\n').map(l => {
      const p = PREFIX.exec(l), pre = p ? p[1] : '';
      const walk = nodes => nodes.map(n => {
        if (typeof n === 'string') return n;
        const inner = walk(n.c);
        if (n.k[0] === 'u') return `<u>${inner}</u>`;
        return n.mk + inner + n.mk;
      }).join('');
      return pre + walk(tree(l.slice(pre.length)));
    }).join('\n');
  }

  return { has, inline, plain, md, textIn, getSel, setSel, toggle, stateAt, linePrefix, wrap, lineText, toMarkdown };
})();
