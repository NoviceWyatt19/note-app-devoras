/**
 * useTauriInputManager.ts
 *
 * Layer 1 — 수신 계층 (Platform Adapter)
 *
 * Humble Object Pattern:
 *   이 훅은 플랫폼 종속적인 날(Raw) 이벤트(Tauri 네이티브 drag-drop,
 *   document-level paste)를 수신하고 정규화된 EditorInputCommand로
 *   변환하여 onCommand 콜백으로 전달하는 것만 담당한다.
 *
 *   에디터 코어 로직(파일 저장, 마크다운 삽입 등)은 이 훅 밖에서 수행된다.
 *
 * 이벤트 수신 우선순위:
 *   1. Tauri tauri://drag-drop  — Finder 드래그. 파일 절대 경로를 수신.
 *      dragDropEnabled: true (기본값) 일 때만 동작.
 *   2. document paste           — Cmd+V 붙여넣기 fallback.
 *      Pass1: image/* MIME → blob.arrayBuffer()
 *      Pass2: kind='file' (Finder Cmd+C) → getAsFile().arrayBuffer()
 *      Pass3: text/uri-list (file:// URL) → Tauri readFile
 *
 * @example
 *   useTauriInputManager({
 *     onCommand: async (cmd) => {
 *       if (cmd.type === 'INSERT_IMAGE') {
 *         await insertImageIntoEditor(cmd.payload.data, cmd.payload.mimeType);
 *       }
 *     },
 *   });
 */

import { useEffect, useRef } from 'react';

// ── 이미지 확장자 허용 목록 ────────────────────────────────────────────────
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif', 'tiff',
]);

// ── MIME 타입 추론 맵 ─────────────────────────────────────────────────────
const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  avif: 'image/avif',
  tiff: 'image/tiff',
};

function getExtension(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
}

function isImageExt(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext);
}

function mimeFromExt(ext: string): string {
  return EXT_TO_MIME[ext] ?? 'image/png';
}

function mimeFromFile(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  return mimeFromExt(getExtension(file.name));
}

// ── 정규화된 커맨드 타입 ───────────────────────────────────────────────────
export interface InsertImageCommand {
  type: 'INSERT_IMAGE';
  payload: {
    /** 이미지 바이너리 (저장 후 마크다운 삽입에 사용) */
    data: Uint8Array;
    /** 저장 정책 호출에 사용할 MIME 타입 */
    mimeType: string;
    /** 드래그 위치 (drop 이벤트일 때만 제공) */
    dropPosition?: { x: number; y: number };
    /** 원본 파일 절대 경로 (tauri://drag-drop일 때만 제공) */
    sourcePath?: string;
  };
}

export type EditorInputCommand = InsertImageCommand;

export interface UseTauriInputManagerOptions {
  /** 정규화된 커맨드를 수신하는 핸들러 */
  onCommand: (cmd: EditorInputCommand) => Promise<void>;
  /**
   * 이 훅이 활성화된 상태인지 외부에서 제어.
   * false이면 이벤트를 무시. (포커스가 에디터 밖에 있을 때 등)
   * 기본값: true
   */
  enabled?: () => boolean;
}

// ── 환경 감지 ─────────────────────────────────────────────────────────────
const isTauriEnv = (): boolean =>
  typeof window !== 'undefined' &&
  ((window as unknown as Record<string, unknown>).__TAURI__ !== undefined ||
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !== undefined);

