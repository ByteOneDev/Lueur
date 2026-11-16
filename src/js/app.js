/* Lueur — application */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const cap = n => String(n).toLowerCase().replace(/(^|[\s\-'’.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const MOD = IS_MAC ? '⌘' : 'Ctrl+';

  const TAURI = window.__TAURI__ || null;
  if (TAURI) document.body.classList.add('is-tauri');
  const invoke = (cmd, args) => TAURI.core.invoke(cmd, args);

  const PALETTE = ['#C0705A', '#7E9A72', '#C9A055', '#6F8CA8', '#9A6F95', '#5E9A94', '#B08468'];
  const THEMES = { day: 'Jour', evening: 'Soir', night: 'Nuit' };
  const FONTS = ['JetBrains Mono', 'Courier Prime', 'IBM Plex Mono', 'Space Mono', 'Courier New'];
  const LPP = { letter: 54, a4: 58 };

  let S = Store.settings();
  let script = null;
  let D = { order: new Map(), freq: new Map(), names: [], locs: [], locFreq: new Map(), times: [], scenes: [], sceneOf: [], pag: null };
  let caretIdx = 0, searchQ = '', lastHtml = {};

  /* ───────── Réglages ───────── */
  function scriptFont() { return S.font === '__custom' ? (S.customFont || 'JetBrains Mono') : S.font; }
  function applySettings() {
    const b = document.body;
    b.dataset.theme = S.theme;
    b.style.setProperty('--script-font', `"${scriptFont().replace(/"/g, '')}", "JetBrains Mono", "Courier Prime", ui-monospace, Menlo, monospace`);
    b.style.setProperty('--script-size', S.fontSize + 'px');
    b.classList.toggle('no-sidebar', !S.sidebar);
    b.classList.toggle('board-on', !!S.board);
    b.classList.toggle('no-player', !S.player);
    $('#script').classList.toggle('numbers', !!S.sceneNumbers);
    $('#script').lang = S.lang === 'en' ? 'en' : 'fr';
    $$('.themeName').forEach(e => { e.textContent = THEMES[S.theme]; });
    $$('#themePicker button').forEach(x => x.classList.toggle('on', x.dataset.theme === S.theme));
    $('[data-action=player]').classList.toggle('on', !!S.player);
    $('[data-action=sidebar]').classList.toggle('on', !!S.sidebar);
    requestAnimationFrame(() => { $('meta[name=theme-color]').content = getComputedStyle(b).getPropertyValue('--bg').trim(); });
    Store.saveSettings(S);
  }
  function fontsChanged() {
    const f = `${S.fontSize}px "${scriptFont()}"`;
    (document.fonts ? document.fonts.load(f) : Promise.resolve()).catch(() => {}).finally(() => setTimeout(refreshNow, 40));
  }

  /* ───────── Bibliothèque ───────── */
  function ago(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function showLibrary() {
    if (script) saveNow();
    script = null; S.lastScript = null; Store.saveSettings(S);
    closePops(); Editor.closeSuggest(); setFocus(false);
    $('#writer').classList.add('hidden');
    $('#library').classList.remove('hidden');
    renderLibrary();
    document.title = 'Lueur';
  }
  function renderLibrary() {
    const idx = Store.index().sort((a, b) => b.updatedAt - a.updatedAt);
    $('#libList').innerHTML = idx.length ? idx.map(s => `
      <div class="lib-item" data-open="${esc(s.id)}">
        <div class="thumb"><i></i><i></i><i></i><i></i></div>
        <div class="li-text"><h3>${esc(s.title || 'Sans titre')}</h3><p>${plural(s.pages || 1, 'page')} · ${ago(s.updatedAt)}</p></div>
        <button class="del" data-del="${esc(s.id)}" title="Supprimer">×</button>
      </div>`).join('') : '<p class="empty">Aucun scénario pour l’instant. Commencez une page blanche ou importez un fichier Fountain.</p>';
  }
  function openScript(id, opts = {}) {
    const s = Store.getScript(id);
    if (!s) { showLibrary(); return; }
    script = Store.normalize(s);
    S.lastScript = id; Store.saveSettings(S);
    $('#library').classList.add('hidden');
    $('#writer').classList.remove('hidden');
    Editor.load(script.blocks);
    $('#docTitle').textContent = script.title || '';
    fillTitlePage();
    $('#titleToggle').checked = !!script.titlePage;
    $('#titlePage').classList.toggle('hidden', !script.titlePage);
    searchQ = ''; $('#searchInput').value = ''; lastHtml = {};
    renderNotes(); renderImage();
    caretIdx = 0;
    refreshNow();
    document.title = (script.title || 'Sans titre') + ' — Lueur';
    $('#scroller').scrollTop = 0;
    setStatus('saved');
    if (opts.focus) { Editor.focusBlock(0, 0, false); Editor.suggest(); }
  }
  function newScript() {
    const s = Store.create({ title: 'Sans titre' });
    openScript(s.id, { focus: true });
  }

  /* ───────── Données dérivées ───────── */
  function compute() {
    const blocks = Editor.blocks();
    script.blocks = blocks;
    const order = new Map(), freq = new Map(), locFreq = new Map(), times = new Set();
    const scenes = [], sceneOf = new Array(blocks.length);
    let sc = null;
    blocks.forEach((b, i) => {
      if (b.t === 'scene') {
        sc = { i, n: scenes.length + 1, text: b.x.trim(), chars: [], body: '' };
        scenes.push(sc);
        const h = Fountain.heading(b.x);
        if (h.loc) locFreq.set(h.loc, (locFreq.get(h.loc) || 0) + 1);
        if (h.time) times.add(h.time);
      } else if (sc) sc.body += ' ' + b.x;
      sceneOf[i] = sc ? sc.n - 1 : -1;
      if (b.t === 'character') {
        const n = Fountain.speaker(b.x);
        if (n) {
          if (!order.has(n)) order.set(n, order.size);
          freq.set(n, (freq.get(n) || 0) + 1);
          if (sc && !sc.chars.includes(n)) sc.chars.push(n);
        }
      }
    });
    const pag = Paginate.run(blocks, LPP[S.paper] || 54, S.lang);
    scenes.forEach((s, k) => {
      const end = k + 1 < scenes.length ? scenes[k + 1].i : blocks.length;
      let L = 0;
      for (let j = s.i; j < end; j++) L += pag.cost[j];
      s.len = Paginate.eighths(L, pag.lpp);
    });
    const names = [...freq.keys()].sort((a, b) => freq.get(b) - freq.get(a) || order.get(a) - order.get(b));
    const locs = [...locFreq.keys()].sort((a, b) => locFreq.get(b) - locFreq.get(a));
    D = { order, freq, names, locs, locFreq, times: [...times], scenes, sceneOf, pag };
  }
  function color(n) {
    const c = script && script.colors ? script.colors[n] : null;
    if (c != null) return PALETTE[c % PALETTE.length];
    let i = D.order.get(n);
    if (i == null) i = D.order.size;
    return PALETTE[i % PALETTE.length];
  }
  function namesFor(b) {
    let list = D.names.slice();
    if (b && b.dataset && b.dataset.t === 'character') {
      const own = Fountain.speaker(b.textContent);
      if (own && D.freq.get(own) === 1) list = list.filter(n => n !== own);
      const recent = [];
      for (let el = b.previousElementSibling; el && recent.length < 2; el = el.previousElementSibling) {
        if (el.dataset.t === 'scene') break;
        if (el.dataset.t === 'character') { const n = Fountain.speaker(el.textContent); if (n && !recent.includes(n)) recent.push(n); }
      }
      // Dans un échange, le prochain à parler est souvent l’avant-dernier
      if (recent.length === 2) list = [recent[1], ...list.filter(n => n !== recent[1] && n !== recent[0]), recent[0]];
      else if (recent.length === 1) list = [...list.filter(n => n !== recent[0]), recent[0]];
    }
    return list;
  }
  function locsFor(b) {
    const own = b && b.dataset.t === 'scene' ? Fountain.heading(b.textContent).loc : '';
    return D.locs.filter(l => !(l === own && D.locFreq.get(l) === 1));
  }

  /* ───────── Rendu ───────── */
  let refreshT = 0;
  function refresh() { clearTimeout(refreshT); refreshT = setTimeout(refreshNow, 140); }
  function refreshNow() {
    if (!script) return;
    clearTimeout(refreshT);
    compute();
    Editor.decorate();
    renderScenes(); renderChars(); renderPageMarks(); renderMeta();
    const p = Math.max(1, D.pag.pages.length);
    const dur = Paginate.duration(D.pag);
    $('#stats').textContent = `${plural(p, 'page')} · ${dur.replace('≈ ', '~')}`;
    $('#tpDuration').textContent = dur;
    if (script.meta.duration !== dur) script.meta.duration = dur;
  }
  function setHTML(el, key, html) { if (lastHtml[key] !== html) { lastHtml[key] = html; el.innerHTML = html; } }
  const displayHeading = x => x.toUpperCase().replace(/\s+[-–]\s+/g, ' — ');

  function renderScenes() {
    const q = norm(searchQ.trim());
    const list = D.scenes.filter(s => !q || norm(s.text + ' ' + s.body).includes(q));
    const html = list.map(s => `
      <button class="scene-item" data-i="${s.i}" data-n="${s.n - 1}">
        <span class="sn">${s.n}</span><span class="sh">${esc(displayHeading(s.text) || 'Scène sans intitulé')}</span><span class="sl">${s.len}</span>
        ${s.chars.length ? `<span class="sw">${s.chars.map(c => `<i style="background:${color(c)}"></i>`).join('')}<em>${esc(s.chars.map(cap).join(', '))}</em></span>` : ''}
      </button>`).join('') || `<p class="empty">${q ? 'Aucun résultat.' : 'Pas encore de scène. Tapez « INT. » ou « EXT. » pour en commencer une.'}</p>`;
    setHTML($('#sceneList'), 'scenes', html);
    markActive();
  }
  function markActive() {
    const sc = D.sceneOf[caretIdx];
    $$('#sceneList .scene-item').forEach(el => el.classList.toggle('on', +el.dataset.n === sc));
  }
  function renderChars() {
    const html = D.names.map(n => {
      const lines = D.freq.get(n) || 0, sc = D.scenes.filter(s => s.chars.includes(n)).length;
      return `<div class="char-item">
        <button class="cdot" data-color="${esc(n)}" style="background:${color(n)}" title="Changer la couleur"></button>
        <div class="ci-text"><b>${esc(cap(n))}</b><small>${plural(lines, 'réplique')} · ${plural(sc, 'scène')}</small></div>
        <button class="ci-ren" data-rename="${esc(n)}">Renommer</button></div>`;
    }).join('') || '<p class="empty">Les personnages apparaissent ici dès qu’ils parlent. Appuyez sur ⇥ dans une ligne d’action pour écrire un nom.</p>';
    setHTML($('#charList'), 'chars', html);
  }
  function renderPageMarks() {
    const kids = Editor.root().children, pag = D.pag;
    const lh = parseFloat(getComputedStyle($('#script')).lineHeight) || S.fontSize * 1.25;
    let html = '';
    for (let p = 1; p < pag.pages.length; p++) {
      const it = pag.pages[p][0];
      const el = it && kids[it.i];
      if (!el) continue;
      const top = el.offsetTop + (it.off || 0) * lh - lh * .6;
      html += `<div class="pm" style="top:${Math.round(top)}px"><span>${p + 1}.</span></div>`;
    }
    setHTML($('#pageMarks'), 'marks', html);
  }
  function renderMeta() {
    if (!script || !D.pag) return;
    const total = Math.max(1, D.pag.pages.length);
    const page = Math.min(total, (D.pag.startPage[caretIdx] ?? 0) + 1);
    const sc = D.sceneOf[caretIdx];
    $('#docMeta').textContent = (sc >= 0 ? `Scène ${sc + 1} · ` : '') + `Page ${page} sur ${total}`;
    markActive();
  }
  function placeTypeHint(b) {
    const h = $('#typeHint');
    if (!b) return;
    h.textContent = Editor.LABEL[b.dataset.t] || '';
    h.style.top = b.offsetTop + 'px';
  }

  /* ───────── Notes & tableau ───────── */
  function renderNotes() {
    const notes = script.notes;
    $('#noteList').innerHTML = notes.map(n => `
      <div class="note-row${n.done ? ' done' : ''}">
        <input type="checkbox" class="cb" data-toggle="${n.id}" ${n.done ? 'checked' : ''}>
        <span contenteditable="plaintext-only" data-edit="${n.id}">${esc(n.text)}</span>
        <button data-delnote="${n.id}" title="Supprimer">×</button>
      </div>`).join('') || '<p class="empty">Pas encore de notes.</p>';
    $('#stickyList').innerHTML = notes.slice(0, 7).map(n =>
      `<p class="note${n.done ? ' done' : ''}" data-toggle="${n.id}">${esc(n.text)}</p>`).join('') ||
      '<p class="note ph">Une idée ? Notez-la ici.</p>';
  }
  function addNote(text) {
    text = text.trim();
    if (!text) return;
    script.notes.push({ id: Store.uid(), text, done: false });
    renderNotes(); scheduleSave();
  }
  function renderImage() {
    $('#polaroidImg').style.backgroundImage = `url("${script.image || 'assets/polaroid.svg'}")`;
    $('#polaroidReset').classList.toggle('hidden', !script.image);
  }
  function loadImage(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 720, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        script.image = c.toDataURL('image/jpeg', .84);
        renderImage(); saveNow();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ───────── Page de titre ───────── */
  function fillTitlePage() {
    $$('#titlePage [data-k]').forEach(el => {
      const k = el.dataset.k;
      el.textContent = k === 'title' ? (script.title || '') : (script.meta[k] || '');
    });
    const fmt = $('#tpFormat'), v = script.meta.format || '';
    if (v && ![...fmt.options].some(o => o.value === v)) fmt.add(new Option(v, v));
    fmt.value = v;
    fmt.classList.toggle('empty', !v);
  }
  function setTitle(t, from) {
    script.title = t;
    if (from !== 'top') $('#docTitle').textContent = t;
    if (from !== 'page') { const el = $('#titlePage [data-k=title]'); if (el.textContent !== t) el.textContent = t; }
    document.title = (t || 'Sans titre') + ' — Lueur';
    scheduleSave();
  }

  /* ───────── Sauvegarde ───────── */
  let saveT = 0;
  function setStatus(st) {
    const el = $('#status');
    el.classList.toggle('dirty', st === 'dirty');
    el.classList.toggle('error', st === 'error');
    el.lastElementChild.textContent = st === 'saved' ? 'Enregistré' : st === 'error' ? 'Non enregistré' : 'Modifié';
  }
  function scheduleSave() { setStatus('dirty'); clearTimeout(saveT); saveT = setTimeout(saveNow, 700); }
  function saveNow() {
    clearTimeout(saveT);
    if (!script) return;
    script.blocks = Editor.blocks();
    script.pages = D.pag ? Math.max(1, D.pag.pages.length) : 1;
    setStatus(Store.putScript(script) ? 'saved' : 'error');
  }

  /* ───────── Export / import ───────── */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2600);
  }
  const fileBase = t => (String(t || '').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Scénario');
  function toB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function saveFile(name, ext, label, bytes, mime) {
    if (TAURI) {
      const path = await invoke('save_file', { name: `${name}.${ext}`, ext, label, dataB64: toB64(bytes) });
      if (path) toast(`Exporté : ${path.split('/').pop()}`);
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
    a.download = `${name}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  async function exportAs(kind) {
    closePops();
    if (!script) return;
    saveNow();
    const name = fileBase(script.title), enc = new TextEncoder();
    try {
      if (kind === 'fountain') await saveFile(name, 'fountain', 'Fountain', enc.encode(Fountain.stringify(script)), 'text/plain');
      else if (kind === 'md') await saveFile(name, 'md', 'Markdown', enc.encode(Fountain.toMarkdown(script)), 'text/markdown');
      else if (kind === 'pdf') {
        toast('Création du PDF…');
        const bytes = await PDF.build(script, { font: scriptFont(), paper: S.paper, lpp: LPP[S.paper] || 54, lang: S.lang, numbers: S.sceneNumbers });
        await saveFile(name, 'pdf', 'PDF', bytes, 'application/pdf');
      }
    } catch (e) {
      console.error(e);
      toast('Export impossible : ' + (e && e.message ? e.message : e));
    }
  }
  function importText(text, fname) {
    const parsed = Fountain.parse(text);
    const m = parsed.meta;
    const title = (m.title || fname || 'Sans titre').replace(/[_*]/g, '').split('\n')[0].trim();
    const s = Store.create({
      title, titlePage: !!m.title, blocks: parsed.blocks.length ? parsed.blocks : [{ t: 'scene', x: '' }],
      meta: {
        credit: m.credit || 'Écrit par', author: m.author || m.authors || '', contact: m.contact || '', date: m['draft date'] || m.date || '',
        format: m.format || '', genre: m.genre || '',
      },
    });
    openScript(s.id);
    toast(`« ${title} » importé`);
  }
  async function importFile() {
    if (TAURI) {
      try {
        const r = await invoke('open_text_file');
        if (r) importText(r[1], r[0]);
      } catch (e) { toast('Import impossible : ' + e); }
      return;
    }
    $('#fileImport').click();
  }

  /* ───────── Popovers, thème, concentration ───────── */
  let openPop = null;
  function togglePop(id, anchor) {
    const p = $('#' + id);
    const wasOpen = !p.classList.contains('hidden');
    closePops();
    if (wasOpen) return;
    p.classList.remove('hidden');
    const r = anchor.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
    let top = r.bottom + 8;
    if (top + h > innerHeight - 10) top = Math.max(10, r.top - h - 8);
    p.style.top = top + 'px';
    p.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.right - w)) + 'px';
    openPop = p;
  }
  function closePops() { $$('.pop').forEach(p => p.classList.add('hidden')); openPop = null; }
  function showThemePicker() {
    const tp = $('#themePicker');
    tp.classList.toggle('hidden');
  }
  function setFocus(on) {
    document.body.classList.toggle('focus', on);
    if (TAURI) {
      try { TAURI.window.getCurrentWindow().setFullscreen(on); } catch (e) { /* ignore */ }
    } else if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (!on && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }
  function typewriterScroll() {
    const r = Editor.caretRect(), sc = $('#scroller');
    if (!r) return;
    const box = sc.getBoundingClientRect();
    const d = r.top - (box.top + box.height * .42);
    if (Math.abs(d) > 24) sc.scrollBy({ top: d, behavior: 'smooth' });
  }

  function renderSettings() {
    const fonts = FONTS.map(f => `<option value="${f}" ${S.font === f ? 'selected' : ''}>${f}</option>`).join('') +
      `<option value="__custom" ${S.font === '__custom' ? 'selected' : ''}>Autre police installée…</option>`;
    const sw = (k, label) => `<label class="row"><span>${label}</span><input type="checkbox" class="switch" data-set="${k}" ${S[k] ? 'checked' : ''}></label>`;
    $('#settingsPop').innerHTML = `
      <div class="set-h">Réglages</div>
      <label class="row"><span>Police</span><select id="setFont">${fonts}</select></label>
      <label class="row ${S.font === '__custom' ? '' : 'hidden'}" id="customRow"><span>Nom de la police</span><input id="setCustom" type="text" value="${esc(S.customFont)}" placeholder="ex. Fira Code" spellcheck="false"></label>
      <div class="font-preview" style="font-family:var(--script-font)"><b>INT. STUDIO - NUIT</b>\n\n            LÉA\n     Trois heures du matin.</div>
      <label class="row"><span>Taille</span><span class="range"><input id="setSize" type="range" min="12" max="22" step="1" value="${S.fontSize}"><output>${S.fontSize}</output></span></label>
      <label class="row"><span>Langue du scénario</span><select id="setLang"><option value="fr">Français</option><option value="en">English</option></select></label>
      <label class="row"><span>Format de page</span><select id="setPaper"><option value="letter">US Letter</option><option value="a4">A4</option></select></label>
      <div class="sep"></div>
      ${sw('autocomplete', 'Autocomplétion')}
      ${sw('sceneNumbers', 'Numéros de scène')}
      ${sw('typeSounds', 'Sons de machine à écrire')}
      ${sw('board', 'Notes et image à droite')}
      <div class="sep"></div>
      <div class="keys">
        <div><kbd>⇥</kbd>changer d’élément (action → personnage…)</div>
        <div><kbd>↵</kbd>élément suivant · <kbd>Échap</kbd>fermer les suggestions</div>
        <div><kbd>${MOD}1–6</kbd>scène · action · perso · parenthèse · dialogue · transition</div>
        <div><kbd>${MOD}⇧F</kbd>concentration · <kbd>${MOD}\\</kbd>panneau</div>
      </div>
      <div class="sep"></div>
      <div class="row"><span class="version">Lueur ${esc(Updater.version || 'web')}</span><button class="btn small" id="checkUpdate">Rechercher des mises à jour</button></div>`;
    $('#setLang').value = S.lang; $('#setPaper').value = S.paper;
  }

  /* ───────── Mises à jour (GitHub Releases) ───────── */
  const Updater = {
    version: '', busy: false,
    async init() {
      if (!TAURI) return;
      try { this.version = await TAURI.app.getVersion(); } catch (e) { /* ignore */ }
      $('#updateGo').onclick = () => this.install();
      $('#updateLater').onclick = () => $('#updateBar').classList.add('hidden');
      setTimeout(() => this.check(true), 5000);
      setInterval(() => this.check(true), 6 * 3600 * 1000);
    },
    async check(silent) {
      if (!TAURI) { if (!silent) toast('Les mises à jour se font depuis l’app installée.'); return; }
      if (this.busy) return;
      try {
        const u = await invoke('check_update');
        if (u) {
          $('#updateText').textContent = `Lueur ${u.version} est disponible`;
          $('#updateGo').disabled = false;
          $('#updateGo').textContent = 'Installer et redémarrer';
          $('#updateBar').classList.remove('hidden');
        } else if (!silent) toast(`Lueur est à jour (${this.version})`);
      } catch (e) {
        if (!silent) toast('Vérification impossible : ' + e);
      }
    },
    async install() {
      this.busy = true;
      saveNow();
      $('#updateGo').disabled = true;
      $('#updateGo').textContent = 'Téléchargement…';
      try { await invoke('install_update'); }
      catch (e) {
        toast('Mise à jour impossible : ' + e);
        $('#updateGo').disabled = false;
        $('#updateGo').textContent = 'Réessayer';
      } finally { this.busy = false; }
    },
  };

  /* ───────── Lecteur ───────── */
  const Player = {
    N: 26, raf: 0,
    stops: [[108, 90, 154], [154, 95, 134], [192, 112, 90], [217, 150, 94]],
    grad(t) {
      const s = this.stops, x = t * (s.length - 1), i = Math.min(s.length - 2, Math.floor(x)), f = x - i;
      return `rgb(${s[i].map((v, k) => Math.round(v + (s[i + 1][k] - v) * f)).join(',')})`;
    },
    base(i) { return .3 + .7 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * .63)); },
    init() {
      $('#pBars').innerHTML = Array.from({ length: this.N }, (_, i) =>
        `<span style="--b:${this.grad(i / (this.N - 1))};height:${Math.round(8 + 22 * this.base(i))}px"></span>`).join('');
      $('#pPlay').onclick = () => { Sound.isPlaying() ? Sound.pause() : Sound.play(); this.sync(); };
      $('#pPrev').onclick = () => { Sound.go(-1); this.sync(); };
      $('#pNext').onclick = () => { Sound.go(1); this.sync(); };
      this.sync();
    },
    sync() {
      const p = Sound.isPlaying();
      $('#pPlay').classList.toggle('playing', p);
      $('#pTitle').textContent = Sound.name();
      cancelAnimationFrame(this.raf);
      this.paint();
      if (p) this.raf = requestAnimationFrame(() => this.tick());
    },
    tick() { this.paint(); if (Sound.isPlaying()) this.raf = requestAnimationFrame(() => this.tick()); },
    paint() {
      const L = 125, el = Sound.elapsed() % L, prog = el / L, lv = Sound.levels(this.N);
      const f = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      $('#pTime').textContent = `${f(el)} / ${f(L)}`;
      [...$('#pBars').children].forEach((s, i) => {
        s.classList.toggle('past', i / this.N < prog || (!Sound.isPlaying() && prog === 0 && i < this.N * .45));
        const v = lv ? Math.max(.15, Math.min(1, lv[i] * 1.5 * (.55 + .45 * this.base(i)))) : this.base(i);
        s.style.height = Math.round(8 + 22 * v) + 'px';
      });
    },
  };

  /* ───────── Événements ───────── */
  function bind() {
    // Actions de la barre
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const act = a.dataset.action;
      if (act === 'library') showLibrary();
      else if (act === 'sidebar') { S.sidebar = !S.sidebar; applySettings(); }
      else if (act === 'player') { S.player = !S.player; if (!S.player && Sound.isPlaying()) { Sound.pause(); Player.sync(); } applySettings(); }
      else if (act === 'export') togglePop('exportMenu', a);
      else if (act === 'settings') { renderSettings(); togglePop('settingsPop', a); }
      else if (act === 'theme') showThemePicker();
      else if (act === 'focus') setFocus(!document.body.classList.contains('focus'));
    });
    document.addEventListener('mousedown', e => {
      if (openPop && !openPop.contains(e.target) && !e.target.closest('[data-action]') && !e.target.closest('#typeHint')) closePops();
      const tp = $('#themePicker');
      if (!tp.classList.contains('hidden') && !e.target.closest('#themePicker') && !e.target.closest('[data-action=theme]')) tp.classList.add('hidden');
    });
    $('#themePicker').addEventListener('click', e => {
      const b = e.target.closest('[data-theme]');
      if (!b) return;
      S.theme = b.dataset.theme; applySettings();
      setTimeout(() => $('#themePicker').classList.add('hidden'), 650);
    });

    // Bibliothèque
    $('#newScript').onclick = newScript;
    $('#importBtn').onclick = importFile;
    $('#fileImport').onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      importText(await f.text(), f.name.replace(/\.[^.]+$/, ''));
      e.target.value = '';
    };
    $('#libList').addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        const it = Store.index().find(x => x.id === del.dataset.del);
        if (confirm(`Supprimer « ${it ? it.title : 'ce scénario'} » ? Cette action est définitive.`)) { Store.deleteScript(del.dataset.del); renderLibrary(); }
        return;
      }
      const o = e.target.closest('[data-open]');
      if (o) openScript(o.dataset.open);
    });

    // Onglets & recherche
    $$('.tab').forEach(t => t.addEventListener('click', () => {
      $$('.tab').forEach(x => x.classList.toggle('on', x === t));
      $$('.pane').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.tab));
    }));
    $('#searchToggle').onclick = () => {
      const box = $('#searchBox'), on = box.classList.toggle('hidden');
      $('#searchToggle').classList.toggle('on', !on);
      if (!on) { $$('.tab')[0].click(); $('#searchInput').focus(); }
      else { searchQ = ''; $('#searchInput').value = ''; renderScenes(); }
    };
    $('#searchInput').addEventListener('input', e => { searchQ = e.target.value; renderScenes(); });
    $('#searchInput').addEventListener('keydown', e => { if (e.key === 'Escape') $('#searchToggle').click(); });

    // Scènes
    $('#sceneList').addEventListener('click', e => {
      const it = e.target.closest('[data-i]');
      if (it) Editor.focusBlock(+it.dataset.i);
    });

    // Personnages
    $('#charList').addEventListener('click', e => {
      const dot = e.target.closest('[data-color]');
      if (dot) {
        const n = dot.dataset.color;
        const curIdx = script.colors[n] ?? (D.order.get(n) ?? 0) % PALETTE.length;
        script.colors[n] = (curIdx + 1) % PALETTE.length;
        lastHtml = {}; refreshNow(); scheduleSave();
        return;
      }
      const ren = e.target.closest('[data-rename]');
      if (ren) renameCharacter(ren.dataset.rename);
    });

    // Notes (panneau)
    $('#noteAdd').addEventListener('keydown', e => { if (e.key === 'Enter') { addNote(e.target.value); e.target.value = ''; } });
    $('#noteList').addEventListener('change', e => {
      const id = e.target.dataset.toggle;
      const n = id && script.notes.find(x => x.id === id);
      if (n) { n.done = e.target.checked; renderNotes(); scheduleSave(); }
    });
    $('#noteList').addEventListener('click', e => {
      const id = e.target.dataset.delnote;
      if (id) { script.notes = script.notes.filter(x => x.id !== id); renderNotes(); scheduleSave(); }
    });
    $('#noteList').addEventListener('input', e => {
      const id = e.target.dataset.edit;
      const n = id && script.notes.find(x => x.id === id);
      if (n) { n.text = e.target.textContent; $('#stickyList').innerHTML = ''; scheduleSave(); }
    });
    $('#noteList').addEventListener('focusout', e => { if (e.target.dataset.edit) renderNotes(); });
    $('#noteList').addEventListener('keydown', e => { if (e.target.dataset.edit && e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });

    // Post-it
    $('#stickyList').addEventListener('click', e => {
      const id = e.target.dataset.toggle;
      const n = id && script.notes.find(x => x.id === id);
      if (n) { n.done = !n.done; renderNotes(); scheduleSave(); }
    });
    $('#stickyAdd').addEventListener('keydown', e => { if (e.key === 'Enter') { addNote(e.target.value); e.target.value = ''; } });

    // Polaroid
    $('#polaroid').addEventListener('click', e => { if (!e.target.closest('#polaroidReset')) $('#fileImage').click(); });
    $('#polaroidReset').onclick = () => { script.image = null; renderImage(); saveNow(); };
    $('#fileImage').onchange = e => { const f = e.target.files[0]; if (f) loadImage(f); e.target.value = ''; };
    $('#polaroid').addEventListener('dragover', e => e.preventDefault());
    $('#polaroid').addEventListener('drop', e => {
      e.preventDefault();
      const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/'));
      if (f) loadImage(f);
    });

    // Titre & page de titre
    $('#docTitle').addEventListener('input', e => setTitle(e.target.textContent.replace(/\n/g, ' '), 'top'));
    $('#docTitle').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
    $('#titlePage').addEventListener('input', e => {
      const k = e.target.dataset.k;
      if (!k) return;
      if (k === 'title') setTitle(e.target.textContent.replace(/\n/g, ' '), 'page');
      else { script.meta[k] = e.target.textContent; scheduleSave(); }
    });
    $('#titlePage').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.dataset.k && e.target.dataset.k !== 'contact' && e.target.dataset.k !== 'date') { e.preventDefault(); e.target.blur(); }
    });
    $('#tpFormat').addEventListener('change', e => {
      script.meta.format = e.target.value;
      e.target.classList.toggle('empty', !e.target.value);
      scheduleSave();
    });
    $('#titleToggle').addEventListener('change', e => {
      script.titlePage = e.target.checked;
      $('#titlePage').classList.toggle('hidden', !script.titlePage);
      if (script.titlePage) $('#scroller').scrollTo({ top: 0, behavior: 'smooth' });
      scheduleSave();
    });

    // Éditeur : aides visuelles
    const scr = $('#script');
    scr.addEventListener('focus', () => document.body.classList.add('editing'));
    scr.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== scr) document.body.classList.remove('editing'); }, 120));
    $('#endHint').addEventListener('mousedown', e => { e.preventDefault(); Editor.focusEnd(); });
    $('#paper').addEventListener('mousedown', e => {
      if (e.target === $('#paper') || e.target === $('#pageMarks')) { e.preventDefault(); Editor.focusEnd(); }
    });
    const th = $('#typeHint');
    th.addEventListener('mousedown', e => e.preventDefault());
    th.addEventListener('click', () => {
      $('#typeMenu').innerHTML = Editor.ORDER.map((t, i) => `<button class="item" data-type="${t}"><span>${Editor.LABEL[t]}</span><small>${MOD}${i + 1}</small></button>`).join('');
      togglePop('typeMenu', th);
    });
    $('#typeMenu').addEventListener('mousedown', e => e.preventDefault());
    $('#typeMenu').addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (b) { Editor.setType(b.dataset.type); closePops(); } });

    // Export
    $('#exportMenu').addEventListener('click', e => { const b = e.target.closest('[data-export]'); if (b) exportAs(b.dataset.export); });

    // Réglages
    const sp = $('#settingsPop');
    sp.addEventListener('click', e => { if (e.target.id === 'checkUpdate') { closePops(); Updater.check(false); } });
    sp.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'setFont') { S.font = t.value; $('#customRow').classList.toggle('hidden', S.font !== '__custom'); applySettings(); fontsChanged(); }
      else if (t.id === 'setLang') { S.lang = t.value; applySettings(); refreshNow(); }
      else if (t.id === 'setPaper') { S.paper = t.value; applySettings(); refreshNow(); }
      else if (t.dataset.set) { S[t.dataset.set] = t.checked; applySettings(); if (t.dataset.set === 'sceneNumbers') refreshNow(); }
    });
    sp.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'setSize') { S.fontSize = +t.value; t.nextElementSibling.textContent = t.value; applySettings(); fontsChanged(); }
      else if (t.id === 'setCustom') { S.customFont = t.value.trim(); applySettings(); fontsChanged(); }
    });

    // Clavier global
    document.addEventListener('keydown', e => {
      const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
      if (mod && k === 's') { e.preventDefault(); saveNow(); toast('Enregistré'); return; }
      if (!script) return;
      if (mod && k === 'p') { e.preventDefault(); exportAs('pdf'); return; }
      if (mod && k === '\\') { e.preventDefault(); S.sidebar = !S.sidebar; applySettings(); return; }
      if (mod && e.shiftKey && k === 'f') { e.preventDefault(); setFocus(!document.body.classList.contains('focus')); return; }
      if (mod && !e.shiftKey && k === 'f') { e.preventDefault(); if (!S.sidebar) { S.sidebar = true; applySettings(); } if ($('#searchBox').classList.contains('hidden')) $('#searchToggle').click(); else $('#searchInput').focus(); return; }
      if (mod && k === ',') { e.preventDefault(); renderSettings(); togglePop('settingsPop', $('[data-action=settings]')); return; }
      if (e.key === 'Escape') {
        if (openPop) { closePops(); return; }
        if (!$('#themePicker').classList.contains('hidden')) { $('#themePicker').classList.add('hidden'); return; }
        if (document.body.classList.contains('focus')) setFocus(false);
      }
    });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !TAURI) document.body.classList.remove('focus'); });
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
    window.addEventListener('resize', () => { if (script) renderPageMarks(); });
  }

  function renameCharacter(old) {
    const next = (prompt(`Renommer ${cap(old)} en :`, old) || '').trim().toUpperCase();
    if (!next || next === old) return;
    const reEsc = old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const word = new RegExp(`(^|[^\\p{L}\\p{N}])${reEsc}(?=$|[^\\p{L}\\p{N}])`, 'gu');
    const list = Editor.blocks().map(b => {
      if (b.t === 'character' && Fountain.speaker(b.x) === old) return { t: b.t, x: b.x.toUpperCase().replace(old, next) };
      if (b.t === 'action') return { t: b.t, x: b.x.replace(word, `$1${next}`) };
      return b;
    });
    if (script.colors[old] != null) { script.colors[next] = script.colors[old]; delete script.colors[old]; }
    Editor.replaceAll(list);
    lastHtml = {}; refreshNow();
    toast(`${cap(old)} → ${cap(next)}`);
  }

  /* ───────── Démarrage ───────── */
  function boot() {
    applySettings();
    Editor.init($('#script'), {
      onChange: kind => {
        if (!script) return;
        refresh(); scheduleSave();
        if (document.body.classList.contains('focus') && kind !== 'history') requestAnimationFrame(typewriterScroll);
      },
      onCaret: (b, i) => { caretIdx = i; renderMeta(); placeTypeHint(b); },
      colorOf: n => color(n),
      names: b => namesFor(b),
      locations: b => locsFor(b),
      times: () => D.times,
      lang: () => S.lang,
      autocomplete: () => !!S.autocomplete,
      sound: k => { if (S.typeSounds) Sound.key(k); },
    });
    Player.init();
    bind();
    Updater.init();
    if (!S.seeded) {
      const s = Store.create(Sample.script());
      S.seeded = true; S.lastScript = s.id; Store.saveSettings(S);
    }
    if (S.lastScript && Store.getScript(S.lastScript)) openScript(S.lastScript);
    else showLibrary();
    if (document.fonts) document.fonts.ready.then(() => { if (script) refreshNow(); });
  }
  boot();
})();
