# [Implement] 에디터 서식 툴바 및 이미지 자동 첨부 기능

## 🎯 1. 기능 개요 및 목적
* **설명:** 마크다운 문법을 숙지하지 못한 사용자도 직관적으로 문서 서식을 지정할 수 있도록 툴바를 제공하고, 외부 이미지 파일이나 클립보드 복사 이미지를 드래그 앤 드롭 및 붙여넣기(`Cmd+V`)로 에디터에 밀어 넣었을 때 자동으로 로컬 워크스페이스 자산 폴더(`assets/images/`)에 복사 저장하고 마크다운 이미지 링크로 변환합니다. 이를 통해 마우스 프리 및 Seamless한 마크다운 문서 편집 사용자 경험을 보장합니다.

## 📋 2. 요구 사항 (Requirements)
* [ ] **서식 적용 툴바 UI & 로직**: Bold(`**`), Italic(`*`), Strikethrough(`~~`), Link(`[]()`), Code Block(```), Table(표)을 적용해주는 툴바 컴포넌트를 에디터 상단 또는 인라인 영역에 구현합니다. 버튼 클릭 시 현재 포커스된 CodeMirror 에디터의 선택 범위에 적절한 문법 태그를 씌워줍니다.
* [ ] **클립보드 이미지 붙여넣기 (Paste)**: 에디터 내에서 `Cmd+V` 입력 시 클립보드의 바이너리 이미지 데이터를 가로채어 워크스페이스 자산 폴더(`assets/images/`) 아래에 고유한 파일명(예: `img_20260723_050839.png`)으로 자동 저장하고 에디터 커서 자리에 `![image](assets/images/filename.png)` 마크다운 태그를 인라인 삽입합니다.
* [ ] **이미지 드래그 앤 드롭 (Drag & Drop)**: 외부 탐색기 등에서 이미지 파일을 끌어다 에디터 컴포넌트 내에 놓으면(Drop), 해당 파일을 자산 폴더로 복사 저장하고 드롭된 텍스트 좌표에 마크다운 이미지 링크를 자동 삽입합니다.
* [ ] **로컬 자산 폴더 자동 생성**: 이미지 첨부 발생 시 워크스페이스 루트 하위에 `assets/images/` 디렉터리가 부재할 경우 자동으로 이를 생성(`mkdir`)하는 안전장치를 추가합니다.
* [ ] **상대 경로 로컬 이미지 시각화**: 마크다운 텍스트 내에 `assets/images/...` 형태의 상대 경로 이미지가 포함된 경우, `BlockEditor` 및 `MindView`에서 렌더링되도록 경로 변환 및 뷰 연동을 구현합니다.

## 🔄 3. 데이터 흐름 (Input & Output)
| 구분 | 타입 / 포맷 | 설명 |
| :--- | :--- | :--- |
| **Input (입력)** | `ClipboardEvent` (Paste) / `DragEvent` (Drop) / `Text Selection` (Toolbar) | 에디터에 감지된 붙여넣기 바이너리, 드롭 파일 메타데이터, 또는 텍스트 선택 범위 |
| **Output (출력)** | 마크다운 이미지 링크 문자열 삽입 / `assets/images/` 경로 내 물리 파일 저장 / UI 서식 업데이트 | 에디터 문자열 갱신 및 로컬 디렉터리 이미지 파일 저장 완료 |

## ⚙️ 4. 내부 동작 및 비즈니스 로직 (Internal Logic)
* **단계별 동작:**
  1. **자산 폴더 상태 확인**: 파일 저장 전 워크스페이스의 `assets/images/` 폴더가 존재하는지 `@tauri-apps/plugin-fs` 내 `exists`를 확인하고, 없으면 `mkdir`을 재귀 호출하여 폴더를 자동 구성합니다.
  2. **바이너리 파일 저장**:
     - 붙여넣기(`Paste`): 이벤트 객체의 `clipboardData.items`를 스캔하여 `type.indexOf('image') !== -1`인 항목에서 `Blob`을 추출합니다. 이 Blob을 `ArrayBuffer`로 변환 후 Tauri의 `writeFile`을 이용해 `assets/images/img_{timestamp}.png` 바이너리 파일로 저장합니다.
     - 드래그 앤 드롭(`Drop`): 외부 드롭된 파일 목록(`DragEvent.dataTransfer.files`)에서 이미지 파일을 걸러낸 후, Tauri API의 파일 복사(혹은 바이너리 쓰기)를 통해 자산 폴더에 새 이름으로 저장합니다.
  3. **에디터 삽입 및 상태 갱신**:
     - CodeMirror 6의 `view.dispatch` 트랜잭션을 통해 현재 에디터 커서 좌표(또는 드롭 좌표)에 `![이미지 설명](assets/images/파일명.png)` 문자열을 추가하고 스토어의 `onUpdate`를 트리거하여 문서를 저장 가능한 상태(`isDirty`)로 갱신합니다.
  4. **Tauri 2 로컬 이미지 렌더링 우회 처리 (중요)**:
     - Tauri 2의 보안 정책으로 인해 웹뷰 내부에서 `file://` 프로토콜을 사용해 로컬 이미지 경로를 직접 로드(`<img>` 태그 렌더링)하는 것이 차단됩니다.
     - 이를 해결하기 위해 Tauri 2의 `asset` 프로토콜(예: `https://asset.localhost/...` 또는 `asset://localhost/...` 기반의 경로 인코딩)을 활성화하고, 마크다운 이미지 렌더링 컴포넌트(MindView의 노드 뷰 등)가 로컬 절대 경로를 읽어 자산을 화면에 그릴 수 있도록 변환 유틸리티를 적용합니다.
* **예외 처리:**
  - 파일 시스템 에러 발생 시, 다이얼로그나 알림(Toast)을 띄우고 에디터 조작 동작을 원상복구합니다.
  - 파일명 중복 충돌을 방지하기 위해 생성되는 파일 이름 접미사에 무작위 난수나 밀리초 타임스탬프를 부여합니다.

## 🚀 5. 다음 단계 (Next Steps)
* [ ] `project/src/shared/api/fs.ts`에 로컬 이미지 에셋 파일 저장 및 복사 메서드(`saveImageAsset`) 구현
* [ ] Tauri 2 기능 정의 파일(`src-tauri/capabilities/default.json`)에 `fs` 권한 및 `asset` 프로토콜 허용 설정 추가 확인
* [ ] `project/src/widgets/BlockEditor/ui/BlockEditor.tsx` 내 CodeMirror Paste & Drop 커스텀 이벤트 바인딩 개발
* [ ] 에디터 상단 서식 툴바 컴포넌트 UI 구현 및 포커싱된 블록 에디터 뷰 대상 서식 마크다운 문자열 랩핑 동작 테스트
* [ ] `asset` 프로토콜을 이용해 자산 폴더의 로컬 이미지를 웹뷰 화면에 렌더링하는 경로 정화(Sanitization) 로직 구현 및 MindView 연동
