# Ticket: imple_tauri2_native_desktop_setup
**Status**: COMPLETED
**Target Release**: v0.2.6
**Date**: 2026-07-15

---

## 1. 개요 및 티켓 목표
웹 브라우저(HTTP) 환경에서만 동작하던 앱을 Tauri 2를 통해 macOS 네이티브 데스크톱 앱으로 실행할 수 있도록 전환한다. OS 레벨 파일 시스템 접근(`tauri-plugin-fs`), 네이티브 다이얼로그(`tauri-plugin-dialog`), 외부 링크 실행(`tauri-plugin-shell`)을 지원한다.

---

## 2. 배경
- 브라우저 보안 정책(Same-Origin, File API 제한)으로 로컬 마크다운 파일을 직접 읽거나 쓸 수 없음.
- `MockFileSystem`(인메모리 가상 FS)만으로는 실제 노트 앱으로서 기능 불가.
- 이미 `src/shared/api/fs.ts`에 `TauriFileSystem` 구현체와 `window.__TAURI__` 감지 팩토리가 존재하여 백엔드 연결만 완성하면 됨.

---

## 3. 구현 상세

### A. Rust 백엔드 초기화 (`src-tauri/`)
```bash
pnpm tauri init \
  --app-name "Devoras" \
  --window-title "Devoras" \
  --frontend-dist "../dist" \
  --dev-url "http://localhost:1420" \
  --before-dev-command "pnpm dev" \
  --before-build-command "pnpm build" \
  --ci
```

### B. `Cargo.toml` — 플러그인 의존성 추가
```toml
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
tauri-plugin-shell = "2"
```

### C. `src/lib.rs` — 플러그인 등록
```rust
tauri::Builder::default()
  .plugin(tauri_plugin_fs::init())
  .plugin(tauri_plugin_dialog::init())
  .plugin(tauri_plugin_shell::init())
  .setup(|app| { ... })
  .run(tauri::generate_context!())
```

### D. `tauri.conf.json` 설정
```json
{
  "identifier": "com.devoras.app",
  "app": {
    "windows": [{
      "width": 1280, "height": 800,
      "minWidth": 800, "minHeight": 600,
      "titleBarStyle": "Overlay",
      "hiddenTitle": true
    }]
  }
}
```

### E. `capabilities/default.json` — 권한 부여
```json
{
  "permissions": [
    "core:default",
    "fs:allow-read-text-file", "fs:allow-write-text-file",
    "fs:allow-read-dir", "fs:allow-mkdir", "fs:allow-exists",
    "fs:allow-remove", "fs:allow-rename",
    "dialog:allow-open", "dialog:allow-save",
    "shell:allow-open"
  ]
}
```

### F. `vite.config.ts` — Tauri 2 권장 설정 적용
- `TAURI_DEV_HOST` 기반 HMR 설정.
- `envPrefix: ['VITE_', 'TAURI_ENV_']` 환경변수 노출.
- `build.target` Tauri 플랫폼별 분기(`safari13` / `chrome105`).

### G. `package.json` 스크립트 추가
```json
"tauri:dev": "pnpm tauri dev",
"tauri:build": "pnpm tauri build"
```

---

## 4. 실행 방법
```bash
pnpm tauri:dev   # 로컬 네이티브 앱 실행 (첫 실행 시 Rust 컴파일 2~3분 소요)
pnpm tauri:build # 배포용 .app / .dmg 생성
```

---

## 5. 관련 파일 변경 목록
- **NEW**:
  - [src-tauri/Cargo.toml](file:///Users/wyattkim/Desktop/Devoras-Design/project/src-tauri/Cargo.toml)
  - [src-tauri/src/main.rs](file:///Users/wyattkim/Desktop/Devoras-Design/project/src-tauri/src/main.rs)
  - [src-tauri/src/lib.rs](file:///Users/wyattkim/Desktop/Devoras-Design/project/src-tauri/src/lib.rs)
  - [src-tauri/tauri.conf.json](file:///Users/wyattkim/Desktop/Devoras-Design/project/src-tauri/tauri.conf.json)
  - [src-tauri/capabilities/default.json](file:///Users/wyattkim/Desktop/Devoras-Design/project/src-tauri/capabilities/default.json)
- **MODIFY**:
  - [vite.config.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/vite.config.ts)
  - [package.json](file:///Users/wyattkim/Desktop/Devoras-Design/project/package.json)
