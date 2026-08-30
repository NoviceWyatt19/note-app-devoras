use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// 현재 열려 있는 워크스페이스 루트. JS 가 `invoke` 인자로 넘기는 문자열이
/// 아니라 이 Rust 상태에서 읽는다 — XSS 가 성립하면 invoke 인자는 위조될 수
/// 있으므로 신뢰 경계를 프론트엔드 쪽에 두지 않는다(BUG-20260826-01 L3).
struct WorkspaceRoot(Mutex<Option<PathBuf>>);

/// OS 가 실제로 이 창에 드롭한 경로의 집합(canonicalize 된 형태). `devoras_read_dropped_file`
/// 은 이 안에 있는 경로만 읽는다 — invoke 인자로 넘어온 문자열 자체는 신뢰할 수 없으므로
/// (BUG-20260826-01 L3 와 동일한 이유), "OS 가 이 창에 드롭했다"는 provenance 를 Rust 쪽
/// 이벤트 핸들러에서 직접 기록해 신뢰 경계로 삼는다. 한 번 읽히면 제거되는 1회용이다.
struct DroppedPaths(Mutex<HashSet<PathBuf>>);

/// `path` 를 canonicalize 한 뒤 `dropped` 집합에서 제거하며 멤버십을 확인한다.
/// 없으면(=OS 드롭 이벤트로 전달된 적 없는 경로) 에러. 순수 함수로 분리해 단위 테스트 가능.
fn take_dropped_path(dropped: &mut HashSet<PathBuf>, path: &str) -> Result<PathBuf, String> {
    let canon = std::fs::canonicalize(path).map_err(|e| format!("경로 확인 실패: {}", e))?;
    if dropped.remove(&canon) {
        Ok(canon)
    } else {
        Err("드롭 이벤트로 전달되지 않은 경로입니다".into())
    }
}

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
///
/// L4-scope: `tauri.conf.json` 의 `assetProtocol.scope.allow` 에서 `"**"` 를 제거한 대신,
/// 여기서 워크스페이스 루트를 asset protocol scope 와 fs 플러그인 scope 양쪽에 동적으로
/// 허용한다. 두 scope 는 append-only(제거 API 없음)라 이전 세션에서 연 워크스페이스도
/// 계속 허용된 채로 남지만, 그래도 파일시스템 전체(`**`)보다는 압도적으로 좁다.
/// deny 목록(.ssh/.aws/.gnupg/.config/.env*)은 이 허용보다 항상 우선한다.
#[tauri::command]
fn devoras_set_workspace_root(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<WorkspaceRoot>,
) -> Result<(), String> {
    use tauri::Manager;
    use tauri_plugin_fs::FsExt;

    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("워크스페이스 경로가 유효한 디렉터리가 아닙니다: {}", path));
    }

    app.asset_protocol_scope()
        .allow_directory(&root, true)
        .map_err(|e| format!("asset scope 허용 실패: {}", e))?;
    app.fs_scope()
        .allow_directory(&root, true)
        .map_err(|e| format!("fs scope 허용 실패: {}", e))?;

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

