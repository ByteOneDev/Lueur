// Lueur — coque native (Tauri / Rust).
// L'interface vit dans ../src ; Rust s'occupe des dialogues natifs et de l'écriture des fichiers exportés.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
use serde::Serialize;
use tauri_plugin_dialog::DialogExt;
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
struct UpdateInfo {
    version: String,
    current: String,
    notes: Option<String>,
}

/// Interroge GitHub (latest.json de la dernière release) : y a-t-il une version plus récente ?
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    Ok(update.map(|u| UpdateInfo {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes: u.body.clone(),
    }))
}

/// Télécharge la mise à jour (signature vérifiée) et remplace l'app.
/// Avec `restart`, relance immédiatement ; sinon la nouvelle version s'ouvrira au prochain lancement.
/// Retourne la version installée, ou None s'il n'y avait rien à installer.
#[tauri::command]
async fn install_update(app: tauri::AppHandle, restart: bool) -> Result<Option<String>, String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let Some(u) = update else { return Ok(None) };
    let version = u.version.clone();
    // Téléchargement + vérification de la signature (clé publique de tauri.conf.json)
    let bytes = u
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    // Installation « sur place » : on garde le dossier Lueur.app pour que l'icône épinglée du Dock
    // reste associée à l'app. En cas d'échec, on retombe sur l'installation standard de Tauri.
    if let Err(e) = install_in_place(&bytes) {
        eprintln!("Lueur: installation sur place impossible ({e}), installation standard");
        u.install(&bytes).map_err(|e| e.to_string())?;
    }
    if restart {
        app.restart();
    }
    Ok(Some(version))
}

/// Remplace uniquement `Lueur.app/Contents` par celui de l'archive de mise à jour.
/// Le dossier `Lueur.app` lui-même (et donc son identifiant de fichier) ne change pas :
/// le Dock continue de reconnaître l'app épinglée après chaque mise à jour.
#[cfg(target_os = "macos")]
fn install_in_place(archive: &[u8]) -> Result<(), String> {
    use std::fs;
    use std::path::PathBuf;

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    // …/Lueur.app/Contents/MacOS/lueur → …/Lueur.app
    let bundle: PathBuf = exe
        .ancestors()
        .nth(3)
        .filter(|p| p.extension().map_or(false, |x| x == "app"))
        .ok_or("bundle .app introuvable")?
        .to_path_buf();
    let contents = bundle.join("Contents");

    // Dossier temporaire sur le même volume que l'app (pour pouvoir renommer sans copier)
    let parent = bundle.parent().ok_or("dossier parent introuvable")?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let work = parent.join(format!(".lueur-update-{stamp}"));
    fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let cleanup = |w: &PathBuf| {
        let _ = fs::remove_dir_all(w);
    };

    // Décompression de l'archive (Lueur.app.tar.gz)
    let gz = flate2::read::GzDecoder::new(archive);
    if let Err(e) = tar::Archive::new(gz).unpack(&work) {
        cleanup(&work);
        return Err(format!("archive illisible : {e}"));
    }
    let new_app = fs::read_dir(&work)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .find(|p| p.extension().map_or(false, |x| x == "app"));
    let Some(new_app) = new_app else {
        cleanup(&work);
        return Err("aucune app dans l'archive".into());
    };
    let new_contents = new_app.join("Contents");
    if !new_contents.join("Info.plist").exists() {
        cleanup(&work);
        return Err("archive incomplète".into());
    }

    // Échange : ancien Contents → corbeille temporaire, nouveau Contents → à sa place
    let old = work.join("Contents-old");
    if let Err(e) = fs::rename(&contents, &old) {
        cleanup(&work);
        return Err(format!("remplacement impossible : {e}"));
    }
    if let Err(e) = fs::rename(&new_contents, &contents) {
        let _ = fs::rename(&old, &contents); // retour arrière
        cleanup(&work);
        return Err(format!("remplacement impossible : {e}"));
    }
    cleanup(&work);

    // Prévient Finder / LaunchServices que l'app a changé
    let _ = std::process::Command::new("/usr/bin/touch").arg(&bundle).status();
    let _ = std::process::Command::new(
        "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
    )
    .arg("-f")
    .arg(&bundle)
    .status();
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn install_in_place(_archive: &[u8]) -> Result<(), String> {
    Err("non pris en charge".into())
}

/// Relance l'app (après une mise à jour installée en arrière-plan).
#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

/// Ouvre le panneau « Enregistrer sous… » natif et écrit le fichier choisi.
/// Retourne le chemin, ou None si l'utilisateur annule.
#[tauri::command]
async fn save_file(
    app: tauri::AppHandle,
    name: String,
    ext: String,
    label: String,
    data_b64: String,
) -> Result<Option<String>, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_b64)
        .map_err(|e| e.to_string())?;
    let picked = app
        .dialog()
        .file()
        .set_file_name(&name)
        .add_filter(&label, &[ext.as_str()])
        .blocking_save_file();
    match picked {
        Some(p) => {
            let path = p.into_path().map_err(|e| e.to_string())?;
            std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
            Ok(Some(path.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}

/// Ouvre un fichier texte (Fountain…) et renvoie (nom sans extension, contenu).
#[tauri::command]
async fn open_text_file(app: tauri::AppHandle) -> Result<Option<(String, String)>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Scénario", &["fountain", "spmd", "txt", "md"])
        .blocking_pick_file();
    match picked {
        Some(p) => {
            let path = p.into_path().map_err(|e| e.to_string())?;
            let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let stem = path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            Ok(Some((stem, text)))
        }
        None => Ok(None),
    }
}

/* ───────── Enregistrement automatique sur le disque ───────── */

/// Dossier par défaut : ~/Documents/Lueur
#[tauri::command]
fn autosave_default_dir(app: tauri::AppHandle) -> Result<String, String> {
    let d = app.path().document_dir().map_err(|e| e.to_string())?.join("Lueur");
    Ok(d.to_string_lossy().into_owned())
}

/// Choisir un autre dossier d'enregistrement.
#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    match app.dialog().file().blocking_pick_folder() {
        Some(p) => Ok(Some(p.into_path().map_err(|e| e.to_string())?.to_string_lossy().into_owned())),
        None => Ok(None),
    }
}

