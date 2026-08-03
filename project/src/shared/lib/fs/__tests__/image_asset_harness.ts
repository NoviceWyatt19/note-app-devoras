/**
 * image_asset_harness.ts
 *
 * 이미지 첨부 기능의 핵심 로직을 검증하는 격리형 하네스 테스트.
 * Tauri FS API 없이 Node.js 환경에서 실행 가능.
 *
 * 실행: pnpm test:image
 *
 * 버그 수정 후 Green Phase 테스트 — 모든 테스트가 통과해야 함.
 *
 * 검증 항목:
 *  T1. generateImageFileName — MIME type → 파일명 변환 정확성
 *  T2. generateImageFileName — 빈 MIME type (macOS 드래그 문제) 처리
 *  T3. generateImageFileName — image/jpeg → .jpg 변환
 *  T4. MockFileSystem.saveImageAsset — subDir 있을 때 상대 경로 반환
 *  T5. MockFileSystem.saveImageAsset — subDir 없을 때 파일명만 반환 (custom-folder 내부 동작)
 *  T6. saveImageAssetWithPolicy — workspace-root-hidden 정책
 *  T7. saveImageAssetWithPolicy — current-file-relative 정책
 *  T8. saveImageAssetWithPolicy — current-file-relative, currentFilePath null 폴백
 *  T9. saveImageAssetWithPolicy — custom-folder 정책 절대 경로 반환 [버그 수정 후]
 *  T10. isImageFile(fixed) — macOS type="" .png 파일 감지 성공 [버그 수정 후]
 *  T11. isImageFile(fixed) — 다양한 케이스
 *  T12. resolveMimeType — type="" 일 때 확장자로 MIME 타입 추론
 *  T13. resolveAssetPaths — .devoras/images 상대 경로 → asset:// 변환
 *  T14. resolveAssetPaths — _assets 상대 경로 → asset:// 변환
 *  T15. resolveAssetPaths — 절대 경로 src → workspacePath 없이 asset:// 변환
 *  T16. resolveAssetPaths — 외부 http:// URL 미변환
 */

// ─── 로직 복사 (의존성 없이 격리 실행) ──────────────────────────────────────

// ── generateImageFileName (imageUtils.ts) ───────────────────────────────────
function generateImageFileName(mimeType: string): string {
  const ext = (mimeType.split('/')[1] ?? 'png').replace('jpeg', 'jpg');
  return `img_${Date.now()}.${ext}`;
}

// ── isImageFile (BlockEditor.tsx 수정본) ────────────────────────────────────
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif', 'tiff',
]);
function isImageFile(file: { type: string; name: string }): boolean {
  if (file.type.startsWith('image/')) return true;
  if (file.type === '') {
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
  }
  return false;
}

// ── resolveMimeType (BlockEditor.tsx 수정본) ────────────────────────────────
function resolveMimeType(file: { type: string; name: string }): string {
  if (file.type !== '') return file.type;
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const MIME_MAP: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif',
    tiff: 'image/tiff',
  };
  return MIME_MAP[ext] ?? 'image/png';
}

// ── resolveAssetPaths (ReadView.tsx 수정본) ─────────────────────────────────
function resolveAssetPaths(html: string, workspacePath: string | null): string {
  if (!workspacePath) return html;
  return html.replace(
    /src="(?!https?:\/\/|asset:\/\/|data:)([^"]+)"/g,
    (_match: string, imgPath: string) => {
      if (imgPath.startsWith('/')) {
        return `src="asset://localhost${imgPath}"`;
      }
      return `src="asset://localhost${workspacePath}/${imgPath}"`;
    },
  );
}

// ── MockFileSystem.saveImageAsset ───────────────────────────────────────────
async function mockSaveImageAsset(
  _basePath: string,
  _data: Uint8Array,
  fileName: string,
  subDir: string,
): Promise<string> {
  return subDir ? `${subDir}/${fileName}` : fileName;
}

// ── saveImageAssetWithPolicy (imageAsset.ts 수정본) ─────────────────────────
type ImageSavePolicy = 'workspace-root-hidden' | 'current-file-relative' | 'custom-folder';
interface WorkspaceConfig {
  imageSavePolicy: ImageSavePolicy;
  customImageFolder?: string;
}

