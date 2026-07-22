# 9. H1 루트 계층 파싱 및 중첩 컨테이너(Nested Box) 뷰 기능 명세

## 🎯 1. 기능 개요 및 목적
- **개요**: Markdown의 `# H1` 헤딩을 문서의 최상위 루트 노드(Root Block)로 지정하고 `## H2` 이하 노드들을 하위 계층 트어로 구조화한다. 또한 traditional한 마인드 트리 뷰(`tree`)뿐만 아니라 상위 노드가 하위 노드를 영역 박스(Container/Boundary) 형태로 감싸는 **중첩 컨테이너 뷰(`nested-container`)** 시각화 옵션을 제공한다.
- **목적**: 개발자 및 시스템 아키텍트가 아키텍처 구조도, 도메인 경계(Bounded Context), 모듈 포섭 관계를 텍스트 작성만으로 직관적으로 시각화하고 빠르게 뷰 모드를 전환할 수 있도록 지원한다.

---

## 📋 2. 핵심 기능 요약

1. **H1 최상위 루트 노드 계층화**
   - `# H1`: 전체 캔버스/문서 영역의 Root Container Node 역할.
   - `## H2` ~ `###### H6`: 상위 헤딩 노드에 귀속되는 Child Sub-tree Node.
   - H1이 없을 경우: 묵시적 Root Node(파일명 등)를 자동 생성하여 H2 노드 매핑.

2. **마인드 뷰 레이아웃 모드 전환 (Layout Mode Switcher)**
   - **Tree View Mode (`tree`)**: 노드 간 선(Edge)으로 연결되는 전통적 브레인스토밍/지식 지도 뷰.
   - **Nested Container View Mode (`nested-container`)**: 상위 노드가 하위 노드를 내부 Box 영역으로 내포하는 아키텍처/모듈 구조도 뷰.

---

## 📐 3. 아키텍처 및 인터페이스 명세

### (1) Document AST 노드 타입 명세
```typescript
export interface HeadingNode {
  id: string;                // 노드 고유 식별자
  level: number;             // 1 (H1 Root), 2 (H2 Main Node), 3~6 (Sub Nodes)
  title: string;             // 헤딩 텍스트
  contentBlockIds: string[]; // 해당 헤딩 하위의 본문 에디터 블록 ID 목록
  parentId: string | null;   // 부모 노드 ID (H1은 null)
  childrenIds: string[];     // 하위 헤딩 노드 ID 목록
  spatial?: {                // X, Y 공간 좌표 메타데이터
    x: number;
    y: number;
    width?: number;          // nested-container 전용 영역 크기
    height?: number;
  };
}

export interface DocumentAst {
  rootNodes: HeadingNode[];  // H1 기반 최상위 노드 목록
  diagnostics: ParseDiagnostic[];
}
```

### (2) UI 스토어 및 렌더러 스위칭 인터페이스
```typescript
export type MindViewLayoutMode = 'tree' | 'nested-container';

export interface MindViewUiState {
  layoutMode: MindViewLayoutMode; // 기본값: 'tree'
  zoomLevel: number;
  selectedNodeId: string | null;
}

export interface MindViewRendererProps {
  ast: DocumentAst;
  layoutMode: MindViewLayoutMode;
  onNodeCoordinateChange: (nodeId: string, x: number, y: number) => void;
}
```

---

## 🚀 4. 단계별 실행 로드맵
- [ ] **Phase 1**: 파서 내 `H1` 루트 그룹화 및 `H2` 하위 트리 노드 계층화 적용.
- [ ] **Phase 2**: UI 상단에 마인드 뷰 레이아웃 모드 스위처 툴바 항목 추가 (`tree` | `nested-container`).
- [ ] **Phase 3**: SVG/DOM 기반 중첩 박스(Nested Box Boundary) 렌더링 컴포넌트 연동.
