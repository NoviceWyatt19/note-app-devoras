/**
 * image_asset_harness.mjs
 *
 * 이미지 첨부 기능의 핵심 로직을 검증하는 격리형 하네스 테스트 (순수 Node.js)
 * 실행: node src/shared/lib/fs/__tests__/image_asset_harness.mjs
 *
 * 검증 항목:
 *  T1. generateImageFileName — 정상 MIME 처리
 *  T2. generateImageFileName — 빈 MIME type (macOS 드래그 버그 케이스)
 *  T3. generateImageFileName — jpeg → jpg 변환
 *  T4. MockFileSystem.saveImageAsset — subDir 있을 때 상대경로 반환
 *  T5. MockFileSystem.saveImageAsset — subDir 없을 때 파일명만 반환 (custom-folder 버그)
 *  T6. saveImageAssetWithPolicy — workspace-root-hidden 정책
 *  T7. saveImageAssetWithPolicy — current-file-relative 정책
 *  T8. saveImageAssetWithPolicy — current-file-relative, currentFilePath null 폴백
 *  T9. saveImageAssetWithPolicy — custom-folder 정책 반환값 검증 (버그 재현)
 *  T10. macOS 드래그 버그 재현 — file.type === "" 이미지 감지 실패
 *  T11. isImageFileFixed — 확장자 폴백 감지 (수정 후 통과 예상)
 *  T12. resolveAssetPaths — .devoras/images 경로 asset:// 변환
 *  T13. resolveAssetPaths — _assets 경로 asset:// 변환
 *  T14. resolveAssetPaths — 외부 http:// URL 미변환
 */

// ── generateImageFileName (imageUtils.ts 로직 복사) ─────────────────────────
function generateImageFileName(mimeType) {
  const ext = (mimeType.split('/')[1] ?? 'png').replace('jpeg', 'jpg');
  return `img_${Date.now()}.${ext}`;
}

// ── resolveAssetPaths (ReadView.tsx 로직 복사) ──────────────────────────────
function resolveAssetPaths(html, workspacePath) {
  if (!workspacePath) return html;
  return html.replace(
    /src="(?!https?:\/\/|asset:\/\/|data:)([^"]+)"/g,
    (_match, relativePath) =>
      `src="asset://localhost${workspacePath}/${relativePath}"`,
  );
}

// ── 이미지 감지 로직 ─────────────────────────────────────────────────────────
// 현재(버그 있는) 로직:
function isImageFileBuggy(file) {
  return file.type.startsWith('image/');
}

// 수정된 로직 (확장자 폴백 포함):
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif', 'tiff']);
function isImageFileFixed(file) {
  if (file.type.startsWith('image/')) return true;
  if (file.type === '' && file.name) {
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
  }
  return false;
}

// ── MockFileSystem.saveImageAsset (fs.ts 로직 복사) ─────────────────────────
async function mockSaveImageAsset(_basePath, _data, fileName, subDir) {
  const relativePath = subDir ? `${subDir}/${fileName}` : fileName;
  return relativePath;
}

// ── saveImageAssetWithPolicy (imageAsset.ts 로직 복사) ──────────────────────
async function saveImageAssetWithPolicyMock(workspacePath, currentFilePath, data, mimeType, config) {
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
      return mockSaveImageAsset(targetDir, data, fileName, '');
    }
    default: {
      return mockSaveImageAsset(workspacePath, data, fileName, 'assets/images');
    }
  }
}

// ─── 테스트 러너 ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
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