async function saveImageAssetWithPolicyMock(
  workspacePath: string,
  currentFilePath: string | null,
  data: Uint8Array,
  mimeType: string,
  config: WorkspaceConfig,
): Promise<string> {
  const fileName = generateImageFileName(mimeType);

  switch (config.imageSavePolicy) {
    case 'workspace-root-hidden': {
      return mockSaveImageAsset(workspacePath, data, fileName, '.devoras/images');
    }
    case 'current-file-relative': {
      if (!currentFilePath) {
        return mockSaveImageAsset(workspacePath, data, fileName, 'assets/images');
      }
      const lastSlash = Math.max(
        currentFilePath.lastIndexOf('/'),
        currentFilePath.lastIndexOf('\\'),
      );
      const currentFileDir = currentFilePath.substring(0, lastSlash);
      return mockSaveImageAsset(currentFileDir, data, fileName, '_assets');
    }
    case 'custom-folder': {
      const targetDir = config.customImageFolder ?? `${workspacePath}/assets/images`;
      // 수정: 파일명만 반환되던 버그 → 절대 경로 조립하여 반환
      const fileName2 = generateImageFileName(mimeType);
      await mockSaveImageAsset(targetDir, data, fileName2, '');
      return `${targetDir}/${fileName2}`;
    }
    default: {
      return mockSaveImageAsset(workspacePath, data, fileName, 'assets/images');
    }
  }
}

// ─── 테스트 러너 ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    const msg = detail ? `${label}\n       → ${detail}` : label;
    console.error(`  ❌ FAIL: ${msg}`);
    failures.push(label);
    failed++;
  }
}

