/* Lueur — éditeur de scénario : blocs typés dans un contenteditable, autocomplétion, historique */
const Editor = (() => {
  'use strict';
  const ORDER = ['scene', 'action', 'character', 'paren', 'dialogue', 'transition'];
  const LABEL = { scene: 'Scène', action: 'Action', character: 'Personnage', paren: 'Parenthèse', dialogue: 'Dialogue', transition: 'Transition' };
  const NEXT = { scene: 'action', action: 'action', character: 'dialogue', paren: 'dialogue', dialogue: 'action', transition: 'scene' };
  const TAB = { action: 'character', character: 'action', dialogue: 'paren', paren: 'dialogue', scene: 'action', transition: 'scene' };
  const SCENE_LIVE = /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)\.\s/i;
  const PREFIX_RE = /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.|I\/E\.|INT\.|EXT\.|EST\.)\s+/;
  const VOCAB = {
    fr: {
      prefixes: ['INT. ', 'EXT. ', 'INT./EXT. '],
      times: ['JOUR', 'NUIT', 'MATIN', 'APRÈS-MIDI', 'SOIR', 'AUBE', 'CRÉPUSCULE', 'PLUS TARD', 'CONTINU', 'MÊME MOMENT'],
      transitions: ['COUPE FRANCHE :', 'FONDU ENCHAÎNÉ :', 'FONDU AU NOIR.', 'OUVERTURE AU NOIR :', 'RACCORD :', 'CUT TO:'],
      ext: ['(OFF)', '(H.C.)', '(V.O.)', '(SUITE)'],
    },
    en: {
      prefixes: ['INT. ', 'EXT. ', 'INT./EXT. '],
      times: ['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'LATER', 'MOMENTS LATER', 'CONTINUOUS'],
      transitions: ['CUT TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'FADE OUT.', 'FADE IN:', 'FADE TO BLACK.'],
      ext: ['(V.O.)', '(O.S.)', '(O.C.)', "(CONT'D)"],
    },
  };

  let root = null, H = {};
  const hist = { undo: [], redo: [], t: 0, kind: '' };
  let lastBlock = null;

  /* ───────── DOM helpers ───────── */
  const textOf = d => (d.textContent || '').replace(/ /g, ' ');
  function setText(d, x) { d.textContent = x; if (!x) d.appendChild(document.createElement('br')); }
  function setType(d, t) { d.className = 'b ' + t; d.dataset.t = t; d._c = undefined; }
  function mk(t, x) { const d = document.createElement('div'); setType(d, ORDER.includes(t) ? t : 'action'); setText(d, x || ''); return d; }
  function blockOf(node) {
    let n = node && node.nodeType === 3 ? node.parentNode : node;
    while (n && n !== root && n.parentNode !== root) n = n.parentNode;
    return n && n !== root && n.parentNode === root ? n : null;
  }
  function offsetIn(b, node, off) {
    const r = document.createRange();
    r.setStart(b, 0);
    try { r.setEnd(node, off); } catch (e) { return 0; }
    return r.toString().length;
  }
  function point(node, off, isEnd) {
    if (node === root) {
      const k = root.children;
      if (!k.length) return null;
      if (isEnd && off > 0) { const b = k[Math.min(off, k.length) - 1]; return { b, o: textOf(b).length }; }
      if (off >= k.length) { const b = k[k.length - 1]; return { b, o: textOf(b).length }; }
      return { b: k[off], o: 0 };
    }
    const b = blockOf(node);
    return b ? { b, o: offsetIn(b, node, off) } : null;
  }
  function getSel() {
    if (!root) return null;
    const s = document.getSelection();
    if (!s || !s.rangeCount) return null;
    const r = s.getRangeAt(0);
    if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
    const a = point(r.startContainer, r.startOffset, false);
    if (!a) return null;
    const z = r.collapsed ? a : point(r.endContainer, r.endOffset, true);
    if (!z) return null;
    return { sb: a.b, so: a.o, eb: z.b, eo: z.o, collapsed: r.collapsed || (a.b === z.b && a.o === z.o) };
  }
  function rangeAt(b, o) {
    const r = document.createRange();
    const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    let n, rem = o;
    while ((n = w.nextNode())) {
      if (rem <= n.length) { r.setStart(n, rem); r.collapse(true); return r; }
      rem -= n.length;
    }
    r.selectNodeContents(b);
    r.collapse(o === 0 || !b.textContent.length);
    return r;
  }
  function setCaret(b, o) {
    const s = document.getSelection();
    s.removeAllRanges();
    s.addRange(rangeAt(b, o));
  }
  const curBlock = () => { const s = getSel(); return s ? s.sb : null; };
  function caretIn(b) { const s = getSel(); return s && s.sb === b ? s.so : null; }

  /* ───────── Model ↔ DOM ───────── */
  const blocks = () => [...root.children].map(d => ({ t: d.dataset.t || 'action', x: textOf(d) }));
  function render(list) {
    const f = document.createDocumentFragment();
    (list && list.length ? list : [{ t: 'action', x: '' }]).forEach(b => f.appendChild(mk(b.t, b.x)));
    root.replaceChildren(f);
    lastBlock = null;
    decorate();
  }
  function load(list) { hist.undo.length = 0; hist.redo.length = 0; hist.kind = ''; AC.close(); render(list); }

  function decorate() {
    if (!root) return;
    let cur = null;
    for (const d of root.children) {
      const t = d.dataset.t;
      if (t === 'character') cur = Fountain.speaker(textOf(d)) || null;
      else if (t !== 'paren' && t !== 'dialogue') cur = null;
      const c = cur && H.colorOf ? H.colorOf(cur) : '';
      if (d._c !== c) {
        d._c = c;
        if (c) d.style.setProperty('--c', c); else d.style.removeProperty('--c');
        d.classList.toggle('tinted', !!c);
      }
    }
  }

  function normalize() {
    for (const n of [...root.childNodes]) {
      if (n.nodeType === 1 && n.tagName === 'DIV' && n.classList.contains('b') && n.dataset.t) continue;
      if (n.nodeType === 1 && n.tagName === 'BR') { n.remove(); continue; }
      if (n.nodeType === 1 && n.tagName === 'DIV') {
        const t = ORDER.includes(n.dataset.t) ? n.dataset.t : 'action';
        const c = caretIn(n); const x = textOf(n);
        n.removeAttribute('style'); setType(n, t); setText(n, x);
        if (c != null) setCaret(n, c);
        continue;
      }
      if (n.nodeType === 3 || n.nodeType === 1) {
        const d = mk('action', ''); d.textContent = '';
        root.insertBefore(d, n); d.appendChild(n);
        const x = textOf(d); setText(d, x); setCaret(d, x.length);
      } else n.remove();
    }
    if (!root.children.length) { const d = mk('action', ''); root.appendChild(d); setCaret(d, 0); }
    const s = getSel();
    if (s) new Set([s.sb, s.eb]).forEach(cleanBlock);
  }
  function cleanBlock(b) {
    const kids = [...b.childNodes];
    const hasEl = kids.some(c => c.nodeType === 1 && c.tagName !== 'BR');
    const x = textOf(b);
    const brs = kids.filter(c => c.nodeType === 1 && c.tagName === 'BR').length;
    if (hasEl || (x && brs) || (!x && brs !== 1)) {
      const c = caretIn(b); setText(b, x);
      if (c != null) setCaret(b, Math.min(c, x.length));
    }
  }

  /* ───────── Édition ───────── */
  function deleteRange(s) {
    let { sb, so, eb, eo } = s;
    if (sb !== eb && eo === 0) { eb = eb.previousElementSibling; eo = textOf(eb).length; }
    const sx = textOf(sb), ex = textOf(eb);
    if (sb === eb) { setText(sb, sx.slice(0, so) + sx.slice(Math.max(so, eo))); setCaret(sb, so); return { b: sb, o: so }; }
    let n = sb.nextElementSibling;
    while (n && n !== eb) { const nx = n.nextElementSibling; n.remove(); n = nx; }
    setText(sb, sx.slice(0, so) + ex.slice(eo)); eb.remove(); setCaret(sb, so);
    return { b: sb, o: so };
  }
  function insertAt(c, str) { const x = textOf(c.b); setText(c.b, x.slice(0, c.o) + str + x.slice(c.o)); setCaret(c.b, c.o + str.length); }

  function detect(x) {
    const s = x.trim();
    if (Fountain.SCENE_RE.test(s)) return 'scene';
    if (!Fountain.isUpper(s)) return 'action';
    if (/:$/.test(s) || Fountain.isTransition(s)) return 'transition';
    const core = s.replace(/\s*\([^)]*\)\s*$/, '');
    const known = H.names ? H.names(null).includes(Fountain.speaker(s)) : false;
    if (known || (core.length <= 28 && core.split(/\s+/).length <= 3 && !/[.!?…,;]$/.test(core))) return 'character';
    return 'action';
  }

  function enter(s) {
    const c = s.collapsed ? { b: s.sb, o: s.so } : deleteRange(s);
    const b = c.b, x = textOf(b);
    let t = b.dataset.t;
    if (!x.trim()) {
      if (t !== 'action') { setType(b, 'action'); setText(b, ''); setCaret(b, 0); }
      return;
    }
    if (t === 'action' && c.o >= x.trimEnd().length) { const d = detect(x); if (d !== t) { setType(b, d); t = d; } }
    const before = x.slice(0, c.o), after = x.slice(c.o);
    if (!before) { b.before(mk(t, '')); setCaret(b, 0); }
    else if (!after.trim()) {
      if (after) setText(b, before);
      const n = mk(NEXT[t], ''); b.after(n); setCaret(n, 0);
    } else {
      setText(b, before);
      const n = mk(t, after.replace(/^ +/, '')); b.after(n); setCaret(n, 0);
    }
  }
  function backspaceAtStart(b) {
    const prev = b.previousElementSibling, x = textOf(b);
    if (!prev) { if (b.dataset.t !== 'action' && !x) setType(b, 'action'); setCaret(b, 0); return; }
    if (!x) { b.remove(); setCaret(prev, textOf(prev).length); return; }
    const px = textOf(prev);
    if (!px.trim()) { prev.remove(); setCaret(b, 0); return; }
    setText(prev, px + x); b.remove(); setCaret(prev, px.length);
  }
  function deleteAtEnd(b) {
    const n = b.nextElementSibling;
    if (!n) return;
    const x = textOf(b);
    if (!x) { b.remove(); setCaret(n, 0); return; }
    setText(b, x + textOf(n)); n.remove(); setCaret(b, x.length);
  }
  function changeType(b, nt) {
    if (!b || !nt) return;
    snap('type', true);
    let x = textOf(b), o = caretIn(b);
    if (o == null) o = x.length;
    const ot = b.dataset.t;
    if (nt === 'paren') {
      if (!x.trim()) { x = '()'; o = 1; }
      else if (!/^\(.*\)$/.test(x)) { x = '(' + x + ')'; o += 1; }
    } else if (ot === 'paren' && /^\(.*\)$/.test(x)) { x = x.slice(1, -1); o = Math.max(0, Math.min(o - 1, x.length)); }
    setType(b, nt); setText(b, x); setCaret(b, Math.min(o, x.length));
    AC.suppressed = false;
    changed('type'); AC.update();
  }

  /* ───────── Historique ───────── */
  function state() {
    const s = getSel();
    const i = s ? Array.prototype.indexOf.call(root.children, s.sb) : 0;
    return { blocks: blocks(), i: Math.max(0, i), o: s ? s.so : 0 };
  }
  function snap(kind, force) {
    const now = Date.now();
    if (force || kind !== hist.kind || now - hist.t > 1200) {
      hist.undo.push(state());
      if (hist.undo.length > 400) hist.undo.shift();
      hist.redo.length = 0;
    }
    hist.kind = force ? '' : kind; hist.t = now;
  }
  function restore(st) {
    render(st.blocks);
    const b = root.children[Math.min(st.i, root.children.length - 1)];
    if (b) setCaret(b, Math.min(st.o, textOf(b).length));
    changed('history');
  }
  function undo() { if (!hist.undo.length) return; hist.redo.push(state()); restore(hist.undo.pop()); hist.kind = ''; AC.close(); }
  function redo() { if (!hist.redo.length) return; hist.undo.push(state()); restore(hist.redo.pop()); hist.kind = ''; AC.close(); }

  function changed(kind) { decorate(); if (H.onChange) H.onChange(kind); }

  /* ───────── Événements ───────── */
  function onBeforeInput(e) {
    const t = e.inputType;
    if (t === 'historyUndo') { e.preventDefault(); undo(); return; }
    if (t === 'historyRedo') { e.preventDefault(); redo(); return; }
    const s = getSel();
    if (!s) return;
    if (t === 'insertParagraph' || t === 'insertLineBreak') {
      e.preventDefault();
      if (AC.isOpen()) { AC.accept(); return; }
      snap('enter', true); enter(s); changed('enter'); AC.suppressed = false; AC.update(); return;
    }
    if (t === 'insertFromPaste' || t === 'insertFromDrop' || t === 'deleteByDrag' || t === 'insertFromYank') { e.preventDefault(); return; }
    if (s.sb !== s.eb && e.cancelable) {
      e.preventDefault(); snap('multi', true);
      const c = deleteRange(s);
      const data = e.data || (e.dataTransfer && e.dataTransfer.getData('text/plain')) || '';
      if (t.startsWith('insert') && data) insertAt(c, data.replace(/\n+/g, ' '));
      changed('input'); AC.update(); return;
    }
    if (s.collapsed && /^delete.*Backward$/.test(t) && s.so === 0) { e.preventDefault(); snap('join', true); backspaceAtStart(s.sb); changed('input'); AC.close(); return; }
    if (s.collapsed && /^delete.*Forward$/.test(t) && s.so >= textOf(s.sb).length) { e.preventDefault(); snap('join', true); deleteAtEnd(s.sb); changed('input'); return; }
    snap(t.startsWith('delete') ? 'del' : 'type');
  }

  function onInput(e) {
    normalize();
    const b = curBlock();
    if (b) {
      const t = b.dataset.t, x = textOf(b);
      if (t === 'action' && SCENE_LIVE.test(x)) setType(b, 'scene');
      else if ((t === 'action' || t === 'dialogue') && x === '(') {
        const p = b.previousElementSibling;
        if (p && ['character', 'dialogue', 'paren'].includes(p.dataset.t)) { setType(b, 'paren'); setText(b, '()'); setCaret(b, 1); }
      }
    }
    if (e.inputType && e.inputType.startsWith('insert')) AC.suppressed = false;
    changed('input');
    AC.update();
  }

  function onKeyDown(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (AC.isOpen()) {
      if (e.key === 'ArrowDown') { e.preventDefault(); AC.move(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); AC.move(-1); return; }
      if ((e.key === 'Enter' && !e.shiftKey && !e.isComposing) || e.key === 'Tab') { e.preventDefault(); AC.accept(); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); AC.close(true); return; }
    }
    if (mod && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && /^[1-6]$/.test(e.key)) { e.preventDefault(); changeType(curBlock(), ORDER[+e.key - 1]); return; }
    if (e.key === 'Tab' && !mod && !e.altKey) {
      e.preventDefault();
      const b = curBlock();
      if (!b) return;
      const t = b.dataset.t;
      changeType(b, e.shiftKey ? ORDER[(ORDER.indexOf(t) + ORDER.length - 1) % ORDER.length] : TAB[t]);
      return;
    }
    if (H.sound && !mod && !e.isComposing) {
      if (e.key === 'Enter') H.sound('enter');
      else if (e.key === 'Backspace' || e.key === 'Delete') H.sound('back');
      else if (e.key.length === 1) H.sound(e.key === ' ' ? 'space' : 'key');
    }
  }

  function selectedBlocks(s) {
    const out = [];
    let n = s.sb;
    while (n) {
      const x = textOf(n);
      out.push({ t: n.dataset.t, x: x.slice(n === s.sb ? s.so : 0, n === s.eb ? s.eo : x.length) });
      if (n === s.eb) break;
      n = n.nextElementSibling;
    }
    return out;
  }
  function onCopy(e) {
    const s = getSel();
    if (!s || s.collapsed) return;
    e.preventDefault();
    const bl = selectedBlocks(s);
    e.clipboardData.setData('text/plain', bl.length === 1 ? bl[0].x : Fountain.fromBlocks(bl));
  }
  function onCut(e) {
    const s = getSel();
    if (!s || s.collapsed) return;
    onCopy(e); snap('cut', true); deleteRange(s); changed('cut');
  }
  function onPaste(e) {
    e.preventDefault();
    const raw = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (!raw) return;
    const s = getSel();
    if (!s) return;
    snap('paste', true);
    const c = s.collapsed ? { b: s.sb, o: s.so } : deleteRange(s);
    const txt = raw.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/\n+$/, '');
    if (!txt.includes('\n')) { insertAt(c, txt); changed('paste'); return; }
    const parsed = Fountain.parse(txt).blocks;
    if (!parsed.length) return;
    const x = textOf(c.b), before = x.slice(0, c.o), after = x.slice(c.o);
    let first = 0;
    if (before.trim()) setText(c.b, before);
    else { setType(c.b, parsed[0].t); setText(c.b, parsed[0].x); first = 1; }
    let last = c.b;
    for (let i = first; i < parsed.length; i++) { const d = mk(parsed[i].t, parsed[i].x); last.after(d); last = d; }
    const L = textOf(last).length;
    if (after) setText(last, textOf(last) + after);
    setCaret(last, L);
    changed('paste');
    last.scrollIntoView({ block: 'nearest' });
  }

  let selRaf = 0;
  function onSel() {
    if (selRaf) return;
    selRaf = requestAnimationFrame(() => {
      selRaf = 0;
      const s = getSel();
      if (!s) return;
      if (AC.isOpen() && (s.sb !== AC.b || !s.collapsed || s.so < AC.start)) AC.close();
      if (s.sb !== lastBlock) { lastBlock = s.sb; AC.suppressed = false; }
      if (H.onCaret) H.onCaret(s.sb, Array.prototype.indexOf.call(root.children, s.sb));
    });
  }

  /* ───────── Autocomplétion ───────── */
  const AC = {
    el: null, items: [], i: 0, b: null, start: 0, end: 0, kind: '', suppressed: false,
    init() {
      this.el = document.getElementById('ac');
      this.el.addEventListener('mousedown', e => {
        e.preventDefault();
        const it = e.target.closest('[data-i]');
        if (it) { this.i = +it.dataset.i; this.accept(); }
      });
    },
    isOpen() { return this.el && !this.el.classList.contains('hidden'); },
    close(suppress) { if (this.el) this.el.classList.add('hidden'); this.items = []; if (suppress) this.suppressed = true; },
    move(d) { this.i = (this.i + d + this.items.length) % this.items.length; this.paint(); },
    update() {
      if (!H.autocomplete || !H.autocomplete() || this.suppressed) return this.close();
      const s = getSel();
      if (!s || !s.collapsed) return this.close();
      const b = s.sb, t = b.dataset.t, x = textOf(b), o = s.so, before = x.slice(0, o);
      const V = VOCAB[H.lang ? H.lang() : 'fr'] || VOCAB.fr;
      const atEnd = !x.slice(o).trim();
      let items = [], start = 0, kind = '';
      const pick = (list, q) => list.filter(v => v.startsWith(q) && v !== q);

      if (t === 'character' && atEnd) {
        const pi = before.lastIndexOf('(');
        const names = H.names ? H.names(b) : [];
        if (pi >= 0) { items = pick(V.ext, before.slice(pi).toUpperCase()); start = pi; kind = 'ext'; }
        else if (/\s$/.test(before) && names.includes(before.trim().toUpperCase())) { items = V.ext.slice(); start = o; kind = 'ext'; }
        else { const q = before.trim().toUpperCase(); items = q ? pick(names, q) : names; start = before.length - before.trimStart().length; kind = 'name'; }
      } else if (t === 'scene' && atEnd) {
        const up = before.toUpperCase();
        const pm = up.match(PREFIX_RE);
        if (!pm) { items = pick(V.prefixes, up.trimStart()).filter(p => p.trim() !== up.trim()); start = 0; kind = 'prefix'; }
        else {
          const rest = up.slice(pm[0].length);
          const dm = rest.match(/^(.*?)(\s+[-–—]\s*)(.*)$/);
          if (!dm) { items = pick(H.locations ? H.locations(b) : [], rest); start = pm[0].length; kind = 'loc'; }
          else {
            const times = [...new Set([...V.times, ...(H.times ? H.times() : [])])];
            items = pick(times, dm[3]); start = pm[0].length + dm[1].length + dm[2].length; kind = 'time';
          }
        }
      } else if (t === 'transition' && atEnd) {
        items = pick(V.transitions, before.trim().toUpperCase()); start = before.length - before.trimStart().length; kind = 'trans';
      } else if (t === 'action' || t === 'dialogue') {
        const m = before.match(/(?:^|[^\p{L}])(\p{Lu}[\p{Lu}'’-]+)$/u);
        if (m) { items = pick(H.names ? H.names(null) : [], m[1]); start = o - m[1].length; kind = 'mention'; }
        else if (t === 'action' && atEnd && before.length >= 2 && before.length <= 4 && !/\s/.test(before)) {
          const q = before.toUpperCase();
          items = V.prefixes.filter(p => p.startsWith(q)); start = 0; kind = 'prefix';
        }
      }
      items = items.slice(0, 7);
      if (!items.length) return this.close();
      Object.assign(this, { items, i: 0, b, start, end: o, kind });
      this.paint(); this.place();
    },
    paint() {
      const typed = Math.max(0, this.end - this.start);
      this.el.innerHTML = this.items.map((it, k) => {
        const e = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        const n = this.kind === 'ext' && this.start === this.end ? 0 : typed;
        return `<div class="ac-i${k === this.i ? ' on' : ''}" data-i="${k}" role="option"><span><b>${e(it.slice(0, n))}</b>${e(it.slice(n))}</span><span class="ac-k">⇥</span></div>`;
      }).join('');
      this.el.classList.remove('hidden');
    },
    place() {
      let rect = null;
      try {
        const rs = rangeAt(this.b, this.start).getClientRects();
        rect = rs && rs.length ? rs[0] : null;
      } catch (e) { rect = null; }
      if (!rect || (!rect.top && !rect.left)) rect = this.b.getBoundingClientRect();
      const el = this.el, h = el.offsetHeight, w = el.offsetWidth;
      let top = rect.bottom + 6;
      if (top + h > innerHeight - 10) top = rect.top - h - 6;
      el.style.top = Math.max(8, top) + 'px';
      el.style.left = Math.max(8, Math.min(innerWidth - w - 8, rect.left - 10)) + 'px';
    },
    accept() {
      const item = this.items[this.i];
      if (item == null) return;
      snap('ac', true);
      const b = this.b, x = textOf(b), after = x.slice(this.end), kind = this.kind;
      if (kind === 'ext') {
        const pre = x.slice(0, this.start).replace(/\s*$/, '');
        setText(b, pre + ' ' + item + after); setCaret(b, pre.length + 1 + item.length);
      } else {
        let pre = x.slice(0, this.start), ins = item;
        if (kind === 'loc') ins = item + ' - ';
        if (kind === 'time' && pre && !/\s$/.test(pre)) pre += ' ';
        if (kind === 'prefix' && b.dataset.t !== 'scene') setType(b, 'scene');
        setText(b, pre + ins + after); setCaret(b, pre.length + ins.length);
      }
      this.close();
      changed('ac');
      if (kind === 'prefix' || kind === 'loc') this.update();
    },
  };

  /* ───────── API ───────── */
  function init(el, hooks) {
    root = el; H = hooks || {};
    AC.init();
    root.addEventListener('beforeinput', onBeforeInput);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('paste', onPaste);
    root.addEventListener('copy', onCopy);
    root.addEventListener('cut', onCut);
    root.addEventListener('drop', e => e.preventDefault());
    root.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== root) AC.close(); }, 150));
    document.addEventListener('selectionchange', onSel);
    window.addEventListener('resize', () => AC.close());
  }
  function focusBlock(i, o = 0, smooth = true) {
    const b = root.children[i];
    if (!b) return;
    root.focus({ preventScroll: true });
    setCaret(b, Math.min(o, textOf(b).length));
    b.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  }
  function focusEnd() {
    const b = root.lastElementChild;
    if (!b) return;
    root.focus({ preventScroll: true });
    setCaret(b, textOf(b).length);
    b.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function replaceAll(list) {
    snap('replace', true);
    const st = state();
    render(list);
    const b = root.children[Math.min(st.i, root.children.length - 1)];
    if (b && document.activeElement === root) setCaret(b, Math.min(st.o, textOf(b).length));
    changed('replace');
  }

  return {
    init, load, blocks, decorate, focusBlock, focusEnd, replaceAll, ORDER, LABEL,
    root: () => root,
    setType: t => changeType(lastBlock && lastBlock.isConnected ? lastBlock : curBlock(), t),
    current: () => (lastBlock && lastBlock.isConnected ? lastBlock : null),
    suggest: () => { AC.suppressed = false; AC.update(); },
    closeSuggest: () => AC.close(),
    caretRect() {
      const s = document.getSelection();
      if (!s || !s.rangeCount) return null;
      const r = s.getRangeAt(0).getClientRects();
      return r && r.length ? r[0] : null;
    },
  };
})();
