import { WorkspaceConfig } from '@/entities/workspace/model/types';
import { fileSystemRepository } from '@/shared/api/fs';
import { generateImageFileName } from '@/shared/lib/imageUtils';

/**
 * 정책(WorkspaceConfig.imageSavePolicy)에 따라 이미지 저장 타겟 경로와
 * 마크다운에 삽입할 상대 경로를 결정하여 실제로 파일을 저장합니다.
 *
 * @param workspacePath  현재 열린 워크스페이스 절대 경로
 * @param currentFilePath  현재 편집 중인 파일의 절대 경로 (`current-file-relative` 정책에서 사용)
 * @param data           저장할 이미지 바이너리 (Uint8Array)
 * @param mimeType       이미지 MIME 타입 (예: "image/png")
 * @param config         워크스페이스 설정 객체
 * @returns              CodeMirror에 삽입할 마크다운 이미지 링크 경로 (상대 경로 또는 절대 경로)
 */
export async function saveImageAssetWithPolicy(
  workspacePath: string,
  currentFilePath: string | null,
  data: Uint8Array,
  mimeType: string,
  config: WorkspaceConfig,
): Promise<string> {
  const fileName = generateImageFileName(mimeType);

  switch (config.imageSavePolicy) {
    // ── 1. 워크스페이스 루트 숨김 폴더 (기본값) ────────────────────────────
    // 저장: {workspacePath}/.devoras/images/{fileName}
    // 마크다운 경로: .devoras/images/{fileName}
    case 'workspace-root-hidden': {
      const relativePath = await fileSystemRepository.saveImageAsset(
        workspacePath,
        data,
        fileName,
        '.devoras/images',
      );
      return relativePath;
    }

    // ── 2. 현재 파일 상대 위치 저장 ────────────────────────────────────────
    // 저장: {currentFileDir}/_assets/{fileName}
    // 마크다운 경로: _assets/{fileName}
    case 'current-file-relative': {
      if (!currentFilePath) {
        // 파일 경로를 알 수 없을 경우 기본 정책으로 폴백
        return fileSystemRepository.saveImageAsset(workspacePath, data, fileName, 'assets/images');
      }
      const lastSlash = Math.max(
        currentFilePath.lastIndexOf('/'),
        currentFilePath.lastIndexOf('\\'),
      );
      const currentFileDir = currentFilePath.substring(0, lastSlash);

      const relativePath = await fileSystemRepository.saveImageAsset(
        currentFileDir,
        data,
        fileName,
        '_assets',
      );
      return relativePath;
    }

    // ── 3. 사용자 지정 커스텀 폴더 ─────────────────────────────────────────
    // 저장: {customImageFolder}/{fileName}
    // 마크다운 경로: {customImageFolder}/{fileName} (절대 경로)
    // ReadView의 resolveAssetPaths가 절대 경로도 asset:// 로 변환하므로 정상 작동.
    case 'custom-folder': {
      const targetDir = config.customImageFolder ?? `${workspacePath}/assets/images`;
      // subDir='' 로 호출하면 파일명만 반환되므로, 절대 경로를 직접 조립한다.
      const fileName2 = generateImageFileName(mimeType);
      await fileSystemRepository.saveImageAsset(targetDir, data, fileName2, '');
      // 마크다운에 삽입할 경로: 절대 경로 (ReadView에서 asset:// 변환 처리)
      return `${targetDir}/${fileName2}`;
    }

    default: {
      // 알 수 없는 정책 → 안전한 기본값으로 폴백
      return fileSystemRepository.saveImageAsset(workspacePath, data, fileName, 'assets/images');
    }
  }
}