async function runTests(): Promise<void> {
  const DUMMY_DATA = new Uint8Array([137, 80, 78, 71]);
  const WORKSPACE = '/Users/test/workspace';
  const CURRENT_FILE = '/Users/test/workspace/docs/note.md';

  console.log('\n══════════════════════════════════════════════════');
  console.log('  🧪 Image Asset Harness Test Suite  (Green Phase)');
  console.log('══════════════════════════════════════════════════\n');

  // T1: 정상 MIME 타입
  console.log('[T1] generateImageFileName — 정상 MIME 타입');
  {
    const name = generateImageFileName('image/png');
    assert('T1-a: .png 확장자', name.endsWith('.png'), name);
    assert('T1-b: img_ 접두사', name.startsWith('img_'), name);
    assert('T1-c: img_숫자.png 형식', /^img_\d+\.png$/.test(name), name);
  }

  // T2: 빈 MIME
  console.log('\n[T2] generateImageFileName — 빈 MIME type');
  {
    const name = generateImageFileName('');
    assert('T2: 빈 MIME → .png 폴백', name.endsWith('.png'), name);
  }

  // T3: jpeg → jpg
  console.log('\n[T3] generateImageFileName — image/jpeg → .jpg');
  {
    assert('T3', generateImageFileName('image/jpeg').endsWith('.jpg'));
  }

  // T4: MockFS subDir 있음
  console.log('\n[T4] mockSaveImageAsset — subDir 있음');
  {
    const r = await mockSaveImageAsset(WORKSPACE, DUMMY_DATA, 'img_1.png', '.devoras/images');
    assert('T4', r === '.devoras/images/img_1.png', r);
  }

  // T5: MockFS subDir 없음 (custom-folder 내부)
  console.log('\n[T5] mockSaveImageAsset — subDir 없음 (내부 동작)');
  {
    const r = await mockSaveImageAsset(WORKSPACE, DUMMY_DATA, 'img_1.png', '');
    assert('T5: 파일명만', r === 'img_1.png', r);
  }

  // T6: workspace-root-hidden
  console.log('\n[T6] saveImageAssetWithPolicy — workspace-root-hidden');
  {
    const r = await saveImageAssetWithPolicyMock(
      WORKSPACE, CURRENT_FILE, DUMMY_DATA, 'image/png',
      { imageSavePolicy: 'workspace-root-hidden' },
    );
    assert('T6-a: .devoras/images/ 접두사', r.startsWith('.devoras/images/'), r);
    assert('T6-b: .png', r.endsWith('.png'), r);
    console.log(`     경로: "${r}"`);
  }

  // T7: current-file-relative
  console.log('\n[T7] saveImageAssetWithPolicy — current-file-relative');
  {
    const r = await saveImageAssetWithPolicyMock(
      WORKSPACE, CURRENT_FILE, DUMMY_DATA, 'image/png',
      { imageSavePolicy: 'current-file-relative' },
    );
    assert('T7-a: _assets/ 접두사', r.startsWith('_assets/'), r);
    assert('T7-b: .png', r.endsWith('.png'), r);
    console.log(`     경로: "${r}"`);
  }

  // T8: current-file-relative null 폴백
  console.log('\n[T8] saveImageAssetWithPolicy — current-file-relative + null 폴백');
  {
    const r = await saveImageAssetWithPolicyMock(
      WORKSPACE, null, DUMMY_DATA, 'image/png',
      { imageSavePolicy: 'current-file-relative' },
    );
    assert('T8: assets/images/ 폴백', r.startsWith('assets/images/'), r);
  }

  // T9: custom-folder — 버그 수정 후 절대 경로 반환
  console.log('\n[T9] saveImageAssetWithPolicy — custom-folder 절대 경로 반환 [BUG FIXED]');
  {
    const r = await saveImageAssetWithPolicyMock(
      WORKSPACE, CURRENT_FILE, DUMMY_DATA, 'image/png',
      { imageSavePolicy: 'custom-folder', customImageFolder: '/custom/images' },
    );
    assert('T9-a: /custom/images/ 절대 경로 포함', r.startsWith('/custom/images/'), `실제: "${r}"`);
    assert('T9-b: .png', r.endsWith('.png'), r);
    console.log(`     경로: "${r}"`);
  }

  // T10: macOS 드래그 버그 수정 — isImageFile
  console.log('\n[T10] isImageFile — macOS type="" .png 파일 감지 [BUG FIXED]');
  {
    const pngFile = { type: '', name: 'screenshot.png' };
    assert('T10: type="" + .png → true', isImageFile(pngFile),
      `isImageFile({ type:"", name:"screenshot.png" }) = ${isImageFile(pngFile)}`);
  }

  // T11: isImageFile 다양한 케이스
  console.log('\n[T11] isImageFile — 다양한 케이스');
  {
    assert('T11-a: type=image/png → true', isImageFile({ type: 'image/png', name: 'a.png' }));
    assert('T11-b: type="", name=photo.jpg → true', isImageFile({ type: '', name: 'photo.jpg' }));
    assert('T11-c: type="", name=photo.jpeg → true', isImageFile({ type: '', name: 'photo.jpeg' }));
    assert('T11-d: type="", name=photo.gif → true', isImageFile({ type: '', name: 'photo.gif' }));
    assert('T11-e: type="", name=doc.pdf → false', !isImageFile({ type: '', name: 'doc.pdf' }));
    assert('T11-f: type="", name없음("") → false', !isImageFile({ type: '', name: '' }));
    assert('T11-g: type="", name=photo.PNG → true (대소문자)', isImageFile({ type: '', name: 'photo.PNG' }));
  }

  // T12: resolveMimeType
  console.log('\n[T12] resolveMimeType — type="" 확장자 추론');
  {
    assert('T12-a: .png → image/png', resolveMimeType({ type: '', name: 'a.png' }) === 'image/png');
    assert('T12-b: .jpg → image/jpeg', resolveMimeType({ type: '', name: 'a.jpg' }) === 'image/jpeg');
    assert('T12-c: .gif → image/gif', resolveMimeType({ type: '', name: 'a.gif' }) === 'image/gif');
    assert('T12-d: type 있으면 그대로', resolveMimeType({ type: 'image/webp', name: 'a.webp' }) === 'image/webp');
  }

  // T13: resolveAssetPaths — .devoras/images 상대 경로
  console.log('\n[T13] resolveAssetPaths — .devoras/images → asset://');
  {
    const html = `<img src=".devoras/images/img_1.png">`;
    const r = resolveAssetPaths(html, WORKSPACE);
    assert('T13', r.includes(`src="asset://localhost${WORKSPACE}/.devoras/images/img_1.png"`), r);
  }

  // T14: resolveAssetPaths — _assets 상대 경로
  console.log('\n[T14] resolveAssetPaths — _assets → asset://');
  {
    const html = `<img src="_assets/img_2.png">`;
    const r = resolveAssetPaths(html, WORKSPACE);
    assert('T14', r.includes(`src="asset://localhost${WORKSPACE}/_assets/img_2.png"`), r);
  }

  // T15: resolveAssetPaths — 절대 경로 src [BUG FIXED]
  console.log('\n[T15] resolveAssetPaths — 절대 경로 src → asset:// (workspacePath 중복 없음) [BUG FIXED]');
  {
    const html = `<img src="/custom/images/img_3.png">`;
    const r = resolveAssetPaths(html, WORKSPACE);
    // 절대 경로는 workspacePath를 붙이지 않음
    assert('T15-a: 절대 경로 → asset://localhost/custom/images/img_3.png', 
      r.includes(`src="asset://localhost/custom/images/img_3.png"`), r);
    // workspacePath 경로 중복이 없어야 함
    assert('T15-b: workspacePath 중복 없음', 
      !r.includes(`${WORKSPACE}/custom`), r);
  }

  // T16: resolveAssetPaths — 외부 URL 미변환
  console.log('\n[T16] resolveAssetPaths — 외부 http:// URL 미변환');
  {
    const html = `<img src="https://example.com/img.png">`;
    const r = resolveAssetPaths(html, WORKSPACE);
    assert('T16-a: https URL 유지', r.includes(`src="https://example.com/img.png"`), r);
    assert('T16-b: asset:// 미삽입', !r.includes('asset://'), r);
  }

  // ── 최종 결과 ─────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  결과: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\n  ❌ 실패한 테스트:');
    failures.forEach(f => console.log(`     - ${f}`));
  } else {
    console.log('  🎉 All tests passed! 버그 수정 완료.');
  }
  console.log('══════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Harness crashed:', err);
  process.exit(1);
});
