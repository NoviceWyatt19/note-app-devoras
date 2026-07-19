# Ticket: fix_macos_traffic_light_overlap_and_vite_compat
**Status**: COMPLETED
**Target Release**: v0.1.6 / v0.2.7
**Date**: 2026-07-15

---

## 1. 개요 및 티켓 목표
두 가지 독립적인 문제를 하나의 릴리스로 수정한다.

1. **[디자인 버그]** macOS 신호등 버튼(Traffic Light)이 `titleBarStyle: "Overlay"` 설정으로 인해 앱 좌상단 UI와 겹치는 문제.
2. **[빌드 호환성]** `@vitejs/plugin-react` v4가 Vite 8을 공식적으로 지원하지 않아 peer dependency 경고가 발생하는 문제.

---

## 2. [BUG-1] macOS 신호등 버튼 겹침

### 원인
`tauri.conf.json`에 `"titleBarStyle": "Overlay"` 설정 시, macOS 신호등 버튼(닫기/최소화/전체화면, ~78px 너비, 상단에서 ~28px)이 웹 콘텐츠 위에 직접 오버레이됨. `FileExplorer` 헤더가 `px-4`(좌우 동일 패딩)로 시작해 신호등 영역과 텍스트가 겹침.

### 수정 내용

**FileExplorer.tsx** — 헤더 좌측 패딩 확장 + 드래그 영역 지정:
```tsx
<div
  data-tauri-drag-region
  className="h-10 border-b border-darkBorder flex items-center justify-between pl-20 pr-4 flex-shrink-0 bg-darkPanel"
>
```
- `pl-20` (80px): 신호등 버튼 영역(~78px) 회피
- `data-tauri-drag-region`: 헤더 바를 드래그하여 윈도우 이동 가능

**WorkspacePage.tsx** — 에디터 타이틀바에도 드래그 영역 추가:
```tsx
<div data-tauri-drag-region className="h-10 border-b border-darkBorder ...">
```

---

## 3. [BUG-2] Vite 8 / @vitejs/plugin-react 호환성

### 원인
`@vitejs/plugin-react` v4의 공식 peer dependency 범위:
```
vite: "^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0"
```
pnpm으로 설치 시 Vite 8.1.4가 설치되어 미지원 버전 충돌 경고 발생.

### 수정 내용
Vite를 v8에서 **v7.3.6으로 다운그레이드**하여 공식 지원 범위 내로 복귀:
```bash
pnpm add -D vite@^7.0.0
```

`vite.config.ts`의 Vite 8 전용 옵션(`minify: 'esbuild'`, `sourcemap`) 제거하여 Vite 7의 기본 파이프라인 사용.

**보류된 업그레이드 경로**: Vite 8 + `@vitejs/plugin-react-oxc`로의 전환은 별도 마이그레이션 티켓으로 처리 예정.

---

## 4. 관련 파일 변경 목록
- **MODIFY**:
  - [FileExplorer.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/FileExplorer/ui/FileExplorer.tsx) — `pl-20`, `data-tauri-drag-region`
  - [WorkspacePage.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/pages/WorkspacePage/WorkspacePage.tsx) — `data-tauri-drag-region`
  - [vite.config.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/vite.config.ts) — esbuild 옵션 제거, Vite 7 타겟
  - [package.json](file:///Users/wyattkim/Desktop/Devoras-Design/project/package.json) — vite `^7.3.6`으로 다운그레이드