// ── 훅 구현 ───────────────────────────────────────────────────────────────
export function useTauriInputManager({
  onCommand,
  enabled,
}: UseTauriInputManagerOptions): void {
  // onCommand / enabled를 ref로 감싸서 stale closure 방지.
  // useEffect deps를 []로 유지하면서 항상 최신 콜백을 참조할 수 있음.
  const onCommandRef = useRef(onCommand);
  const enabledRef = useRef(enabled);
  useEffect(() => { onCommandRef.current = onCommand; });
  useEffect(() => { enabledRef.current = enabled; });

  useEffect(() => {
    const isEnabled = () => (enabledRef.current ? enabledRef.current() : true);

    // ── 공통: 절대 경로 파일을 읽어 커맨드로 변환 ────────────────────────
    async function dispatchFromFilePath(absPath: string, dropPosition?: { x: number; y: number }): Promise<void> {
      const ext = getExtension(absPath);
      if (!isImageExt(ext)) {
        console.log('[TAURI-INPUT] skipping non-image file:', absPath);
        return;
      }
      console.log('[TAURI-INPUT] reading file from path:', absPath);
      try {
        const { readFile } = await import('@tauri-apps/plugin-fs');
        const data = await readFile(absPath);
        const mimeType = mimeFromExt(ext);
        console.log('[TAURI-INPUT] file read OK, dispatching INSERT_IMAGE', { mimeType, size: data.length });
        await onCommandRef.current({ type: 'INSERT_IMAGE', payload: { data, mimeType, dropPosition, sourcePath: absPath } });
      } catch (err) {
        console.error('[TAURI-INPUT] readFile failed:', err, absPath);
      }
    }

    // ── 공통: File 객체를 읽어 커맨드로 변환 ─────────────────────────────
    async function dispatchFromFile(file: File, dropPosition?: { x: number; y: number }): Promise<void> {
      const ext = getExtension(file.name);
      if (!isImageExt(ext) && !file.type.startsWith('image/')) {
        console.log('[TAURI-INPUT] skipping non-image file object:', file.name);
        return;
      }
      console.log('[TAURI-INPUT] reading File object:', file.name, file.type);
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        const mimeType = mimeFromFile(file);
        console.log('[TAURI-INPUT] File read OK, dispatching INSERT_IMAGE', { mimeType, size: data.length });
        await onCommandRef.current({ type: 'INSERT_IMAGE', payload: { data, mimeType, dropPosition } });
      } catch (err) {
        console.error('[TAURI-INPUT] File.arrayBuffer failed:', err, file.name);
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 채널 A: Tauri tauri://drag-drop
    //   dragDropEnabled: true (기본값) 일 때만 동작.
    //   Tauri가 OS 레벨 드래그를 가로채어 파일 절대 경로를 payload.paths로 전달.
    //   DOM drop 이벤트는 이 경우 발생하지 않음.
    // ─────────────────────────────────────────────────────────────────────
    let unlistenDrop: (() => void) | null = null;
    let unlistenDragEnter: (() => void) | null = null;

    if (isTauriEnv()) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        // drag-drop: 파일이 드롭됐을 때
        listen<{ paths: string[]; position?: { x: number; y: number } }>(
          'tauri://drag-drop',
          async (event) => {
            console.log('[TAURI-INPUT] tauri://drag-drop received', event.payload);
            if (!isEnabled()) {
              console.log('[TAURI-INPUT] disabled — skipping drag-drop');
              return;
            }
            const paths: string[] = event.payload?.paths ?? [];
            const position = event.payload?.position;
            // 첫 번째 이미지 파일만 처리
            for (const absPath of paths) {
              const ext = getExtension(absPath);
              if (isImageExt(ext)) {
                await dispatchFromFilePath(absPath, position);
                break;
              }
            }
          },
        ).then((u) => { unlistenDrop = u; }).catch(console.error);

        // drag-enter: 드래그가 앱 창에 들어왔을 때 (시각적 피드백용)
        listen('tauri://drag-enter', (event) => {
          console.log('[TAURI-INPUT] tauri://drag-enter', event.payload);
        }).then((u) => { unlistenDragEnter = u; }).catch(console.error);

        console.log('[TAURI-INPUT] Tauri drag-drop listener registered');
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // 채널 B: document-level paste (Cmd+V fallback)
    //   Tauri WKWebView에서도 document 레벨 ClipboardEvent는 도달함.
    //   단, Finder에서 파일을 복사했을 때 ClipboardData 구성이 달라짐.
    // ─────────────────────────────────────────────────────────────────────
    async function handleDocumentPaste(e: ClipboardEvent): Promise<void> {
      if (!isEnabled()) return;

      const items = e.clipboardData?.items;
      console.log('[TAURI-INPUT] document paste fired', {
        items: items ? Array.from(items).map(i => ({ kind: i.kind, type: i.type })) : 'none',
        types: Array.from(e.clipboardData?.types ?? []),
      });
      if (!items || items.length === 0) return;

      // ── Pass 1: image/* MIME 직접 매칭 (스크린샷, 브라우저 이미지 복사) ──
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (!blob) continue;
          console.log('[TAURI-INPUT] paste Pass1 matched:', item.type);
          e.preventDefault();
          e.stopPropagation();
          await dispatchFromFile(blob);
          return;
        }
      }

      // ── Pass 2: kind='file' 폴백 (macOS Finder Cmd+C → Cmd+V) ──────────
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          console.log('[TAURI-INPUT] paste Pass2 file item:', item.type, f?.name, f?.type);
          if (!f) continue;
          const ext = getExtension(f.name);
          if (isImageExt(ext) || f.type.startsWith('image/')) {
            e.preventDefault();
            e.stopPropagation();
            await dispatchFromFile(f);
            return;
          }
        }
      }

      // ── Pass 3: text/uri-list → file:// 경로 → Tauri readFile ───────────
      const uriItem = Array.from(items).find(i =>
        i.type === 'text/uri-list' || i.type === 'public.file-url',
      );
      if (uriItem) {
        console.log('[TAURI-INPUT] paste Pass3: uri-list found');
        e.preventDefault();
        uriItem.getAsString(async (uriList) => {
          console.log('[TAURI-INPUT] paste Pass3 uriList:', uriList);
          const uris = uriList.split('\n').map(s => s.trim()).filter(Boolean);
          for (const uri of uris) {
            if (!uri.startsWith('file://')) continue;
            const absPath = decodeURIComponent(uri.replace(/^file:\/\//, ''));
            await dispatchFromFilePath(absPath);
            break;
          }
        });
        return;
      }

      console.log('[TAURI-INPUT] paste: no image data found — letting browser handle');
    }

    document.addEventListener('paste', handleDocumentPaste);
    console.log('[TAURI-INPUT] document paste listener registered');

    // ── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      document.removeEventListener('paste', handleDocumentPaste);
      unlistenDrop?.();
      unlistenDragEnter?.();
      console.log('[TAURI-INPUT] all listeners unregistered');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // onCommand는 useCallback으로 감싸지 않으면 매 렌더마다 새 ref가 되므로
  // deps에 넣지 않고 ref pattern으로 호출 (아래 주의사항 참고).
  // 호출자가 useCallback으로 memoize하거나 stable ref를 쓰는 것이 권장됨.
}
