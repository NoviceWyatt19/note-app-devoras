use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// 현재 열려 있는 워크스페이스 루트. JS 가 `invoke` 인자로 넘기는 문자열이
/// 아니라 이 Rust 상태에서 읽는다 — XSS 가 성립하면 invoke 인자는 위조될 수
/// 있으므로 신뢰 경계를 프론트엔드 쪽에 두지 않는다(BUG-20260826-01 L3).
struct WorkspaceRoot(Mutex<Option<PathBuf>>);

/// `path`(또는 아직 존재하지 않으면 그 조상 중 실존하는 가장 가까운 경로)를
/// canonicalize 하여 `root` 내부인지 검사한다. 심볼릭 링크를 통한 탈출도
/// canonicalize 가 실제 경로로 풀어주므로 함께 차단된다.
///
/// 신규 파일 저장 시 `path` 자체는 물론 그 부모 디렉터리(`.devoras/images` 등)도
/// 아직 없을 수 있어, 존재하는 조상을 찾을 때까지 올라간다.
fn ensure_inside(root: &Path, path: &str) -> Result<PathBuf, String> {
    let target = Path::new(path);
    let mut probe = target;
    while !probe.exists() {
        match probe.parent() {
            Some(parent) if !parent.as_os_str().is_empty() => probe = parent,
            _ => break,
        }
    }

    let probe_canon = std::fs::canonicalize(probe)
        .map_err(|e| format!("경로 확인 실패 ({:?}): {}", probe, e))?;
    let root_canon = std::fs::canonicalize(root)
        .map_err(|e| format!("워크스페이스 루트 확인 실패 ({:?}): {}", root, e))?;

    if !probe_canon.starts_with(&root_canon) {
        return Err("워크스페이스 외부 경로 접근이 거부되었습니다".into());
    }

    Ok(target.to_path_buf())
}

/// 워크스페이스를 열 때(혹은 전환할 때) 프론트엔드가 호출해 Rust 쪽 신뢰 경계를
/// 갱신하는 커맨드. `devoras_image_save` 는 이 상태만 신뢰하고 검증한다.
#[tauri::command]
fn devoras_set_workspace_root(path: String, state: tauri::State<WorkspaceRoot>) -> Result<(), String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("워크스페이스 경로가 유효한 디렉터리가 아닙니다: {}", path));
    }

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(root);
    Ok(())
}

/// 이미지 파일을 절대 경로에 저장하는 Rust 네이티브 커맨드.
///
/// Tauri plugin-fs는 WebView 샌드박스 scope 제한을 받아 사용자가 선택한
/// 임의 경로에 파일을 쓸 수 없는 경우가 있다. 이 커맨드는 Rust std::fs를
/// 직접 사용하여 OS 레벨에서 파일을 쓰므로 scope 제한을 받지 않는다.
///
/// 그만큼 scope 우회 자체가 공격면이 되므로, 현재 워크스페이스 루트 밖으로는
/// 쓸 수 없도록 `ensure_inside` 로 진입 시점에 검증한다(BUG-20260826-01 L3).
///
/// @param path  저장할 파일의 절대 경로 (부모 디렉터리는 자동 생성)
/// @param data  저장할 이진 데이터 (JS Uint8Array → Rust Vec<u8>)
#[tauri::command]
fn devoras_image_save(
    path: String,
    data: Vec<u8>,
    state: tauri::State<WorkspaceRoot>,
) -> Result<(), String> {
    let root = {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        guard
            .clone()
            .ok_or_else(|| "워크스페이스가 설정되지 않았습니다".to_string())?
    };

    let file_path = ensure_inside(&root, &path)?;

    // 부모 디렉터리 자동 생성 (mkdir -p 동작)
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("디렉터리 생성 실패 ({:?}): {}", parent, e))?;
    }

    // 파일 쓰기
    std::fs::write(&file_path, &data)
        .map_err(|e| format!("파일 쓰기 실패 ({:?}): {}", file_path, e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tempdir() -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!(
            "devoras_ensure_inside_test_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn allows_new_file_inside_existing_subdir() {
        let root = tempdir();
        std::fs::create_dir_all(root.join(".devoras/images")).unwrap();
        let target = root.join(".devoras/images/pic.png");
        assert!(ensure_inside(&root, target.to_str().unwrap()).is_ok());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn allows_new_file_whose_parent_dir_does_not_exist_yet() {
        let root = tempdir();
        // .devoras/images 디렉터리 자체가 아직 없는 최초 저장 케이스.
        let target = root.join(".devoras/images/pic.png");
        assert!(ensure_inside(&root, target.to_str().unwrap()).is_ok());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn rejects_dotdot_escape() {
        let root = tempdir();
        let sibling = root.join("../escaped.txt");
        assert!(ensure_inside(&root, sibling.to_str().unwrap()).is_err());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn rejects_absolute_path_outside_root() {
        let root = tempdir();
        let outside = tempdir();
        let target = outside.join("pic.png");
        assert!(ensure_inside(&root, target.to_str().unwrap()).is_err());
        std::fs::remove_dir_all(&root).unwrap();
        std::fs::remove_dir_all(&outside).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let root = tempdir();
        let outside = tempdir();
        let link = root.join("escape_link");
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        let target = link.join("pic.png");
        assert!(ensure_inside(&root, target.to_str().unwrap()).is_err());
        std::fs::remove_dir_all(&root).unwrap();
        std::fs::remove_dir_all(&outside).unwrap();
    }

    #[test]
    fn rejects_nonexistent_root() {
        let root = PathBuf::from("/definitely/does/not/exist/devoras_test");
        assert!(ensure_inside(&root, "/tmp/pic.png").is_err());
    }
}



/// React 프론트엔드에서 초기 렌더링 완료 후 호출하여 숨겨진 윈도우를 표시.
///
/// Start Hidden & Reveal 패턴:
///   tauri.conf.json의 visible: false 로 시작하여 White Flash를 차단하고,
///   React DOM 렌더링 + 테마 적용이 끝난 뒤 이 커맨드를 invoke()하여
///   완성된 상태의 윈도우를 부드럽게 노출한다.
#[tauri::command]
fn close_splashscreen(window: tauri::Window) {
    use tauri::Manager;
    // Close splashscreen
    if let Some(splashscreen) = window.get_webview_window("splashscreen") {
        splashscreen.close().unwrap();
    }
    // Show main window
    if let Some(main_window) = window.get_webview_window("main") {
        main_window.show().unwrap();
    }
}

#[tauri::command]
fn show_main_window(window: tauri::Window) -> Result<(), String> {
    window
        .show()
        .map_err(|e| format!("윈도우 표시 실패: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .manage(WorkspaceRoot(Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![
      devoras_image_save,
      devoras_set_workspace_root,
      show_main_window,
      close_splashscreen
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}