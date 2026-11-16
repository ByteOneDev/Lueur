/* Lueur — format Fountain (import / export) + Markdown */
const Fountain = (() => {
  'use strict';
  const SCENE_RE = /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[.\s]/i;
  const PREFIX_RE = /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.?|I\/E\.?|INT\.|EXT\.|EST\.)\s*/;
  const TITLE_KEYS = /^(title|credit|author|authors|source|draft date|date|contact|copyright|notes|revision|format|genre|duration)\s*:/i;
  const DLG = new Set(['character', 'paren', 'dialogue']);
  const hasUpper = s => /\p{Lu}/u.test(s);
  const isUpper = s => hasUpper(s) && s === s.toUpperCase();
  const isTransition = s => isUpper(s) && (/TO:$/.test(s) || /^(FADE (IN|OUT)|FONDU|COUPE|ENCHA[IÎ]N|OUVERTURE|SMASH CUT|MATCH CUT|DISSOLVE)/.test(s));

  /** Nom du personnage sans extension : "LÉA (OFF)" → "LÉA" */
  const speaker = x => String(x || '').toUpperCase().replace(/\^\s*$/, '').replace(/\s*\([^)]*\)?/g, '').trim();

  /** Lieu et moment d’un intitulé : "INT. CUISINE - NUIT" → { loc: "CUISINE", time: "NUIT" } */
  function heading(x) {
    const up = String(x || '').toUpperCase().trim();
    const m = up.match(PREFIX_RE);
    if (!m) return { loc: '', time: '' };
    const parts = up.slice(m[0].length).split(/\s+[-–—]\s+/);
    return { loc: (parts[0] || '').trim(), time: parts.length > 1 ? parts[parts.length - 1].trim() : '' };
  }

  function parse(src) {
    let text = String(src || '').replace(/\r\n?/g, '\n').replace(/^﻿/, '')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\[\[[\s\S]*?\]\]/g, '');
    let lines = text.split('\n');
    const meta = {};
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    if (i < lines.length && TITLE_KEYS.test(lines[i])) {
      let key = null;
      for (; i < lines.length && lines[i].trim(); i++) {
        const m = lines[i].match(/^([^:]+):\s*(.*)$/);
        if (m && !/^\s/.test(lines[i])) { key = m[1].trim().toLowerCase(); meta[key] = m[2].trim(); }
        else if (key) meta[key] = (meta[key] ? meta[key] + '\n' : '') + lines[i].trim();
      }
      lines = lines.slice(i);
    }

    const blocks = [];
    let prevBlank = true, inDlg = false;
    for (let j = 0; j < lines.length; j++) {
      const raw = lines[j], line = raw.trim();
      const nextBlank = j + 1 >= lines.length || !lines[j + 1].trim();
      if (!line) {
        if (inDlg && raw.length >= 2) continue;
        prevBlank = true; inDlg = false; continue;
      }
      if (/^={3,}$/.test(line) || /^#/.test(line) || /^=(?!=)/.test(line)) { prevBlank = true; inDlg = false; continue; }
      let t, x = line;
      if (inDlg) {
        t = /^\(.*\)$/.test(line) ? 'paren' : 'dialogue';
        const last = blocks[blocks.length - 1];
        if (t === 'dialogue' && last && last.t === 'dialogue') { last.x += ' ' + line; continue; }
      } else if (line.startsWith('!')) { t = 'action'; x = line.slice(1).trim(); }
      else if (line.startsWith('.') && !line.startsWith('..')) { t = 'scene'; x = line.slice(1).trim(); }
      else if (line.startsWith('@')) { t = 'character'; x = line.slice(1).trim(); inDlg = true; }
      else if (line.startsWith('>') && line.endsWith('<')) { t = 'action'; x = line.slice(1, -1).trim(); }
      else if (line.startsWith('>')) { t = 'transition'; x = line.slice(1).trim(); }
      else if (line.startsWith('~')) { t = 'action'; x = line.slice(1).trim(); }
      else if (prevBlank && SCENE_RE.test(line)) t = 'scene';
      else if (prevBlank && nextBlank && isTransition(line)) t = 'transition';
      else if (prevBlank && !nextBlank && isUpper(line.replace(/\([^)]*\)/g, '')) && !/[.!?]$/.test(line.replace(/\([^)]*\)\s*$/, ''))) { t = 'character'; inDlg = true; }
      else t = 'action';
      if (t === 'scene') x = x.replace(/\s*#[^#]*#\s*$/, '');
      if (t === 'character') x = x.replace(/\s*\^\s*$/, '');
      blocks.push({ t, x });
      prevBlank = false;
    }
    return { meta, blocks };
  }

  function line(b) {
    let x = String(b.x || '').replace(/\s+$/, '');
    switch (b.t) {
      case 'scene': x = x.toUpperCase(); return SCENE_RE.test(x) ? x : '.' + x;
      case 'character': x = x.toUpperCase(); return hasUpper(x.replace(/\([^)]*\)/g, '')) ? x : '@' + x;
      case 'transition': x = x.toUpperCase(); return /TO:$/.test(x) ? x : '> ' + x;
      case 'paren': x = x.trim(); return /^\(.*\)$/.test(x) ? x : '(' + x.replace(/^\(|\)$/g, '') + ')';
      case 'dialogue': return x;
      default:
        if (SCENE_RE.test(x) || /^[.@>~=#!]/.test(x) || (isUpper(x) && /TO:$/.test(x))) return '!' + x;
        return x;
    }
  }

  function fromBlocks(blocks) {
    const out = [];
    let prev = null;
    for (const b of blocks) {
      if (!String(b.x || '').trim()) continue;
      const tight = (b.t === 'paren' || b.t === 'dialogue') && prev && DLG.has(prev);
      if (out.length && !tight) out.push('');
      out.push(line(b));
      prev = b.t;
    }
    return out.join('\n');
  }

  function stringify(s) {
    const m = s.meta || {};
    const head = ['Title: ' + (s.title || 'Sans titre')];
    if (m.format) head.push('Format: ' + m.format);
    if (m.genre) head.push('Genre: ' + m.genre);
    if (m.duration) head.push('Duration: ' + m.duration);
    if (m.credit) head.push('Credit: ' + m.credit);
    if (m.author) head.push('Author: ' + m.author);
    if (m.contact) head.push('Contact:' + m.contact.split('\n').map(l => '\n    ' + l).join(''));
    if (m.date) head.push('Draft date: ' + m.date);
    return head.join('\n') + '\n\n' + fromBlocks(s.blocks) + '\n';
  }

  const mdEsc = x => x.replace(/^([#>*+\-]|\d+\.)/, '\\$1');
  function toMarkdown(s) {
    const m = s.meta || {};
    const out = ['# ' + (s.title || 'Sans titre')];
    const info = [m.format, m.genre, m.duration].filter(Boolean).join(' · ');
    if (info) out.push('', `*${info}*`);
    if (m.author) out.push('', `*${m.credit || 'Écrit par'}* ${m.author}`);
    out.push('', '---');
    let n = 0, prev = null;
    for (const b of s.blocks) {
      const x = String(b.x || '').trim();
      if (!x) continue;
      const inDlg = prev && DLG.has(prev);
      switch (b.t) {
        case 'scene': n++; out.push('', `## ${n}. ${x.toUpperCase()}`); break;
        case 'character': out.push('', `**${x.toUpperCase()}**  `); break;
        case 'paren': if (!inDlg) out.push(''); out.push(`*${x}*  `); break;
        case 'dialogue': if (!inDlg) out.push(''); out.push(mdEsc(x) + '  '); break;
        case 'transition': out.push('', `*${x.toUpperCase()}*`); break;
        default: out.push('', mdEsc(x));
      }
      prev = b.t;
    }
    if (s.notes && s.notes.length) {
      out.push('', '---', '', '## Notes', '');
      s.notes.forEach(note => out.push(`- [${note.done ? 'x' : ' '}] ${note.text}`));
    }
    return out.join('\n') + '\n';
  }

  return { parse, stringify, fromBlocks, toMarkdown, speaker, heading, SCENE_RE, PREFIX_RE, isUpper, isTransition };
})();
