# Lueur

*Écrire à la lueur de la lampe.* Un outil d'écriture de scénario minimaliste, en app macOS native (Tauri / Rust).

## Lancer

```bash
npm install          # une seule fois (installe la CLI Tauri)
npm run dev          # app native en mode développement
npm run build        # construit Lueur.app dans src-tauri/target/release/bundle/macos/
npm run web          # version navigateur sur http://localhost:4173 (pour tester l'interface)
```

Prérequis : Rust (`~/.cargo/bin` dans le PATH) et Xcode Command Line Tools.

### Mises à jour automatiques

L'app vérifie au lancement (puis toutes les 6 h) la dernière release de
[github.com/ByteOneDev/Lueur](https://github.com/ByteOneDev/Lueur) et propose « Installer et redémarrer ».
Bouton manuel : Réglages → *Rechercher des mises à jour*.

Publier une nouvelle version :

1. augmenter `"version"` dans `src-tauri/tauri.conf.json` (ex. `0.3.0`) ;
2. `npm run release -- "Ce qui change"`.

Le script construit l'app et le DMG, signe l'archive de mise à jour avec la clé privée
`~/.tauri/lueur.key` (jamais dans le dépôt — **à sauvegarder** : sans elle, plus aucune mise à jour ne
pourra être acceptée par les apps installées), écrit `latest.json` et crée la release sur GitHub.

### DMG et signature

`npm run build` produit `Lueur.app` **et** `bundle/dmg/Lueur_x.y.z_aarch64.dmg`, signés *ad hoc*
(`signingIdentity: "-"` dans `tauri.conf.json`) : parfait sur votre Mac, mais un autre Mac affichera
l'avertissement Gatekeeper (clic droit → Ouvrir, ou Réglages → Confidentialité → « Ouvrir quand même »).

Pour une distribution sans avertissement, il faut un certificat **Developer ID Application** (Apple Developer
Program) puis la notarisation. Tauri s'en charge si ces variables sont définies au moment du build :

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Votre Nom (TEAMID)"
export APPLE_ID="vous@exemple.com"
export APPLE_PASSWORD="mot-de-passe-pour-app"   # mot de passe d'application, appleid.apple.com
export APPLE_TEAM_ID="TEAMID"
npm run build
```

## Écrire

| Touche | Effet |
|---|---|
| `↵` | élément suivant (Scène → Action, Personnage → Dialogue, Dialogue → Action…) |
| `⇥` | change l'élément : Action ↔ Personnage, Dialogue ↔ Parenthèse |
| `⇧⇥` | parcourt tous les types |
| `⌘1` … `⌘6` | Scène · Action · Personnage · Parenthèse · Dialogue · Transition |
| `⌘Z` / `⇧⌘Z` | annuler / rétablir |
| `⌘F` | rechercher · `⌘\` panneau · `⌘⇧F` concentration · `⌘,` réglages · `⌘P` PDF |

Raccourcis de frappe : taper `int. ` ou `ext. ` crée un intitulé, `(` sous un personnage crée une parenthèse,
une ligne en MAJUSCULES suivie de `↵` devient un personnage.

**Autocomplétion** : `INT.`/`EXT.` → lieux déjà utilisés → moment (JOUR, NUIT…), noms de personnages
(le prochain interlocuteur probable en premier), extensions `(OFF)`, `(H.C.)`…, transitions, et noms en
MAJUSCULES dans l'action. `⇥` ou `↵` pour accepter, `Échap` pour fermer.

## Exports

- **Fountain** (`.fountain`) : format standard, ré-importable dans Lueur, Highland, Fade In, Final Draft (via import), etc.
- **PDF** : mise en page professionnelle (Courier-like 12 pt, marges standard, numéros de page et de scène,
  `(À SUIVRE)` / `(SUITE)` sur les dialogues coupés), police embarquée.
- **Markdown** (`.md`), avec les notes en fin de document.

## Réglages

Police (JetBrains Mono par défaut, Courier Prime, IBM Plex Mono, Space Mono, ou n'importe quelle police installée),
taille, langue du scénario (FR/EN : suggestions et mentions), format US Letter / A4, autocomplétion,
numéros de scène, sons de machine à écrire, tableau notes + image.

Les scénarios sont enregistrés automatiquement sur la machine (stockage local de l'app).

## Structure

```
src/            interface (HTML/CSS/JS, sans dépendance)
  js/editor.js  éditeur par blocs + autocomplétion + historique
  js/fountain.js import/export Fountain et Markdown
  js/paginate.js pagination standard (1 page ≈ 1 min, huitièmes de scène)
  js/pdf.js     générateur PDF avec polices TrueType embarquées
  js/sound.js   ambiances génératives (la source Spotify / YouTube Music viendra ici)
src-tauri/      coque native Rust (dialogues Enregistrer / Ouvrir)
```

Polices : JetBrains Mono, Courier Prime, IBM Plex Mono, Space Mono — licence SIL Open Font License.
