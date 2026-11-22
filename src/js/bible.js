/* Lueur — éditeur de bible littéraire & graphique
   Une bible = une suite de sections : texte, personnages (fiches avec image), galerie d’images, palette de couleurs. */
const Bible = (() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KIND = { text: 'Texte', characters: 'Personnages', gallery: 'Images', palette: 'Palette' };
  const FORMATS = ['Série', 'Mini-série', 'Long métrage', 'Court métrage', 'Animation', 'Jeu vidéo', 'Bande dessinée', 'Roman'];
  const SWATCHES = ['#C0705A', '#E8B76B', '#7E9A72', '#5E7F95', '#4A3F5C', '#2A2825', '#D9CBB4', '#9A6F95'];

  let doc = null, H = {}, root = null, nav = null;

  /* ───────── Rendu ───────── */
  function itemsHTML(s) {
    const del = id => `<button class="bdel" data-delitem="${id}" title="Supprimer">×</button>`;
    const img = (it, cls) => `<div class="bimg ${cls}${it.img ? '' : ' empty'}" data-pick="${it.id}" title="Cliquez ou glissez une image">` +
      `${it.img ? `<img data-img="${esc(it.img)}" alt="">` : '<span>+ Image</span>'}</div>`;
    const ce = (f, v, ph, cls = '') => `<div class="${cls}" contenteditable="plaintext-only" data-if="${f}" data-ph="${esc(ph)}">${esc(v || '')}</div>`;
    const md = (f, v, ph, cls = '') => `<div class="${cls} md" contenteditable="plaintext-only" data-if="${f}" data-ph="${esc(ph)}">${Rich.md(v)}</div>`;
    if (s.kind === 'characters') {
      const photos = s.photos !== false;
      const portrait = it => !photos ? '' : it.img
        ? `<div class="bimg portrait" data-pick="${it.id}" title="Cliquez ou glissez une image pour la remplacer"><img data-img="${esc(it.img)}" alt=""><button class="bimg-x" data-noimg="${it.id}" title="Retirer l’image">×</button></div>`
        : img(it, 'portrait');
      return `<div class="bchars${photos ? '' : ' nophoto'}">${s.items.map(it => `
        <div class="bchar" data-item="${it.id}">
          ${portrait(it)}
          <div class="bchar-t">
            ${ce('name', it.name, 'Nom', 'bchar-name')}
            ${ce('role', it.role, 'Rôle · âge', 'bchar-role')}
            ${md('desc', it.desc, 'Caractère, désir, peur, arc…', 'bchar-desc')}
          </div>${del(it.id)}
        </div>`).join('')}</div>
        <button class="badd-item" data-additem>+ Personnage</button>`;
    }
    if (s.kind === 'gallery') {
      return `<div class="bgal">${s.items.map(it => `
        <figure class="bfig" data-item="${it.id}">${img(it, 'free')}${ce('caption', it.caption, 'Légende', 'bcap')}${del(it.id)}</figure>`).join('')}</div>
        <button class="bdrop" data-addimgs>${s.items.length ? '+ Ajouter des images' : esc(s.hint || 'Glissez des images ici') + '<br><small>ou cliquez pour choisir</small>'}</button>`;
    }
    if (s.kind === 'palette') {
      return `<div class="bpal">${s.items.map(it => `
        <div class="bsw" data-item="${it.id}">
          <label class="bsw-c" style="background:${esc(it.color)}"><input type="color" value="${esc(it.color)}" data-color="${it.id}"></label>
          ${ce('name', it.name, 'Nom', 'bsw-n')}<small>${esc(String(it.color).toUpperCase())}</small>${del(it.id)}
        </div>`).join('')}
        <button class="bsw-add" data-additem title="Ajouter une couleur">+</button></div>`;
    }
    return `<div class="btext md" contenteditable="plaintext-only" data-f="body" data-ph="${esc(s.hint || 'Écrivez ici…')}">${Rich.md(s.body)}</div>`;
  }
  function sectionHTML(s, i) {
    return `<section class="bsec k-${s.kind}" id="sec-${s.id}" data-id="${s.id}">
      <div class="bsec-h">
        <span class="bsec-n">${i + 1}</span>
        <h2 contenteditable="plaintext-only" data-f="title" data-ph="Titre de la section" spellcheck="false">${esc(s.title)}</h2>
        <div class="bsec-tools">
          ${s.kind === 'characters' ? `<button class="bphotos${s.photos === false ? '' : ' on'}" data-photos title="Fiches avec ou sans photo">Photos</button>` : ''}
          <button data-move="-1" title="Monter">↑</button><button data-move="1" title="Descendre">↓</button>
          <button data-delsec title="Supprimer la section">×</button>
        </div>
      </div>
      ${itemsHTML(s)}
    </section>`;
  }
  function render() {
    const m = doc.meta;
    const fmts = [...new Set([...(m.format ? [m.format] : []), ...FORMATS])];
    root.innerHTML = `
      <header class="bcover">
        <div class="bc-kicker">Bible</div>
        <div class="bc-title" contenteditable="plaintext-only" data-meta="title" data-ph="TITRE" spellcheck="false">${esc(doc.title)}</div>
        <div class="bc-info">
          <select data-meta="format" class="${m.format ? '' : 'empty'}"><option value="">Format</option>${fmts.map(f => `<option${f === m.format ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>
          <span class="tp-dot">·</span>
          <span contenteditable="plaintext-only" data-meta="genre" data-ph="Genre" spellcheck="false">${esc(m.genre)}</span>
        </div>
        <div class="bc-by">
          <span contenteditable="plaintext-only" data-meta="credit" data-ph="Écrit par">${esc(m.credit)}</span>
          <span contenteditable="plaintext-only" data-meta="author" data-ph="Votre nom">${esc(m.author)}</span>
        </div>
      </header>
      ${doc.sections.map(sectionHTML).join('')}
      <button class="badd-sec" data-addsec-menu>+ Ajouter une section</button>`;
    hydrate();
    renderNav();
  }
  function rerenderSection(s) {
    const i = doc.sections.indexOf(s);
    const el = $(`#sec-${s.id}`, root);
    if (!el || i < 0) { render(); return; }
    el.outerHTML = sectionHTML(s, i);
    hydrate($(`#sec-${s.id}`, root));
  }
  async function hydrate(scope = root) {
    for (const im of $$('img[data-img]', scope)) {
      const u = await Images.url(im.dataset.img);
      if (u) im.src = u;
    }
  }
  function renderNav() {
    nav.innerHTML = doc.sections.map((s, i) => `
      <button class="scene-item" data-goto="${s.id}">
        <span class="sn">${i + 1}</span><span class="sh nocaps">${esc(s.title || 'Sans titre')}</span><span class="sl">${KIND[s.kind]}</span>
      </button>`).join('') || '<p class="empty">Aucune section.</p>';
    markActive();
    H.onStats && H.onStats(stats());
  }
  function markActive() {
    const sc = $('#scroller');
    let cur = doc.sections[0] && doc.sections[0].id;
    for (const s of doc.sections) {
      const el = $(`#sec-${s.id}`, root);
      if (el && el.getBoundingClientRect().top - sc.getBoundingClientRect().top < 140) cur = s.id;
    }
    $$('[data-goto]', nav).forEach(b => b.classList.toggle('on', b.dataset.goto === cur));
  }

  /* ───────── Données ───────── */
  const find = id => doc.sections.find(s => s.id === id);
  const secOf = el => { const s = el.closest('[data-id]'); return s ? find(s.dataset.id) : null; };
  const itemOf = (s, el) => { const it = el.closest('[data-item]'); return it && s ? s.items.find(x => x.id === it.dataset.item) : null; };
  function stats() {
    let words = 0, imgs = 0;
    const count = t => (String(t || '').match(/[\p{L}\p{N}’']+/gu) || []).length;
    for (const s of doc.sections) {
      if (s.kind === 'text') words += count(s.body);
      (s.items || []).forEach(it => { words += count(it.desc) + count(it.caption); if (it.img) imgs++; });
    }
    return { words, imgs, sections: doc.sections.length };
  }
  function changed(structure) {
    if (structure) renderNav(); else H.onStats && H.onStats(stats());
    H.onChange && H.onChange();
  }
  let pickCb = null;
  function pick(multi, cb) {
    const inp = $('#bibleFile');
    inp.multiple = !!multi;
    pickCb = cb;
    inp.click();
  }
  async function addImages(s, files) {
    const list = [...files].filter(f => f.type.startsWith('image/'));
    if (!list.length) return;
    H.toast && H.toast(list.length > 1 ? `Import de ${list.length} images…` : 'Import de l’image…');
    for (const f of list) {
      try { const r = await Images.fromFile(f); s.items.push({ id: Store.uid(), img: r.id, caption: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') }); }
      catch (e) { console.warn(e); }
    }
    rerenderSection(s); changed(true);
  }
  async function setItemImage(s, it, file) {
    if (!file || !file.type.startsWith('image/')) return;
    const r = await Images.fromFile(file);
    const old = it.img;
    it.img = r.id;
    if (old) Images.del(old);
    rerenderSection(s); changed(true);
  }
  function addItem(s) {
    let it;
    if (s.kind === 'characters') it = { id: Store.uid(), name: '', role: '', desc: '', img: null };
    else if (s.kind === 'palette') it = { id: Store.uid(), name: '', color: SWATCHES[s.items.length % SWATCHES.length] };
    else return;
    s.items.push(it);
    rerenderSection(s); changed(true);
    const el = $(`[data-item="${it.id}"] [data-if="name"]`, root);
    if (el) el.focus();
  }
  function addSection(kind) {
    const titles = { text: 'Nouvelle section', characters: 'Personnages', gallery: 'Images', palette: 'Palette' };
    const hints = { text: 'Écrivez ici…', gallery: 'Glissez des images ici' };
    const s = Templates.section[kind](titles[kind], hints[kind]);
    doc.sections.push(s);
    render(); changed(true);
    const el = $(`#sec-${s.id}`, root);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); const h = $('h2', el); setTimeout(() => { h.focus(); document.getSelection().selectAllChildren(h); }, 350); }
  }

  /* ───────── Champs Markdown : rendu en direct, historique, mise en forme ───────── */
  /** Relit le texte du champ et, si besoin, redessine les marques en gardant la sélection */
  function sync(t, composing) {
    const text = Rich.textIn(t);
    if (!composing) {
      const want = Rich.md(text);
      if (t.innerHTML !== want) {
        const sel = Rich.getSel(t);
        t.innerHTML = want;
        if (sel) Rich.setSel(t, sel.a, sel.z);
      }
    }
    return text;
  }
  function commit(t, text) {
    const s = secOf(t);
    if (!s) return;
    if (t.dataset.f === 'body') s.body = text;
    else { const it = itemOf(s, t); if (it) it[t.dataset.if] = text; }
    changed(false);
  }
  function put(t, text, a, z = a) {
    t.innerHTML = Rich.md(text);
    if (document.activeElement !== t) t.focus({ preventScroll: true });
    Rich.setSel(t, a, z);
    commit(t, text);
  }
  const hist = { undo: [], redo: [], t: 0, kind: '', key: '' };
  function keyOf(t) {
    const sec = t.closest('[data-id]'), it = t.closest('[data-item]');
    return [sec ? sec.dataset.id : '', it ? it.dataset.item : '', t.dataset.f || t.dataset.if].join('|');
  }
  function elOf(key) {
    const [sid, iid, f] = key.split('|');
    const sec = $(`#sec-${sid}`, root);
    const scope = sec && (iid ? $(`[data-item="${iid}"]`, sec) : sec);
    return scope ? $(`.md[data-f="${f}"], .md[data-if="${f}"]`, scope) : null;
  }
  function snap(t, kind, force) {
    const key = keyOf(t), now = Date.now();
    if (force || key !== hist.key || kind !== hist.kind || now - hist.t > 1200) {
      hist.undo.push({ key, text: Rich.textIn(t), sel: Rich.getSel(t) || { a: 0, z: 0 } });
      if (hist.undo.length > 300) hist.undo.shift();
      hist.redo.length = 0;
    }
    hist.key = force ? '' : key; hist.kind = force ? '' : kind; hist.t = now;
  }
  function step(from, to) {
    while (from.length) {
      const st = from.pop(), el = elOf(st.key);
      if (!el) continue;
      to.push({ key: st.key, text: Rich.textIn(el), sel: Rich.getSel(el) || st.sel });
      put(el, st.text, st.sel.a, st.sel.z);
      hist.key = ''; return;
    }
  }
  const undo = () => step(hist.undo, hist.redo);
  const redo = () => step(hist.redo, hist.undo);
  /** Champ Markdown qui contient la sélection */
  function active() {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const n = sel.getRangeAt(0).startContainer;
    const el = (n.nodeType === 3 ? n.parentNode : n).closest && (n.nodeType === 3 ? n.parentNode : n).closest('.md');
    return el && root.contains(el) ? el : null;
  }
  function format(kind) {
    const t = active(), sel = t && Rich.getSel(t);
    if (!sel || sel.a === sel.z) return false;
    const text = Rich.textIn(t), r = Rich.toggle(text, sel.a, sel.z, kind);
    if (!r) return false;
    snap(t, 'format', true);
    put(t, r.text, r.a, r.z);
    return true;
  }
  function prefix(kind) {
    const t = active(), sel = t && Rich.getSel(t);
    if (!sel) return false;
    const r = Rich.linePrefix(Rich.textIn(t), sel.a, sel.z, kind);
    if (!r) return false;
    snap(t, 'format', true);
    put(t, r.text, r.a, r.z);
    return true;
  }
  function formatState() {
    const t = active(), sel = t && Rich.getSel(t);
    return sel && sel.a !== sel.z ? Rich.stateAt(Rich.textIn(t), sel.a, sel.z) : {};
  }
  /** Entrée : nouvelle ligne, en continuant la liste en cours (ou en la terminant sur un élément vide) */
  function newline(t) {
    const text = Rich.textIn(t), sel = Rich.getSel(t) || { a: text.length, z: text.length };
    snap(t, 'enter', true);
    const ls = text.lastIndexOf('\n', sel.a - 1) + 1, line = text.slice(ls, sel.a);
    const m = sel.a === sel.z ? /^(\s*)([-*•+]|(\d+)([.)]))(\s+)/.exec(line) : null;
    if (m && !line.slice(m[0].length).trim() && !text.slice(sel.a).split('\n')[0].trim()) {
      put(t, text.slice(0, ls) + text.slice(sel.a), ls);
      return;
    }
    let ins = '\n';
    if (m) ins += m[1] + (m[3] ? (+m[3] + 1) + m[4] : m[2]) + m[5];
    put(t, text.slice(0, sel.a) + ins + text.slice(sel.z), sel.a + ins.length);
  }

  /* ───────── Événements ───────── */
  function bind() {
    root.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.meta) {
        const v = t.tagName === 'SELECT' ? t.value : t.textContent;
        if (t.dataset.meta === 'title') { doc.title = v.replace(/\n/g, ' '); H.onTitle && H.onTitle(doc.title); }
        else doc.meta[t.dataset.meta] = v;
        if (t.tagName === 'SELECT') t.classList.toggle('empty', !v);
        changed(false); return;
      }
      if (t.dataset.color) {
        const s = secOf(t), it = itemOf(s, t);
        if (!it) return;
        it.color = t.value;
        t.parentElement.style.background = t.value;
        t.closest('.bsw').querySelector('small').textContent = t.value.toUpperCase();
        changed(false); return;
      }
      const s = secOf(t);
      if (!s) return;
      if (t.dataset.f === 'title') { s.title = t.textContent.replace(/\n/g, ' '); changed(true); return; }
      if (t.classList.contains('md')) { commit(t, sync(t, e.isComposing)); return; }
      if (t.dataset.if) { const it = itemOf(s, t); if (it) { it[t.dataset.if] = t.textContent; changed(false); } }
    });
    root.addEventListener('compositionend', e => { const t = e.target; if (t.classList && t.classList.contains('md')) commit(t, sync(t)); });
    root.addEventListener('beforeinput', e => {
      const t = e.target;
      if (!t.classList || !t.classList.contains('md')) return;
      const k = e.inputType;
      if (k === 'historyUndo') { e.preventDefault(); undo(); return; }
      if (k === 'historyRedo') { e.preventDefault(); redo(); return; }
      if (k.startsWith('format')) { e.preventDefault(); const f = { formatBold: 'b', formatItalic: 'i', formatUnderline: 'u', formatStrikeThrough: 's' }[k]; if (f) format(f); return; }
      snap(t, k.startsWith('delete') ? 'del' : 'type');
    });
    root.addEventListener('keydown', e => {
      const t = e.target;
      if (t.classList && t.classList.contains('md')) {
        const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
        if (mod && !e.altKey && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
        if (mod && !e.altKey) {
          const f = !e.shiftKey ? { b: 'b', i: 'i', u: 'u' }[k] : k === 'x' ? 's' : null;
          if (f) { e.preventDefault(); format(f); return; }
        }
        if (e.key === 'Enter' && !e.isComposing && !mod) { e.preventDefault(); newline(t); return; }
        return;
      }
      const single = t.dataset.f === 'title' || ['title', 'genre', 'credit', 'author'].includes(t.dataset.meta) || ['name', 'role', 'caption'].includes(t.dataset.if);
      if (e.key === 'Enter' && single) { e.preventDefault(); t.blur(); }
    });
    root.addEventListener('click', e => {
      const t = e.target;
      const s = secOf(t);
      if (t.closest('[data-addsec-menu]')) { H.sectionMenu && H.sectionMenu(t.closest('[data-addsec-menu]')); return; }
      if (!s) return;
      const mv = t.closest('[data-move]');
      if (mv) {
        const i = doc.sections.indexOf(s), j = i + +mv.dataset.move;
        if (j < 0 || j >= doc.sections.length) return;
        doc.sections.splice(i, 1); doc.sections.splice(j, 0, s);
        render(); changed(true);
        $(`#sec-${s.id}`, root).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      if (t.closest('[data-delsec]')) {
        const full = s.kind === 'text' ? String(s.body || '').trim() : (s.items || []).length;
        if (full && !confirm(`Supprimer la section « ${s.title || 'Sans titre'} » et son contenu ?`)) return;
        Images.del((s.items || []).map(it => it.img));
        doc.sections = doc.sections.filter(x => x !== s);
        render(); changed(true); return;
      }
      const di = t.closest('[data-delitem]');
      if (di) {
        const it = s.items.find(x => x.id === di.dataset.delitem);
        if (it && it.img) Images.del(it.img);
        s.items = s.items.filter(x => x !== it);
        rerenderSection(s); changed(true); return;
      }
      if (t.closest('[data-photos]')) { s.photos = s.photos === false; rerenderSection(s); changed(true); return; }
      const ni = t.closest('[data-noimg]');
      if (ni) {
        e.stopPropagation();
        const it = s.items.find(x => x.id === ni.dataset.noimg);
        if (it && it.img) { Images.del(it.img); it.img = null; rerenderSection(s); changed(true); }
        return;
      }
      if (t.closest('[data-additem]')) { addItem(s); return; }
      if (t.closest('[data-addimgs]')) { pick(true, files => addImages(s, files)); return; }
      const pk = t.closest('[data-pick]');
      if (pk) {
        const it = s.items.find(x => x.id === pk.dataset.pick);
        if (it) pick(false, files => setItemImage(s, it, files[0]));
      }
    });
    root.addEventListener('dragover', e => { if (e.target.closest('.k-gallery, .bimg')) { e.preventDefault(); e.target.closest('.k-gallery, .bimg').classList.add('over'); } });
    root.addEventListener('dragleave', e => { const el = e.target.closest('.over'); if (el) el.classList.remove('over'); });
    root.addEventListener('drop', e => {
      const zone = e.target.closest('.bimg[data-pick], .k-gallery');
      if (!zone) return;
      e.preventDefault();
      zone.classList.remove('over');
      const s = secOf(zone), files = e.dataTransfer.files;
      if (zone.matches('.bimg[data-pick]') && s && s.kind === 'characters') {
        const it = s.items.find(x => x.id === zone.dataset.pick);
        if (it) setItemImage(s, it, files[0]);
      } else if (s) addImages(s, files);
    });
    nav.addEventListener('click', e => {
      const b = e.target.closest('[data-goto]');
      if (b) $(`#sec-${b.dataset.goto}`, root).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#bibleFile').addEventListener('change', e => {
      const files = [...e.target.files];
      e.target.value = '';
      if (pickCb && files.length) pickCb(files);
      pickCb = null;
    });
    $('#scroller').addEventListener('scroll', () => { if (doc) requestAnimationFrame(markActive); }, { passive: true });
  }

  /* ───────── Exports ───────── */
  function toMarkdown(b) {
    const m = b.meta || {}, out = [`# ${b.title || 'Sans titre'}`];
    const info = [m.format, m.genre].filter(Boolean).join(' · ');
    if (info) out.push('', `*${info}*`);
    if (m.author) out.push('', `*${m.credit || 'Écrit par'}* ${m.author}`);
    for (const s of b.sections) {
      if (s.kind === 'text' ? !String(s.body || '').trim() : !(s.items || []).length) continue;
      out.push('', '---', '', `## ${s.title || 'Sans titre'}`, '');
      if (s.kind === 'text') out.push(Rich.toMarkdown(String(s.body || '').trim()));
      else if (s.kind === 'characters') s.items.forEach(it => {
        out.push(`### ${it.name || 'Sans nom'}`);
        if (it.role) out.push(`*${it.role}*`);
        if (it.desc) out.push('', Rich.toMarkdown(it.desc));
        out.push('');
      });
      else if (s.kind === 'gallery') s.items.forEach((it, i) => out.push(`- Image ${i + 1}${it.caption ? ' — ' + it.caption : ''}`));
      else if (s.kind === 'palette') s.items.forEach(it => out.push(`- ${it.name || 'Couleur'} — \`${String(it.color).toUpperCase()}\``));
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  }
  async function pdf(b, opts) {
    const images = {};
    for (const s of b.sections) for (const it of s.items || []) {
      if (it.img && !images[it.img]) { const by = await Images.bytes(it.img); if (by) images[it.img] = by; }
    }
    return PDF.buildBible(b, Object.assign({}, opts, { images }));
  }

  /* ───────── API ───────── */
  let bound = false;
  return {
    init(hooks) { H = hooks || {}; root = $('#bibleDoc'); nav = $('#bibleNav'); },
    open(d) {
      doc = d;
      if (!bound) { bind(); bound = true; }
      render();
    },
    close() { doc = null; root.innerHTML = ''; nav.innerHTML = ''; },
    addSection,
    syncTitle(t) { const el = $('[data-meta="title"]', root); if (el && el.textContent !== t) el.textContent = t; },
    stats: () => (doc ? stats() : null),
    toMarkdown, pdf, KIND, format, prefix, formatState, isActive: () => !!active(),
  };
})();