/// Finder 드래그앤드롭으로 넘어온 절대 경로의 파일을 읽는다.
///
/// L4-scope 에서 `capabilities/default.json` 의 `fs:allow-home-read-recursive` 를
/// 제거하면서, 워크스페이스 밖에서 드래그한 이미지가 plugin-fs scope 에 막혀
/// 읽히지 않는 회귀가 생겼다.
///
/// ⚠️ **HOTFIX(2026-08-30)**: 최초 커밋(b5a3bd1)은 `path` 인자를 그대로 `std::fs::read`
/// 에 넘겨 검증이 전혀 없었다 — webview 의 어떤 JS 든 `invoke('devoras_read_dropped_file',
/// { path: '~/.ssh/id_rsa' })` 로 임의 파일을 읽을 수 있는, L3/L4 가 닫은 구멍을 그대로
/// 다시 여는 구멍이었다(project-b1·project-31 두 세션이 각각 독립적으로 지적).
/// `devoras_image_save` 는 `ensure_inside` 로 워크스페이스 경계를 Rust 쪽에서 검증하므로
/// scope 우회이면서도 경계는 유지한다 — **동일 패턴이 아니었다.**
///
/// 지금은 `DragDropEvent::Drop` 을 Rust 쪽에서 직접 구독해 "OS 가 실제로 이 창에
/// 드롭한 경로"만 `DroppedPaths` 에 기록하고, 이 커맨드는 그 집합에 있는 경로만
/// (1회용으로 소비하며) 읽는다. provenance 를 프론트엔드가 아니라 Rust 이벤트
/// 핸들러에서 직접 확립하므로, invoke 인자로 넘어온 문자열 자체는 신뢰하지 않는다
/// (BUG-20260826-01 L3 와 동일한 원칙).
///
/// uri-list 붙여넣기는 OS 드롭 이벤트가 없어 이 provenance 를 세울 수 없으므로
/// 이 커맨드를 쓰지 않는다 — `useTauriInputManager.ts` 에서 scope 가 적용되는
/// `@tauri-apps/plugin-fs` 의 `readFile` 로 별도 처리한다(워크스페이스 밖 경로는
/// 그쪽에서 자연히 거부된다).
#[tauri::command]
fn devoras_read_dropped_file(
    path: String,
    dropped: tauri::State<DroppedPaths>,
) -> Result<Vec<u8>, String> {
    let mut set = dropped.0.lock().map_err(|e| e.to_string())?;
    let canon = take_dropped_path(&mut set, &path)?;
    drop(set);
    std::fs::read(&canon).map_err(|e| format!("파일 읽기 실패 ({:?}): {}", canon, e))
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

    #[test]
    fn take_dropped_path_rejects_path_never_dropped() {
        let root = tempdir();
        let target = root.join("never_dropped.png");
        std::fs::write(&target, b"x").unwrap();
        let mut dropped = HashSet::new();
        // devoras_read_dropped_file 의 hotfix 대상 시나리오: invoke 를 직접 호출해
        // 드롭된 적 없는 임의 경로(예: ~/.ssh/id_rsa)를 읽으려는 시도는 거부되어야 한다.
        assert!(take_dropped_path(&mut dropped, target.to_str().unwrap()).is_err());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn take_dropped_path_allows_and_consumes_dropped_path() {
        let root = tempdir();
        let target = root.join("dropped.png");
        std::fs::write(&target, b"x").unwrap();
        let canon = std::fs::canonicalize(&target).unwrap();

        let mut dropped = HashSet::new();
        dropped.insert(canon.clone());

        assert_eq!(
            take_dropped_path(&mut dropped, target.to_str().unwrap()).unwrap(),
            canon
        );
        // 1회용: 같은 경로를 두 번째로 읽으려 하면 거부된다.
        assert!(take_dropped_path(&mut dropped, target.to_str().unwrap()).is_err());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn take_dropped_path_rejects_nonexistent_path() {
        let mut dropped = HashSet::new();
        assert!(take_dropped_path(&mut dropped, "/definitely/does/not/exist/devoras_test.png").is_err());
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
  use tauri::Manager;

  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .manage(WorkspaceRoot(Mutex::new(None)))
    .manage(DroppedPaths(Mutex::new(HashSet::new())))
    // devoras_read_dropped_file 의 provenance 근거: OS 가 실제로 이 창에 드롭한 경로만
    // 여기서 기록한다. invoke 인자로 넘어온 문자열은 이 기록과 대조하기 전까진 신뢰하지 않는다.
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
        let state = window.state::<DroppedPaths>();
        let Ok(mut set) = state.0.lock() else { return };
        for p in paths {
          if let Ok(canon) = std::fs::canonicalize(p) {
            set.insert(canon);
          }
        }
      }
    })
    .invoke_handler(tauri::generate_handler![
      devoras_image_save,
      devoras_set_workspace_root,
      devoras_read_dropped_file,
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