/* Lueur — modèles de documents (scénarios et bibles) */
const Templates = (() => {
  'use strict';
  const B = (t, x = '') => ({ t, x });
  const N = text => ({ id: Store.uid(), text, done: false });
  const T = (title, hint, body = '') => ({ id: Store.uid(), kind: 'text', title, hint, body });
  const C = (title = 'Personnages') => ({ id: Store.uid(), kind: 'characters', title, items: [] });
  const G = (title, hint) => ({ id: Store.uid(), kind: 'gallery', title, hint, items: [] });
  const P = (title = 'Palette') => ({ id: Store.uid(), kind: 'palette', title, items: [] });

  const script = [
    {
      id: 'blank', name: 'Page blanche', desc: 'Une page, un curseur. Rien d’autre.', meta: '',
      make: () => ({ title: 'Sans titre', blocks: [B('scene')] }),
    },
    {
      id: 'feature', name: 'Long métrage', desc: 'Structure en trois actes, les grands tournants en notes.', meta: '90–120 pages',
      make: () => ({
        title: 'Sans titre', meta: { format: 'Long métrage' },
        blocks: [B('transition', 'OUVERTURE AU NOIR :'), B('scene')],
        notes: [
          N('Image d’ouverture — p. 1'), N('Incident déclencheur — p. 10-12'), N('Premier tournant, fin de l’acte I — p. 25-30'),
          N('Point médian — p. 55-60'), N('Tout est perdu — p. 75'), N('Climax — p. 85-100'), N('Image finale'),
        ],
      }),
    },
    {
      id: 'short', name: 'Court métrage', desc: 'Un personnage, un désir, un obstacle. Entrer tard, sortir tôt.', meta: '5–20 pages',
      make: () => ({
        title: 'Sans titre', meta: { format: 'Court métrage' }, blocks: [B('scene')],
        notes: [N('Qui veut quoi ? Qu’est-ce qui l’en empêche ?'), N('Entrer tard dans chaque scène, en sortir tôt'), N('Une seule idée forte'), N('La dernière image')],
      }),
    },
    {
      id: 'episode', name: 'Épisode de série', desc: 'Teaser, actes et cliffhanger pour un épisode de 26 ou 52 min.', meta: '26–60 pages',
      make: () => ({
        title: 'Sans titre', meta: { format: 'Épisode' }, blocks: [B('scene')],
        notes: [N('Teaser — 2-3 pages'), N('Acte I — le problème de l’épisode'), N('Acte II — ça se complique'), N('Acte III — résolution'), N('Tag / cliffhanger')],
      }),
    },
    {
      id: 'pilot', name: 'Pilote', desc: 'Poser le monde, le héros et le moteur de la série.', meta: '30–60 pages',
      make: () => ({
        title: 'Sans titre', meta: { format: 'Pilote' }, blocks: [B('scene')],
        notes: [
          N('Présenter le héros dès la première scène'), N('Montrer les règles du monde sans les expliquer'),
          N('Le moteur : ce qui fabriquera des épisodes'), N('La question de la saison'), N('Cliffhanger final'),
        ],
      }),
    },
    {
      id: 'sample', name: 'Exemple : Fréquence de nuit', desc: 'Un court scénario pour découvrir l’éditeur.', meta: '1 page',
      make: () => Sample.script(),
    },
  ];

  const bible = [
    {
      id: 'series', name: 'Bible de série', desc: 'Littéraire et graphique : pitch, personnages, arches, épisodes, direction artistique.', meta: 'Complète',
      make: () => ({
        title: 'Sans titre', meta: { format: 'Série' },
        sections: [
          T('Logline', 'L’histoire en une ou deux phrases : un héros, un désir, un obstacle, un enjeu.'),
          T('Pitch', 'Le résumé de la série en une page. Donnez envie d’en voir plus.'),
          T('Note d’intention', 'Pourquoi cette histoire, pourquoi maintenant, pourquoi vous.'),
          T('Univers', 'Le monde, ses règles, l’époque, les lieux récurrents.'),
          C(),
          T('Arches de la saison', 'Où en sont les personnages au début, au milieu, à la fin de la saison ?'),
          T('Épisodes', 'Un paragraphe par épisode.\n1. Titre — résumé…'),
          T('Ton & références', 'Films, séries, livres, musiques qui donnent le ton.'),
          T('Direction artistique', 'Le style visuel : lumière, cadre, textures, technique d’animation…'),
          G('Designs des personnages', 'Glissez des images ici : turnarounds, expressions, silhouettes.'),
          G('Décors', 'Lieux principaux, plans, ambiances.'),
          P(),
          G('Moodboard', 'Références visuelles, photos, couleurs, matières.'),
        ],
      }),
    },
    {
      id: 'literary', name: 'Bible littéraire', desc: 'L’histoire, l’univers et les personnages, sans le visuel.', meta: 'Texte',
      make: () => ({
        title: 'Sans titre', meta: { format: 'Série' },
        sections: [
          T('Logline', 'L’histoire en une ou deux phrases.'),
          T('Pitch', 'Le résumé de la série en une page.'),
          T('Note d’intention', 'Pourquoi cette histoire, pourquoi vous.'),
          T('Univers', 'Le monde, ses règles, ses lieux.'),
          C(),
          T('Arches de la saison', 'L’évolution des personnages sur la saison.'),
          T('Épisodes', '1. Titre — résumé…'),
          T('Ton & références', 'Ce qui donne le ton.'),
        ],
      }),
    },
    {
      id: 'graphic', name: 'Bible graphique', desc: 'Direction artistique, palette, designs, décors et moodboard.', meta: 'Images',
      make: () => ({
        title: 'Sans titre', meta: { format: 'Série' },
        sections: [
          T('Direction artistique', 'Le style visuel en quelques paragraphes : lumière, cadre, textures, technique.'),
          P('Palette'),
          G('Designs des personnages', 'Turnarounds, expressions, silhouettes.'),
          G('Décors', 'Lieux principaux, plans, ambiances.'),
          G('Accessoires', 'Objets importants de l’histoire.'),
          G('Moodboard', 'Références visuelles.'),
          T('Références', 'Œuvres, artistes, photographes qui inspirent le style.'),
        ],
      }),
    },
    {
      id: 'film', name: 'Dossier de film', desc: 'Pour un long ou un court métrage : synopsis, notes, personnages, images.', meta: 'Film',
      make: () => ({
        title: 'Sans titre', meta: { format: 'Long métrage' },
        sections: [
          T('Logline', 'Le film en une phrase.'),
          T('Synopsis', 'L’histoire du début à la fin, en une ou deux pages.'),
          T('Note d’intention', 'Ce que vous voulez raconter, et pourquoi.'),
          C(),
          T('Note de réalisation', 'Comment vous allez le filmer.'),
          P(),
          G('Moodboard', 'Références visuelles.'),
        ],
      }),
    },
    {
      id: 'blankBible', name: 'Bible vierge', desc: 'Une section de texte, ajoutez le reste au fil de l’eau.', meta: '',
      make: () => ({ title: 'Sans titre', sections: [T('Introduction', 'Commencez ici.')] }),
    },
  ];

  return { script, bible, section: { text: T, characters: C, gallery: G, palette: P } };
})();
