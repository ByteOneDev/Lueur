/* Lueur — générateur PDF natif : scénarios (format standard) et bibles (texte, images, palettes) */
const PDF = (() => {
  'use strict';
  const FILES = { 'JetBrains Mono': 'JetBrainsMono', 'Courier Prime': 'CourierPrime', 'IBM Plex Mono': 'IBMPlexMono', 'Space Mono': 'SpaceMono' };
  const PAPER = { letter: [612, 792], a4: [595.28, 841.89] };
  const enc = new TextEncoder();
  // Unicode → WinAnsiEncoding (plage 0x80–0x9F)
  const WIN = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
    0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
    0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
    0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F,
  };

  function pdfStr(s) {
    let out = '(';
    for (const ch of String(s)) {
      let c = ch.codePointAt(0);
      if (c === 0xA0 || c === 0x202F || c === 0x2009 || c === 0x2007) c = 32;
      else if (c > 255 || (c >= 128 && c < 160)) c = WIN[c] || 63;
      if (c === 40 || c === 41 || c === 92) out += '\\' + String.fromCharCode(c);
      else if (c < 32 || c > 126) out += '\\' + c.toString(8).padStart(3, '0');
      else out += String.fromCharCode(c);
    }
    return out + ')';
  }

  function ttfInfo(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = dv.getUint16(4), T = {};
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      T[String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3])] = dv.getUint32(o + 8);
    }
    const k = 1000 / dv.getUint16(T.head + 18);
    const bbox = [36, 38, 40, 42].map(o => Math.round(dv.getInt16(T.head + o) * k));
    const asc = dv.getInt16(T.hhea + 4) * k, desc = dv.getInt16(T.hhea + 6) * k;
    const nh = dv.getUint16(T.hhea + 34), counts = {};
    for (let i = 0; i < Math.min(nh, 300); i++) { const a = dv.getUint16(T.hmtx + i * 4); if (a) counts[a] = (counts[a] || 0) + 1; }
    const adv = +Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] * k;
    let cap = asc * .7;
    if (T['OS/2'] && dv.getUint16(T['OS/2']) >= 2) cap = dv.getInt16(T['OS/2'] + 88) * k;
    return { adv, asc, desc, bbox, cap };
  }

  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    } catch (e) { return null; }
  }

  async function fetchBytes(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('font ' + url);
    return new Uint8Array(await r.arrayBuffer());
  }

  function jpegInfo(b) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) { i++; continue; }
      const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], c: b[i + 9] };
      }
      i += 2 + len;
    }
    return null;
  }

  /** Document PDF : polices embarquées, pages, images JPEG, sérialisation */
  async function createDoc(font, paper) {
    const [W, H] = PAPER[paper] || PAPER.letter;
    const objs = [];
    const alloc = () => { objs.push(null); return objs.length; };
    const set = (n, ...parts) => { objs[n - 1] = parts; };
    const stream = (dict, data) => [`<< ${dict} /Length ${data.length} >>\nstream\n`, data, '\nendstream'];

    let adv = 600, fR, fB, loaded = null;
    const base = FILES[font];
    if (base) {
      try { loaded = await Promise.all(['Regular', 'Bold'].map(st => fetchBytes(`assets/fonts/${base}-${st}.ttf`))); }
      catch (e) { loaded = null; }
    }
    if (loaded) {
      const ids = [];
      for (const [k, style] of ['Regular', 'Bold'].entries()) {
        const bytes = loaded[k], info = ttfInfo(bytes);
        if (k === 0) adv = info.adv;
        const ff = alloc(), fd = alloc(), f = alloc();
        const z = await deflate(bytes);
        set(ff, ...(z ? stream(`/Filter /FlateDecode /Length1 ${bytes.length}`, z) : stream(`/Length1 ${bytes.length}`, bytes)));
        const name = `${base}-${style}`;
        set(fd, `<< /Type /FontDescriptor /FontName /${name} /Flags 33 /FontBBox [${info.bbox.join(' ')}] /ItalicAngle 0 ` +
          `/Ascent ${Math.round(info.asc)} /Descent ${Math.round(info.desc)} /CapHeight ${Math.round(info.cap)} /StemV ${k ? 120 : 80} /FontFile2 ${ff} 0 R >>`);
        set(f, `<< /Type /Font /Subtype /TrueType /BaseFont /${name} /FirstChar 32 /LastChar 255 ` +
          `/Widths [${new Array(224).fill(Math.round(info.adv)).join(' ')}] /FontDescriptor ${fd} 0 R /Encoding /WinAnsiEncoding >>`);
        ids.push(f);
      }
      [fR, fB] = ids;
    } else {
      fR = alloc(); set(fR, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
      fB = alloc(); set(fB, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');
    }

    const resN = alloc(), pagesN = alloc(), catalog = alloc(), infoN = alloc();
    const kids = [], xobj = {};
    let imgN = 0;

    return {
      W, H, adv,
      cw: size => adv * size / 1000,
      text: (x, y, s, bold, size = 12) => `BT /F${bold ? 2 : 1} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${pdfStr(s)} Tj ET`,
      /** Ligne mise en forme : [{ s, f: {b,i,u,s} }] — italique incliné, souligné et barré tracés */
      rich(x, y, segs, size = 12, bold = false) {
        const cw = adv * size / 1000, out = [];
        let cx = x;
        for (const g of segs) {
          const w = g.s.length * cw;
          if (g.s.trim()) out.push(`BT /F${bold || g.f.b ? 2 : 1} ${size} Tf ${g.f.i ? '1 0 0.21 1' : '1 0 0 1'} ${cx.toFixed(2)} ${y.toFixed(2)} Tm ${pdfStr(g.s)} Tj ET`);
          if (g.f.u) out.push(`${cx.toFixed(2)} ${(y - size * .15).toFixed(2)} ${w.toFixed(2)} ${(size * .05).toFixed(2)} re f`);
          if (g.f.s) out.push(`${cx.toFixed(2)} ${(y + size * .28).toFixed(2)} ${w.toFixed(2)} ${(size * .05).toFixed(2)} re f`);
          cx += w;
        }
        return out.join('\n');
      },
      addPage(ops) {
        const data = enc.encode(ops.join('\n'));
        const c = alloc(), p = alloc();
        set(c, ...stream('', data));
        set(p, `<< /Type /Page /Parent ${pagesN} 0 R /MediaBox [0 0 ${W} ${H}] /Resources ${resN} 0 R /Contents ${c} 0 R >>`);
        kids.push(p);
      },
      addJpeg(bytes) {
        const info = jpegInfo(bytes);
        if (!info) return null;
        const cs = info.c === 1 ? '/DeviceGray' : info.c === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB';
        const n = alloc();
        set(n, ...stream(`/Type /XObject /Subtype /Image /Width ${info.w} /Height ${info.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode`, bytes));
        const name = 'Im' + (++imgN);
        xobj[name] = n;
        return { name, w: info.w, h: info.h };
      },
      pageCount: () => kids.length,
      finish(title) {
        const xo = Object.entries(xobj).map(([k, v]) => `/${k} ${v} 0 R`).join(' ');
        set(resN, `<< /Font << /F1 ${fR} 0 R /F2 ${fB} 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >>`);
        set(pagesN, `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);
        set(catalog, `<< /Type /Catalog /Pages ${pagesN} 0 R >>`);
        set(infoN, `<< /Title ${pdfStr(title || 'Sans titre')} /Creator (Lueur) /Producer (Lueur) >>`);
        const chunks = [], offsets = [];
        let len = 0;
        const push = p => { const b = typeof p === 'string' ? enc.encode(p) : p; chunks.push(b); len += b.length; };
        push('%PDF-1.4\n');
        push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
        objs.forEach((parts, i) => { offsets[i] = len; push(`${i + 1} 0 obj\n`); parts.forEach(push); push('\nendobj\n'); });
        const xref = len;
        push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
        push(`trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${infoN} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
        const out = new Uint8Array(len);
        let p = 0;
        for (const c of chunks) { out.set(c, p); p += c.length; }
        return out;
      },
    };
  }

  /* ───────── Scénario ───────── */
  /**
   * @param script  scénario Lueur
   * @param opts    { font, paper: 'letter'|'a4', lpp, lang, numbers }
   */
  async function build(script, opts) {
    const doc = await createDoc(opts.font, opts.paper);
    const { W, H } = doc;
    const lpp = opts.lpp;
    const MORE = opts.lang === 'en' ? '(MORE)' : '(À SUIVRE)';
    const pag = Paginate.run(script.blocks, lpp, opts.lang);
    const L = 108, TOP = 72, BODY = 432, U = 7.2, CW = doc.cw(12);
    const text = (x, y, s, bold) => doc.text(x, y, s, bold, 12);
    const baseline = row => H - TOP - row * 12 - 9.5;

    if (script.titlePage) {
      const m = script.meta || {}, ops = [];
      const center = (row, s, bold) => ops.push(text(L + BODY / 2 - s.length * CW / 2, baseline(row), s, bold));
      const tl = Paginate.wrap(String(script.title || '').toUpperCase(), 50);
      tl.forEach((ln, k) => center(18 + k, ln, true));
      let row = 18 + tl.length + 1;
      const info = [m.format, m.genre, Paginate.duration(pag)].filter(Boolean).join(' · ');
      if (info) { center(row, info); row += 1; }
      row += 3;
      if (m.credit) { center(row, m.credit); row += 2; }
      if (m.author) String(m.author).split('\n').forEach((ln, k) => center(row + k, ln));
      const contact = String(m.contact || '').split('\n').filter(Boolean);
      contact.forEach((ln, k) => ops.push(text(L, baseline(lpp - contact.length + k), ln)));
      const date = String(m.date || '').split('\n').filter(Boolean);
      date.forEach((ln, k) => ops.push(text(L + BODY - ln.length * CW, baseline(lpp - date.length + k), ln)));
      doc.addPage(ops);
    }

    // Lignes mises en forme (gras, italique, souligné, barré), découpées exactement comme la pagination
    const UP = new Set(['scene', 'character', 'transition']);
    const rl = script.blocks.map(b => (Rich.has(b.x) ? Rich.wrap(b.x, Paginate.W[b.t] || 60, UP.has(b.t)) : null));
    let sceneN = 0;
    pag.pages.forEach((pg, pi) => {
      const ops = [];
      if (pi > 0) { const s = `${pi + 1}.`; ops.push(text(L + BODY - s.length * CW, H - 36 - 9.5, s)); }
      let row = 0;
      for (const it of pg) {
        row += it.sb;
        if (it.t === 'scene' && !it.off && !it.cont) {
          sceneN++;
          if (opts.numbers) {
            const s = String(sceneN);
            ops.push(text(L - 22 - s.length * CW, baseline(row), s));
            ops.push(text(L + BODY + 22, baseline(row), s));
          }
        }
        const rich = !it.cont && rl[it.i] ? rl[it.i].slice(it.off, it.off + it.lines.length) : null;
        it.lines.forEach((ln, k) => {
          const x = it.t === 'transition' ? L + BODY - ln.length * CW : L + (Paginate.INDENT[it.t] || 0) * U;
          if (rich && rich[k] && Rich.lineText(rich[k]) === ln) ops.push(doc.rich(x, baseline(row + k), rich[k], 12, it.t === 'scene'));
          else ops.push(text(x, baseline(row + k), ln, it.t === 'scene'));
        });
        row += it.lines.length;
        if (it.more) { ops.push(text(L + 22 * U, baseline(row), MORE)); row++; }
      }
      doc.addPage(ops);
    });
    return doc.finish(script.title);
  }

  /* ───────── Bible littéraire & graphique ───────── */
  const hexRgb = h => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(h || ''));
    const n = m ? parseInt(m[1], 16) : 0x888888;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => (v / 255).toFixed(3)).join(' ');
  };
  const plain = s => Rich.plain(s);

  /**
   * @param bible  bible Lueur
   * @param opts   { font, paper, images: id → Uint8Array (JPEG) }
   */
  async function buildBible(bible, opts) {
    const doc = await createDoc(opts.font, opts.paper);
    const { W, H } = doc;
    const M = 72, CW = W - 2 * M;
    const INK = '0.13 0.12 0.11 rg', MUTED = '0.48 0.46 0.43 rg', FAINT = '0.80 0.78 0.75 RG';
    let ops = [], y = H - M, page = 0;
    const flush = () => {
      if (!ops.length) return;
      page++;
      if (page > 1) { const s = String(page); ops.push(MUTED, doc.text(W / 2 - s.length * doc.cw(9) / 2, 40, s, false, 9)); }
      doc.addPage(ops); ops = []; y = H - M;
    };
    const ensure = h => { if (y - h < M) flush(); };
    const chars = size => Math.max(10, Math.floor(CW / doc.cw(size)));
    const para = (s, { size = 10.5, lead = 15, bold = false, color = INK, x = M, width = CW } = {}) => {
      const lines = Rich.wrap(s, Math.max(8, Math.floor(width / doc.cw(size))));
      for (const ln of lines) { ensure(lead); y -= lead; if (ln.length) ops.push(color, doc.rich(x, y + 3, ln, size, bold)); }
    };
    const imgs = {};
    const image = id => {
      if (!id || !opts.images[id]) return null;
      if (!(id in imgs)) imgs[id] = doc.addJpeg(opts.images[id]);
      return imgs[id];
    };
    const draw = (im, x, yb, w, h) => ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${yb.toFixed(2)} cm /${im.name} Do Q`);

    // Couverture
    const m = bible.meta || {};
    const title = String(bible.title || 'Sans titre');
    let cy = H * .58;
    Paginate.wrap(title.toUpperCase(), Math.floor(CW / doc.cw(24))).forEach(ln => {
      ops.push(INK, doc.text(W / 2 - ln.length * doc.cw(24) / 2, cy, ln, true, 24)); cy -= 32;
    });
    const info = [m.format, m.genre].filter(Boolean).join(' · ');
    if (info) { ops.push(MUTED, doc.text(W / 2 - info.length * doc.cw(11) / 2, cy - 4, info, false, 11)); cy -= 24; }
    ops.push(FAINT, `0.6 w ${W / 2 - 40} ${cy - 6} m ${W / 2 + 40} ${cy - 6} l S`);
    const by = [m.credit, m.author].filter(Boolean).join(' ');
    if (m.author) ops.push(INK, doc.text(W / 2 - by.length * doc.cw(11) / 2, cy - 34, by, false, 11));
    flush();

    for (const sec of bible.sections) {
      const empty = sec.kind === 'text' ? !String(sec.body || '').trim() : !(sec.items || []).length;
      if (empty) continue;
      ensure(80);
      if (y < H - M - 1) { y -= 18; }
      y -= 20;
      ops.push(INK, doc.text(M, y, String(sec.title || ''), true, 17));
      y -= 10;
      ops.push(FAINT, `0.6 w ${M} ${y} m ${M + CW} ${y} l S`);
      y -= 8;

      if (sec.kind === 'text') {
        for (const raw of String(sec.body || '').split('\n')) {
          const line = raw.trimEnd();
          if (!line.trim()) { y -= 7; continue; }
          if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { ensure(16); y -= 8; ops.push(FAINT, `0.6 w ${M} ${y} m ${M + CW} ${y} l S`); y -= 8; continue; }
          const q = /^>\s?(.*)$/.exec(line);
          if (q) {
            const y0 = y, p0 = page;
            para(q[1], { x: M + 16, width: CW - 16, color: MUTED });
            if (page === p0) ops.push(FAINT, `1.2 w ${M + 4} ${y0 - 3} m ${M + 4} ${y + 1} l S`);
            continue;
          }
          const h = /^#{1,3}\s+(.*)$/.exec(line);
          if (h) { y -= 6; para(h[1], { size: 12, lead: 17, bold: true }); continue; }
          const li = /^\s*[-•*]\s+(.*)$/.exec(line);
          if (li) {
            ensure(15);
            ops.push(MUTED, doc.text(M + 4, y - 12, '•', false, 10.5));
            para(li[1], { x: M + 18, width: CW - 18 });
            continue;
          }
          para(line);
        }
      } else if (sec.kind === 'characters') {
        for (const it of sec.items) {
          const im = sec.photos === false ? null : image(it.img);
          const iw = im ? 120 : 0, ih = im ? Math.min(170, iw * im.h / im.w) : 0;
          const tx = M + (im ? iw + 22 : 0), tw = CW - (im ? iw + 22 : 0);
          const nLines = Paginate.wrap(plain(it.desc || ''), Math.floor(tw / doc.cw(10.5))).length;
          const th = 22 + (it.role ? 16 : 0) + nLines * 15;
          ensure(Math.max(ih, th) + 12);
          const top = y - 6;
          if (im) draw(im, M, top - ih, iw, ih);
          y = top - 15;
          ops.push(INK, doc.text(tx, y, String(it.name || 'Sans nom'), true, 13));
          if (it.role) { y -= 16; ops.push(MUTED, doc.text(tx, y, String(it.role), false, 10)); }
          y -= 4;
          para(it.desc || '', { x: tx, width: tw });
          y = Math.min(y, top - ih) - 22;
        }
      } else if (sec.kind === 'gallery') {
        const gap = 18, colW = (CW - gap) / 2;
        for (let i = 0; i < sec.items.length; i += 2) {
          const row = sec.items.slice(i, i + 2).map(it => {
            const im = image(it.img);
            if (!im) return null;
            let w = colW, h = w * im.h / im.w;
            if (h > 250) { h = 250; w = h * im.w / im.h; }
            const cap = Paginate.wrap(plain(it.caption || ''), Math.floor(colW / doc.cw(9))).filter(Boolean);
            return { im, w, h, cap };
          });
          const rh = Math.max(...row.map(r => (r ? r.h + 8 + r.cap.length * 12 : 0)));
          if (!rh) continue;
          ensure(rh + 8);
          row.forEach((r, k) => {
            if (!r) return;
            const x = M + k * (colW + gap);
            draw(r.im, x, y - 6 - r.h, r.w, r.h);
            r.cap.forEach((ln, j) => ops.push(MUTED, doc.text(x, y - 6 - r.h - 14 - j * 12, ln, false, 9)));
          });
          y -= rh + 20;
        }
      } else if (sec.kind === 'palette') {
        const per = 4, gap = 14, sw = (CW - gap * (per - 1)) / per, sh = 64;
        for (let i = 0; i < sec.items.length; i += per) {
          ensure(sh + 44);
          sec.items.slice(i, i + per).forEach((it, k) => {
            const x = M + k * (sw + gap);
            ops.push(`${hexRgb(it.color)} rg ${x.toFixed(2)} ${(y - 6 - sh).toFixed(2)} ${sw.toFixed(2)} ${sh} re f`);
            ops.push(INK, doc.text(x, y - 6 - sh - 15, String(it.name || '').slice(0, Math.floor(sw / doc.cw(10))), true, 10));
            ops.push(MUTED, doc.text(x, y - 6 - sh - 28, String(it.color || '').toUpperCase(), false, 9));
          });
          y -= sh + 52;
        }
      }
    }
    flush();
    return doc.finish(title);
  }

  return { build, buildBible, PAPER };
})();