/// Écrit le document dans `dir/<titre>.<ext>` (écriture atomique) et renvoie le chemin.
/// `prev` est le fichier déjà associé au document : on le réutilise, ou on le remplace si le titre a changé.
/// Un fichier qui n'appartient pas à ce document n'est jamais écrasé (« Titre 2.fountain »…).
#[tauri::command]
fn autosave_write(dir: String, name: String, ext: String, content: String, prev: Option<String>) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;
    let dir = PathBuf::from(dir);
    fs::create_dir_all(&dir).map_err(|e| format!("dossier {} : {e}", dir.display()))?;
    let ext: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let mut base: String = name
        .chars()
        .filter(|c| !c.is_control() && !"/\\:*?\"<>|".contains(*c))
        .collect::<String>()
        .trim()
        .trim_start_matches('.')
        .chars()
        .take(120)
        .collect();
    if base.is_empty() {
        base = "Sans titre".into();
    }
    let prev = prev.map(PathBuf::from);
    let mut n = 1;
    let path = loop {
        let file = if n == 1 { format!("{base}.{ext}") } else { format!("{base} {n}.{ext}") };
        let p = dir.join(file);
        if prev.as_ref() == Some(&p) || !p.exists() {
            break p;
        }
        n += 1;
    };
    let tmp = dir.join(format!(".{}.tmp", path.file_name().unwrap_or_default().to_string_lossy()));
    fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;
    // Titre changé : l'ancien fichier de ce document (même dossier, même type) est retiré
    if let Some(old) = prev {
        if old != path
            && old.parent() == Some(dir.as_path())
            && old.extension().map_or(false, |x| x == ext.as_str())
            && old.is_file()
        {
            let _ = fs::remove_file(&old);
        }
    }
    Ok(path.to_string_lossy().into_owned())
}

/// Montre un fichier (ou un dossier) dans le Finder.
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let mut cmd = std::process::Command::new("/usr/bin/open");
    if p.is_file() {
        cmd.arg("-R");
    } else {
        let _ = std::fs::create_dir_all(p);
    }
    cmd.arg(p).spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn main() {
    // Test local de l'installation sur place (uniquement en build de développement).
    #[cfg(debug_assertions)]
    {
        let args: Vec<String> = std::env::args().collect();
        if args.get(1).map(String::as_str) == Some("--test-apply-update") {
            let bytes = std::fs::read(&args[2]).expect("archive");
            println!("{:?}", install_in_place(&bytes));
            return;
        }
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            save_file,
            open_text_file,
            check_update,
            install_update,
            restart_app,
            autosave_default_dir,
            pick_folder,
            autosave_write,
            reveal_path
        ])
        .run(tauri::generate_context!())
        .expect("Lueur n'a pas pu démarrer");
}

#[cfg(test)]
mod tests {
    use super::autosave_write;
    #[test]
    fn autosave_names_and_renames() {
        let dir = std::env::temp_dir().join(format!("lueur-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let d = dir.to_string_lossy().to_string();
        // Un fichier étranger du même nom n'est jamais écrasé
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Film.fountain"), "à moi").unwrap();
        let a = autosave_write(d.clone(), "Film".into(), "fountain".into(), "v1".into(), None).unwrap();
        assert!(a.ends_with("Film 2.fountain"));
        assert_eq!(std::fs::read_to_string(dir.join("Film.fountain")).unwrap(), "à moi");
        // Même document : même fichier, réécrit
        let b = autosave_write(d.clone(), "Film".into(), "fountain".into(), "v2".into(), Some(a.clone())).unwrap();
        assert_eq!(a, b);
        assert_eq!(std::fs::read_to_string(&b).unwrap(), "v2");
        // Titre changé : nouveau nom, l'ancien fichier de ce document disparaît
        let c = autosave_write(d.clone(), "Nuit / jour".into(), "fountain".into(), "v3".into(), Some(b.clone())).unwrap();
        assert!(c.ends_with("Nuit  jour.fountain"));
        assert!(!std::path::Path::new(&b).exists());
        assert!(dir.join("Film.fountain").exists());
        // Titre vide
        let e = autosave_write(d.clone(), "  ".into(), "md".into(), "x".into(), None).unwrap();
        assert!(e.ends_with("Sans titre.md"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
