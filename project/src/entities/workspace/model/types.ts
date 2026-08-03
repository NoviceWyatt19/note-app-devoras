/**
 * 이미지 저장 정책 타입
 *
 * - `workspace-root-hidden` : 워크스페이스 루트의 `.devoras/images/` 숨김 폴더에 저장 (기본값)
 * - `current-file-relative` : 현재 편집 중인 파일 옆에 `_assets/` 폴더를 생성하여 저장
 * - `custom-folder`         : 사용자가 직접 지정한 절대 경로에 저장
 */
export type ImageSavePolicy =
  | 'workspace-root-hidden'
  | 'current-file-relative'
  | 'custom-folder';

/**
 * 워크스페이스 전역 설정 객체
 *
 * @field imageSavePolicy  이미지 첨부 시 저장 위치 결정 정책
 * @field customImageFolder  `custom-folder` 정책 선택 시 사용할 절대 경로
 */
export interface WorkspaceConfig {
  imageSavePolicy: ImageSavePolicy;
  /** `custom-folder` 정책에서만 사용. 그 외 정책에서는 무시된다. */
  customImageFolder?: string;
}

/** 워크스페이스 설정의 기본값 */
export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  imageSavePolicy: 'workspace-root-hidden',
};
