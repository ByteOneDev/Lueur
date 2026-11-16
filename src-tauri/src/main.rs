// Lueur — coque native (Tauri / Rust).
// L'interface vit dans ../src ; Rust s'occupe des dialogues natifs et de l'écriture des fichiers exportés.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
use serde::Serialize;
use tauri_plugin_dialog::DialogExt;
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

/// Télécharge la mise à jour (signature vérifiée), remplace l'app puis redémarre.
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(u) = update {
        u.download_and_install(|_, _| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
        app.restart();
    }
    Ok(())
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            save_file,
            open_text_file,
            check_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("Lueur n'a pas pu démarrer");
}
