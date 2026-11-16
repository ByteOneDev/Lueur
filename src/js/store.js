/* Lueur — stockage local (scénarios + réglages) */
const Store = (() => {
  'use strict';
  const K = 'lueur.v1.';
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);

  function load(key, def) {
    try { const v = localStorage.getItem(K + key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function save(key, val) {
    try { localStorage.setItem(K + key, JSON.stringify(val)); return true; } catch (e) { console.warn('Lueur: save failed', e); return false; }
  }

  const DEFAULTS = {
    theme: 'day', font: 'JetBrains Mono', customFont: '', fontSize: 15, lang: 'fr', paper: 'letter',
    autocomplete: true, sceneNumbers: true, typeSounds: false, board: true, sidebar: true, player: true,
    lastScript: null, seeded: false,
  };

  function blank(partial = {}) {
    return Object.assign({
      id: uid(), title: 'Sans titre', titlePage: false,
      meta: { credit: 'Écrit par', author: '', contact: '', date: '', format: '', genre: '' },
      blocks: [{ t: 'scene', x: '' }], notes: [], colors: {}, image: null,
      createdAt: Date.now(), updatedAt: Date.now(), pages: 1,
    }, partial);
  }

  return {
    uid,
    settings: () => Object.assign({}, DEFAULTS, load('settings', {})),
    saveSettings: s => save('settings', s),
    index: () => load('index', []),
    getScript: id => load('script.' + id, null),
    putScript(s) {
      s.updatedAt = Date.now();
      const ok = save('script.' + s.id, s);
      const idx = this.index().filter(x => x.id !== s.id);
      idx.unshift({ id: s.id, title: s.title, updatedAt: s.updatedAt, pages: s.pages || 1 });
      save('index', idx);
      return ok;
    },
    deleteScript(id) {
      try { localStorage.removeItem(K + 'script.' + id); } catch (e) { /* ignore */ }
      save('index', this.index().filter(x => x.id !== id));
    },
    create(partial) { const s = blank(partial); this.putScript(s); return s; },
    normalize(s) {
      const b = blank();
      s.meta = Object.assign({}, b.meta, s.meta || {});
      s.blocks = Array.isArray(s.blocks) && s.blocks.length ? s.blocks : b.blocks;
      s.notes = Array.isArray(s.notes) ? s.notes : [];
      s.colors = s.colors || {};
      return s;
    },
  };
})();

/* Scénario d’exemple, créé au premier lancement */
const Sample = {
  script() {
    const B = (t, x) => ({ t, x });
    return {
      title: 'Fréquence de nuit',
      meta: { credit: 'Écrit par', author: '', contact: '', date: '' },
      notes: [
        { id: Store.uid(), text: 'Samir a-t-il déjà appelé avant cette nuit ?', done: false },
        { id: Store.uid(), text: 'Couper la scène du dépôt', done: true },
        { id: Store.uid(), text: 'Essayer le terminus sans la musique.', done: false },
      ],
      blocks: [
        B('scene', 'INT. STUDIO RADIO - NUIT'),
        B('action', 'Une seule lampe. Des vinyles empilés jusqu’au plafond. LÉA (40 ans) parle dans un micro, face à une vitre derrière laquelle il n’y a personne.'),
        B('character', 'LÉA'),
        B('paren', '(à voix basse)'),
        B('dialogue', 'Il est trois heures du matin. Si vous m’entendez, c’est que vous ne dormez pas non plus.'),
        B('action', 'Le téléphone du studio clignote. Ligne deux.'),
        B('character', 'LÉA'),
        B('dialogue', 'Ligne deux, vous êtes à l’antenne.'),
        B('character', 'SAMIR (OFF)'),
        B('dialogue', 'Je conduis un bus vide depuis minuit. Je voulais juste entendre quelqu’un.'),
        B('character', 'LÉA'),
        B('dialogue', 'Alors restez. J’ai toute la nuit.'),
        B('transition', 'COUPE FRANCHE :'),
        B('scene', 'INT. BUS DE NUIT - EN MOUVEMENT'),
        B('action', 'Des sièges vides. Les lampadaires glissent sur les vitres. SAMIR (50 ans) tient le volant d’une main, une petite radio grésillante de l’autre.'),
        B('character', 'SAMIR'),
        B('dialogue', 'Vous passez quoi, après ?'),
        B('character', 'LÉA (OFF)'),
        B('dialogue', 'Ce que vous voulez.'),
        B('character', 'SAMIR'),
        B('paren', '(un temps)'),
        B('dialogue', 'Quelque chose de lent.'),
        B('scene', 'EXT. TERMINUS - AUBE'),
        B('action', 'Le bus s’arrête. Les portes s’ouvrent dans un soupir. Personne ne monte.'),
        B('action', 'Samir coupe le moteur et écoute la fin de la chanson.'),
        B('transition', 'FONDU AU NOIR.'),
      ],
    };
  },
};
