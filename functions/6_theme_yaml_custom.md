# Feature Ticket: 6. YML 기반 테마 커스텀 및 다크/라이트 모드
**Status**: PLANNED
**Target Release**: v0.5.5
**Priority**: Medium
**Date**: 2026-07-15

---

## 1. 개요 및 기능 목표
앱 전체의 색상 체계(에디터 배경, 마인드맵 배경, 노드 라벨, 액센트 컬러 등)를 다크/라이트 모드로 실시간 토글 전환할 수 있게 하고, 고급 사용자가 YAML 설정 파일 지정을 통해 자신만의 커스텀 테마를 직접 디자인해 적용할 수 있도록 확장성을 부여한다.

## 2. 요구 사항 및 유스케이스
- **다크/라이트 테마 원클릭 전환**: 시스템 설정에 따르거나 앱 내 토글을 통해 모드 변경.
- **YAML 테마 로드**: `theme.yml` 파일을 파싱하여 주요 CSS 변수(Primary, Panel Background, Text Color 등)를 동적으로 교체.
- **실시간 테마 적용**: 테마를 전환하거나 YAML 파일을 수정·저장 시 앱 재부팅 없이 스타일이 실시간 적용되어야 함.

## 3. 기술적 구현 설계 (FSD 아키텍처)
- **Shared Layer (`theme.ts` 및 CSS Variables)**:
  - 글로벌 `index.css`에 정의된 HSL 기반 테마 변수를 JS 단에서 유연하게 오버라이드할 수 있도록 디자인.
  - YAML 파싱 라이브러리(`js-yaml` 등) 또는 단순 YAML 파서 탑재.
- **Entities Layer (`theme/store.ts`)**:
  - 현재 활성화된 테마 스키마 정보를 저장하고 관리하는 상태 정의.

## 4. 작업 체크리스트
- [ ] Tailwind / Vanilla CSS 변수 세팅 개편 및 HSL 변수 바인딩
- [ ] 다크/라이트 모드 기본 테마 YAML 파일 사전 준비 및 로드 로직 구현
- [ ] `js-yaml` 통합 또는 자체 파서를 활용한 테마 파서 구현
- [ ] 변경된 테마 값을 HTML 문서 루트(`document.documentElement.style.setProperty`)에 동적 주입하는 기능 개발
- [ ] 사용자 커스텀 YAML 테마 설정 검증 및 실시간 반영 테스트
