/* Lueur — générateur PDF natif (polices TrueType embarquées, mise en page scénario standard) */
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

  /**
   * @param script  scénario Lueur
   * @param opts    { font, paper: 'letter'|'a4', lpp, lang, numbers }
   * @returns Promise<Uint8Array>
   */
  async function build(script, opts) {
    const [W, H] = PAPER[opts.paper] || PAPER.letter;
    const lpp = opts.lpp;
    const MORE = opts.lang === 'en' ? '(MORE)' : '(À SUIVRE)';
    const pag = Paginate.run(script.blocks, lpp, opts.lang);

    const objs = [];
    const alloc = () => { objs.push(null); return objs.length; };
    const set = (n, ...parts) => { objs[n - 1] = parts; };
    const stream = (dict, data) => [`<< ${dict} /Length ${data.length} >>\nstream\n`, data, '\nendstream'];

    // Polices
    let adv = 600, fR, fB;
    const base = FILES[opts.font];
    let loaded = null;
    if (base) {
      try {
        loaded = await Promise.all(['Regular', 'Bold'].map(st => fetchBytes(`assets/fonts/${base}-${st}.ttf`)));
      } catch (e) { loaded = null; }
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

    const SZ = 12, LH = 12, L = 108, TOP = 72, BODY = 432, U = 7.2;
    const CW = adv * SZ / 1000;
    const pagesN = alloc(), catalog = alloc(), info = alloc();
    const res = `<< /Font << /F1 ${fR} 0 R /F2 ${fB} 0 R >> >>`;
    const kids = [];
    const text = (x, y, s, bold) => `BT /F${bold ? 2 : 1} ${SZ} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${pdfStr(s)} Tj ET`;
    const baseline = row => H - TOP - row * LH - 9.5;
    const addPage = ops => {
      const data = enc.encode(ops.join('\n'));
      const c = alloc(), p = alloc();
      set(c, ...stream('', data));
      set(p, `<< /Type /Page /Parent ${pagesN} 0 R /MediaBox [0 0 ${W} ${H}] /Resources ${res} /Contents ${c} 0 R >>`);
      kids.push(p);
    };

    // Page de titre
    if (script.titlePage) {
      const m = script.meta || {}, ops = [];
      const center = (row, s, bold) => ops.push(text(L + BODY / 2 - s.length * CW / 2, baseline(row), s, bold));
      const title = String(script.title || '').toUpperCase();
      const tl = Paginate.wrap(title, 50);
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
      addPage(ops);
    }

    // Pages du scénario
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
        it.lines.forEach((ln, k) => {
          const x = it.t === 'transition' ? L + BODY - ln.length * CW : L + (Paginate.INDENT[it.t] || 0) * U;
          ops.push(text(x, baseline(row + k), ln, it.t === 'scene'));
        });
        row += it.lines.length;
        if (it.more) { ops.push(text(L + 22 * U, baseline(row), MORE)); row++; }
      }
      addPage(ops);
    });

    set(pagesN, `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);
    set(catalog, `<< /Type /Catalog /Pages ${pagesN} 0 R >>`);
    set(info, `<< /Title ${pdfStr(script.title || 'Sans titre')} /Creator (Lueur) /Producer (Lueur) >>`);

    // Sérialisation
    const chunks = [], offsets = [];
    let len = 0;
    const push = p => { const b = typeof p === 'string' ? enc.encode(p) : p; chunks.push(b); len += b.length; };
    push('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
    objs.forEach((parts, i) => { offsets[i] = len; push(`${i + 1} 0 obj\n`); parts.forEach(push); push('\nendobj\n'); });
    const xref = len;
    push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
    push(`trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len);
    let p = 0;
    for (const c of chunks) { out.set(c, p); p += c.length; }
    return out;
  }

  return { build, PAPER };
})();