async function runTests() {
  const DUMMY_DATA = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes
  const WORKSPACE = '/Users/test/workspace';
  const CURRENT_FILE = '/Users/test/workspace/docs/note.md';

  console.log('\n══════════════════════════════════════════════════');
  console.log('  🧪 Image Asset Harness Test Suite  (Red Phase)');
  console.log('══════════════════════════════════════════════════\n');

  // ── T1: 정상 MIME 타입 파일명 생성 ──────────────────────────────────────
  console.log('[T1] generateImageFileName — 정상 MIME 타입 처리');
  {
    const name = generateImageFileName('image/png');
    assert('T1-a: .png 확장자', name.endsWith('.png'), `실제: ${name}`);
    assert('T1-b: img_ 접두사', name.startsWith('img_'), `실제: ${name}`);
    assert('T1-c: 형식 유효 (img_숫자.png)', /^img_\d+\.png$/.test(name), `실제: ${name}`);
  }

  // ── T2: 빈 MIME 타입 (macOS Finder 드래그 시 발생) ───────────────────────
  console.log('\n[T2] generateImageFileName — 빈 MIME type (macOS 드래그 케이스 핵심)');
  {
    // ''.split('/') = [''] → [1] = undefined → ?? 'png' → ext = 'png'
    // 즉 파일명 생성 자체는 올바름 (.png 반환)
    // 문제는 이 함수에 도달하기 전에 isImageFile 감지 단계에서 이미 걸러짐!
    const name = generateImageFileName('');
    assert('T2: 빈 MIME → .png 폴백 (파일명 생성은 올바름)', name.endsWith('.png'), `실제: ${name}`);
    console.log(`     ℹ️  generateImageFileName 자체는 올바름. 문제는 이미지 감지 단계 (T10 참조)`);
  }

  // ── T3: jpeg → jpg 변환 ──────────────────────────────────────────────────
  console.log('\n[T3] generateImageFileName — image/jpeg → .jpg');
  {
    const name = generateImageFileName('image/jpeg');
    assert('T3: jpeg → .jpg 변환', name.endsWith('.jpg'), `실제: ${name}`);
  }

  // ── T4: MockFileSystem.saveImageAsset — subDir 있을 때 ───────────────────
  console.log('\n[T4] MockFileSystem.saveImageAsset — subDir 있을 때 상대경로 반환');
  {
    const result = await mockSaveImageAsset(WORKSPACE, DUMMY_DATA, 'img_123.png', '.devoras/images');
    assert('T4: .devoras/images/img_123.png', result === '.devoras/images/img_123.png', `실제: ${result}`);
  }

  // ── T5: MockFileSystem.saveImageAsset — subDir 없을 때 ───────────────────
  console.log('\n[T5] MockFileSystem.saveImageAsset — subDir 빈 문자열 (custom-folder 버그 확인)');
  {
    const result = await mockSaveImageAsset(WORKSPACE, DUMMY_DATA, 'img_123.png', '');
    // 현재 구현에서 subDir='' → 파일명만 반환 → 마크다운에서 이미지 못찾음
    assert(
      'T5: subDir="" → 파일명만 반환됨 (BUG 확인: ReadView에서 이미지 로드 불가)',
      result === 'img_123.png',
      `실제: "${result}"`
    );
    console.log(`     ⚠️  BUG: "${result}"만 삽입되면 ReadView가 이미지를 못 찾음`);
  }

  // ── T6: workspace-root-hidden 정책 ──────────────────────────────────────
  console.log('\n[T6] saveImageAssetWithPolicy — workspace-root-hidden 정책 (기본값)');
  {
    const result = await saveImageAssetWithPolicyMock(
      WORKSPACE, CURRENT_FILE, DUMMY_DATA, 'image/png',
      { imageSavePolicy: 'workspace-root-hidden' },
    );
    assert('T6-a: .devoras/images/ 접두사', result.startsWith('.devoras/images/'), `실제: ${result}`);
    assert('T6-b: .png 확장자', result.endsWith('.png'), `실제: ${result}`);
    console.log(`     경로: "${result}"`);
  }

  // ── T7: current-file-relative 정책 ──────────────────────────────────────
  console.log('\n[T7] saveImageAssetWithPolicy — current-file-relative 정책');
  {
    const result = await saveImageAssetWithPolicyMock(
      WORKSPACE, CURRENT_FILE, DUMMY_DATA, 'image/png',
      { imageSavePolicy: 'current-file-relative' },
    );
    assert('T7-a: _assets/ 접두사', result.startsWith('_assets/'), `실제: ${result}`);
    assert('T7-b: .png 확장자', result.endsWith('.png'), `실제: ${result}`);
    console.log(`     경로: "${result}"`);
  }

  // ── T8: current-file-relative + null 파일 경로 폴백 ─────────────────────
  console.log('\n[T8] saveImageAssetWithPolicy — current-file-relative, filePath=null 폴백');
  {
    const result = await saveImageAssetWithPolicyMock(
      WORKSPACE, null, DUMMY_DATA, 'image/png',
      { imageSavePolicy: 'current-file-relative' },
    );
    assert('T8: null → assets/images/ 폴백', result.startsWith('assets/images/'), `실제: ${result}`);
    console.log(`     경로: "${result}"`);
  }

  // ── T9: custom-folder 정책 — BUG 재현 ───────────────────────────────────
  console.log('\n[T9] saveImageAssetWithPolicy — custom-folder 정책 (BUG 재현)');
  {
    const result = await saveImageAssetWithPolicyMock(
      WORKSPACE, CURRENT_FILE, DUMMY_DATA, 'image/png',
      { imageSavePolicy: 'custom-folder', customImageFolder: '/custom/images' },
    );
    // 기대: '/custom/images/img_xxx.png' (절대 경로 포함)
    // 실제: 'img_xxx.png' (파일명만) ← BUG
    const isBugReproduced = !result.startsWith('/custom/images');
    assert(
      'T9: [BUG 재현] custom-folder → 절대경로 없이 파일명만 반환됨',
      isBugReproduced,
      `실제: "${result}" (기대: /custom/images/img_xxx.png 또는 이를 포함한 경로)`
    );
    if (isBugReproduced) {
      console.log(`     ❌ BUG: "${result}"만 반환 — ReadView에서 이미지 절대 경로로 변환 불가`);
    }
  }

  // ── T10: macOS 드래그 버그 재현 — 핵심 버그 ─────────────────────────────
  console.log('\n[T10] 핵심 BUG 재현 — macOS Finder 드래그 시 .png 파일 타입="" 로 감지 실패');
  {
    // macOS에서 Finder에서 직접 드래그 시 File.type이 "" 반환됨
    const mockPngFile = { type: '', name: 'screenshot.png' };
    const buggyResult = isImageFileBuggy(mockPngFile);
    const fixedResult = isImageFileFixed(mockPngFile);

    assert(
      'T10-a: [BUG 재현] 현재 로직 → .png 파일 타입="" 로 이미지 감지 FAIL',
      !buggyResult,
      `type="${mockPngFile.type}" → startsWith("image/") = ${buggyResult}`
    );
    assert(
      'T10-b: [수정 예상] 확장자 폴백 로직 → .png 감지 SUCCESS',
      fixedResult,
      `isImageFileFixed = ${fixedResult}`
    );
    console.log(`     현재 코드: ''.startsWith('image/') = ${buggyResult} → drop 이벤트 무시됨!`);
    console.log(`     수정 코드: 확장자 폴백 = ${fixedResult} → drop 처리됨`);
  }

  // ── T11: isImageFileFixed — 다양한 케이스 ───────────────────────────────
  console.log('\n[T11] isImageFileFixed — 다양한 케이스 검증');
  {
    assert('T11-a: type=image/png → true', isImageFileFixed({ type: 'image/png' }), '');
    assert('T11-b: type="", name=photo.jpg → true', isImageFileFixed({ type: '', name: 'photo.jpg' }), '');
    assert('T11-c: type="", name=photo.jpeg → true', isImageFileFixed({ type: '', name: 'photo.jpeg' }), '');
    assert('T11-d: type="", name=photo.gif → true', isImageFileFixed({ type: '', name: 'photo.gif' }), '');
    assert('T11-e: type="", name=doc.pdf → false', !isImageFileFixed({ type: '', name: 'doc.pdf' }), '');
    assert('T11-f: type="", name없음 → false', !isImageFileFixed({ type: '' }), '');
    assert('T11-g: type="", name=photo.PNG → true (대소문자 무관)', isImageFileFixed({ type: '', name: 'photo.PNG' }), '');
  }

  // ── T12: resolveAssetPaths — .devoras/images 경로 변환 ───────────────────
  console.log('\n[T12] resolveAssetPaths — .devoras/images → asset:// 변환');
  {
    const html = `<img src=".devoras/images/img_123.png">`;
    const resolved = resolveAssetPaths(html, WORKSPACE);
    const expected = `src="asset://localhost${WORKSPACE}/.devoras/images/img_123.png"`;
    assert('T12: .devoras/images 변환 성공', resolved.includes(expected), `실제: ${resolved}`);
  }

  // ── T13: resolveAssetPaths — _assets 경로 변환 ──────────────────────────
  console.log('\n[T13] resolveAssetPaths — _assets → asset:// 변환');
  {
    const html = `<img src="_assets/img_456.png">`;
    const resolved = resolveAssetPaths(html, WORKSPACE);
    const expected = `src="asset://localhost${WORKSPACE}/_assets/img_456.png"`;
    assert('T13: _assets 변환 성공', resolved.includes(expected), `실제: ${resolved}`);
  }

  // ── T14: resolveAssetPaths — 외부 URL 미변환 ────────────────────────────
  console.log('\n[T14] resolveAssetPaths — 외부 http:// URL은 변환 안됨');
  {
    const html = `<img src="https://example.com/photo.png">`;
    const resolved = resolveAssetPaths(html, WORKSPACE);
    assert('T14-a: https URL 유지', resolved.includes(`src="https://example.com/photo.png"`), `실제: ${resolved}`);
    assert('T14-b: asset:// 미삽입', !resolved.includes('asset://'), `실제: ${resolved}`);
  }

  // ── 최종 결과 ─────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  결과: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\n  ❌ 실패한 테스트 목록:');
    failures.forEach(f => console.log(`     - ${f}`));
  } else {
    console.log('  🎉 All tests passed!');
  }
  console.log('══════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Harness runner crashed:', err);
  process.exit(1);
});
