use base64::{Engine as _, engine::general_purpose};

/// 이미지 파일을 절대 경로에 저장하는 Rust 네이티브 커맨드.
///
/// Tauri plugin-fs는 WebView 샌드박스 scope 제한을 받아 사용자가 선택한
/// 임의 경로에 파일을 쓸 수 없는 경우가 있다. 이 커맨드는 Rust std::fs를
/// 직접 사용하여 OS 레벨에서 파일을 쓰므로 scope 제한을 받지 않는다.
///
/// @param path  저장할 파일의 절대 경로 (부모 디렉터리는 자동 생성)
/// @param data  저장할 이진 데이터 (JS Uint8Array → Rust Vec<u8>)
#[tauri::command]
fn save_image_file(path: String, data: Vec<u8>) -> Result<(), String> {
    use std::path::Path;

    let file_path = Path::new(&path);

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

/// 이미지 파일을 읽어 Base64 Data URL 형식으로 반환하는 커맨드.
#[tauri::command]
async fn read_image_base64(path: String) -> Result<String, String> {
    use std::path::Path;

    let bytes = std::fs::read(&path).map_err(|e| format!("파일 읽기 실패: {}", e))?;
    let b64 = general_purpose::STANDARD.encode(&bytes);
    
    // 확장자 기반으로 간단하게 MIME 타입 추론
    let ext = Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_lowercase();
        
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    };
    
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    // 기존 배열에 read_image_base64를 반드시 추가해야 합니다.
    .invoke_handler(tauri::generate_handler![save_image_file, read_image_base64])
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