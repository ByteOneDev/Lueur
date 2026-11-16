// Publie une nouvelle version de Lueur sur GitHub Releases, ce qui déclenche la mise à jour automatique.
//
//   1. Changez "version" dans src-tauri/tauri.conf.json (ex. 0.3.0)
//   2. npm run release -- "Ce qui change dans cette version"
//
// Le script construit l'app + le DMG, signe l'archive de mise à jour avec ~/.tauri/lueur.key,
// écrit latest.json et crée la release vX.Y.Z sur github.com/ByteOneDev/Lueur.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'ByteOneDev/Lueur';
const root = fileURLToPath(new URL('..', import.meta.url));
const conf = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const version = conf.version;
const tag = `v${version}`;
const notes = process.argv.slice(2).join(' ').trim() || `Lueur ${version}`;
const keyPath = process.env.LUEUR_UPDATER_KEY || join(homedir(), '.tauri/lueur.key');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim();

if (!existsSync(keyPath)) { console.error(`Clé de signature introuvable : ${keyPath}`); process.exit(1); }
try {
  out('gh', ['release', 'view', tag, '-R', REPO]);
  console.error(`La release ${tag} existe déjà. Augmentez "version" dans src-tauri/tauri.conf.json.`);
  process.exit(1);
} catch { /* la release n'existe pas encore : parfait */ }

console.log(`\n▸ Construction de Lueur ${version}…`);
const env = {
  ...process.env,
  PATH: `${join(homedir(), '.cargo/bin')}:${process.env.PATH}`,
  TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyPath, 'utf8'),
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || '',
};
run('npx', ['tauri', 'build', '--bundles', 'app,dmg'], { env });

const bundle = join(root, 'src-tauri/target/release/bundle');
const archive = join(bundle, 'macos/Lueur.app.tar.gz');
const sig = readFileSync(archive + '.sig', 'utf8').trim();
const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
const dmg = join(bundle, `dmg/Lueur_${version}_${arch}.dmg`);
run('codesign', ['--force', '-s', '-', dmg]);

const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    [`darwin-${arch}`]: { signature: sig, url: `https://github.com/${REPO}/releases/download/${tag}/Lueur.app.tar.gz` },
  },
};
const latestPath = join(bundle, 'latest.json');
writeFileSync(latestPath, JSON.stringify(latest, null, 2) + '\n');

console.log(`\n▸ Publication de ${tag} sur github.com/${REPO}…`);
run('gh', ['release', 'create', tag, archive, dmg, latestPath, '-R', REPO, '--title', `Lueur ${version}`, '--notes', notes]);
console.log(`\n✓ Lueur ${version} publiée. Les apps installées proposeront la mise à jour au prochain lancement.`);
