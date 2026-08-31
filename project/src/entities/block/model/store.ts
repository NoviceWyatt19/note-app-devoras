import { buildHeadingId, parseHeadingLine } from '@/shared/lib/headingId';

export interface EditorBlock {
  id: string;
  level: number;
  content: string;
  children: EditorBlock[];
}

const generateId = () => Math.random().toString(36).substring(2, 9);

// 헬퍼: 트리를 평면화하여 리스트로 반환
export function flattenTree(blocks: EditorBlock[]): EditorBlock[] {
  const result: EditorBlock[] = [];
  function traverse(node: EditorBlock) {
    result.push(node);
    node.children.forEach(traverse);
  }
  blocks.forEach(traverse);
  return result;
}

// ---------------------------------------------------------
// ID & Key Derivation (Legacy support for MindNode linking)
// ---------------------------------------------------------
interface DerivedKeyInfo {
  /** 매칭 키(pass 1). 헤딩은 buildHeadingId(라벨+조상경로), 텍스트 블록은 위치 기반. */
  key: string;
  /** pass 2(위치 기반 폴백)를 부모+레벨 단위로 스코프하기 위한 값. */
  parentKey: string | null;
  effectiveLevel: number;
}

function deriveBlockKey(
  content: string,
  parentKeyStack: { level: number; key: string }[],
  siblingCountMap: Record<string, number>,
): DerivedKeyInfo {
  const firstLine = content.split('\n')[0];
  const parsed = parseHeadingLine(firstLine);

  let parentKey: string | null = null;
  const effectiveLevel = parsed ? parsed.level : 999;

  for (let i = parentKeyStack.length - 1; i >= 0; i--) {
    if (parentKeyStack[i].level < effectiveLevel) {
      parentKey = parentKeyStack[i].key;
      break;
    }
  }

  if (!parsed) {
    const parentId = parentKey || 'root';
    const index = (siblingCountMap[parentId] || 0) + 1;
    siblingCountMap[parentId] = index;
    return { key: `${parentId}-textblock-${index}`, parentKey, effectiveLevel };
  }

  return { key: buildHeadingId(parsed.label, parentKey, siblingCountMap), parentKey, effectiveLevel };
}

function deriveKeysWithParentStack(contents: string[]): DerivedKeyInfo[] {
  const sibMap: Record<string, number> = {};
  const parentStack: { level: number; key: string }[] = [];
  return contents.map((content) => {
    const info = deriveBlockKey(content, parentStack, sibMap);
    const parsed = parseHeadingLine(content.split('\n')[0]);
    if (parsed) {
      while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= parsed.level) {
        parentStack.pop();
      }
      parentStack.push({ level: parsed.level, key: info.key });
    }
    return info;
  });
}
// ---------------------------------------------------------

/**
 * 평면화된 청크들을 트리 구조로 조립합니다.
 */
function buildTreeFromChunks(chunks: EditorBlock[]): EditorBlock[] {
  const roots: EditorBlock[] = [];
  const stack: EditorBlock[] = [];

  for (const node of chunks) {
    if (node.level > 0) {
      // 현재 노드가 헤딩(1~3)이면, 자신보다 깊거나 같은 레벨의 조상을 스택에서 팝
      while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }
    }
    // 텍스트 블록(level 0)은 스택을 팝하지 않고, 무조건 가장 최근의 조상에 편입

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      roots.push(node);
    }

    if (node.level > 0) {
      stack.push(node);
    }
  }

  return roots;
}

/**
 * `content`(마크다운 원문)와 재파싱 전 트리(`currentBlocks`, id 이어받기 매칭용)
 * 로부터 새 블록 트리를 계산하는 순수 함수. `setBlocksFromContent` 의 핵심
 * 로직을 store 인스턴스(zustand `set`/`get`)에서 분리해 둔 것 — REF-20260831-01
 * (Step 7-C) 의 탭 스코프 스토어가 **같은 매칭 알고리즘을 재구현하지 않고
 * 그대로 재사용**하기 위해서다. A7 의 2-패스 매칭(콘텐츠 키 → 위치 폴백 →
 * 부모키 번역 → 콘텐츠 일치 우선)은 까다롭게 검증된 로직이라 두 벌로
 * 갈라지면 그 자체가 새로운 버그의 씨앗이 된다.
 */
export function resolveBlocksFromContent(content: string, currentBlocks: EditorBlock[]): EditorBlock[] {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const newBlockContents: string[] = [];
  let currentBlockLines: string[] = [];

  let insideCodeFence = false;
  lines.forEach((line) => {
    if (/^(`{3,}|~{3,})/.test(line)) {
      insideCodeFence = !insideCodeFence;
      currentBlockLines.push(line);
      return;
    }
    // H1, H2, H3를 모두 슬라이스 경계로 판단
    if (!insideCodeFence && (line.startsWith('# ') || line.startsWith('## ') || line.startsWith('### '))) {
      if (currentBlockLines.length > 0) {
        newBlockContents.push(currentBlockLines.join('\n'));
        currentBlockLines = [];
      }
    }
    currentBlockLines.push(line);
  });

  if (currentBlockLines.length > 0) {
    newBlockContents.push(currentBlockLines.join('\n'));
  }

  if (newBlockContents.length === 0) {
    newBlockContents.push('');
  }

  const newInfo = deriveKeysWithParentStack(newBlockContents);
  const flatCurrentBlocks = flattenTree(currentBlocks); // 기존 트리를 평면화하여 ID 매칭
  const oldInfo = deriveKeysWithParentStack(flatCurrentBlocks.map((b) => b.content));

  // ── Pass 1: 콘텐츠 키(헤딩=라벨+조상경로, 텍스트=위치) 매칭 ──
  // 재정렬에 강하다 — 라벨이 그대로면 블록이 어디로 옮겨졌든 같은 키로 다시 잡힌다.
  const existingByKey = new Map<string, EditorBlock>();
  flatCurrentBlocks.forEach((b, i) => {
    if (!existingByKey.has(oldInfo[i].key)) existingByKey.set(oldInfo[i].key, b);
  });

  const usedIds = new Set<string>();
  const pass1Ids: (string | null)[] = newBlockContents.map((_, i) => {
    const existing = existingByKey.get(newInfo[i].key);
    if (existing && !usedIds.has(existing.id)) {
      usedIds.add(existing.id);
      return existing.id;
    }
    return null;
  });

  // ── Pass 2: pass 1 에서 못 잡힌 것들을 (부모, 레벨) 그룹 안에서 위치로 폴백 매칭 ──
  // A7: 헤딩 라벨만 바뀌면 콘텐츠 키가 달라져 pass 1 이 놓친다. 구조(부모·레벨)는
  // 그대로이므로, "짝 없는 old" 와 "짝 없는 new" 를 부모+레벨로 묶어 만난 순서대로
  // 대응시키면 — 보통 이 그룹엔 편집된 블록 하나만 남으므로 — 그 옛 id 를 물려받는다.
  // 재정렬은 이미 pass 1 에서 라벨로 잡히므로 여기까지 오지 않는다: pass 2 는
  // "내용이 실제로 바뀐" 경우에만 동작한다.
  const leftoverOldByGroup = new Map<string, { block: EditorBlock; oldKey: string }[]>();
  flatCurrentBlocks.forEach((b, i) => {
    if (usedIds.has(b.id)) return;
    const info = oldInfo[i];
    const groupKey = `${info.parentKey ?? 'root'}::${info.effectiveLevel}`;
    const entry = { block: b, oldKey: info.key };
    const bucket = leftoverOldByGroup.get(groupKey);
    if (bucket) bucket.push(entry);
    else leftoverOldByGroup.set(groupKey, [entry]);
  });

  // A7(중첩 케이스, project-1f 발견): 부모 헤딩이 라벨 변경으로 pass 2 에서만
  // 매칭됐다면, 그 자식들은 pass 1(조상경로에 옛 라벨이 남아 있어 미스)·pass 2
  // (부모 그룹키가 새 라벨이라 미스) 양쪽에서 다 놓쳐 undo 히스토리를 잃는다.
  // deriveKeysWithParentStack 이 문서 순서로 훑으므로 부모는 항상 자식보다
  // 먼저 처리된다 — 부모가 pass 2 로 매칭되는 순간 "새 부모키 -> 옛 부모키"
  // 번역을 기록해 두면, 뒤따르는 자식이 그룹키를 조회하기 전에 이미 준비돼 있다.
  const parentKeyTranslation = new Map<string, string>();

  const flatChunks: EditorBlock[] = newBlockContents.map((blockText, i) => {
    let id = pass1Ids[i];
    if (id === null) {
      const info = newInfo[i];
      const normalizedParent = info.parentKey ?? 'root';
      const translatedParent = parentKeyTranslation.get(normalizedParent) ?? normalizedParent;
      const groupKey = `${translatedParent}::${info.effectiveLevel}`;
      const bucket = leftoverOldByGroup.get(groupKey);

      // Pass 2a: 그룹 안에서 콘텐츠가 완전히 같은 후보를 우선한다(project-1f
      // 발견 — 부모 리네임과 자식 재정렬이 같은 재파싱에서 동시에 일어나면,
      // 순서로만 매칭하는 shift() 는 두 자식의 id 를 서로 맞바꿔 버린다:
      // A1 의 EditorView 가 A2 의 undo 히스토리를 갖게 되는 등, 리마운트보다
      // 나쁜 실수 연결이 된다. 콘텐츠 일치가 순번보다 강한 증거이므로 먼저 찾는다.
      // 끝에서 두 번째 줄 이후를 잘라 비교하는 이유: 마지막 블록은 뒤따르는
      // 빈 줄이 없어 join 시 트레일링 개행이 안 붙는 반면, 같은 블록이 중간
      // 위치로 옮겨가면 붙는다 — 순수 위치 차이일 뿐인데 다른 문자열이 된다.
      // Pass 2b: 그래도 못 찾으면(=콘텐츠도 실제로 바뀜) 예전처럼 위치(순번)로 폴백한다.
      let candidate: { block: EditorBlock; oldKey: string } | undefined;
      if (bucket) {
        const normalize = (s: string) => s.replace(/\n+$/, '');
        const normalizedBlockText = normalize(blockText);
        const exactIdx = bucket.findIndex((entry) => normalize(entry.block.content) === normalizedBlockText);
        candidate = exactIdx >= 0 ? bucket.splice(exactIdx, 1)[0] : bucket.shift();
      }

      if (candidate) {
        id = candidate.block.id;
        if (info.key !== candidate.oldKey) {
          parentKeyTranslation.set(info.key, candidate.oldKey);
        }
      } else {
        id = generateId();
      }
    }

    // 레벨 계산
    const firstLine = blockText.split('\n')[0];
    let level = 0;
    if (firstLine.startsWith('# ')) level = 1;
    else if (firstLine.startsWith('## ')) level = 2;
    else if (firstLine.startsWith('### ')) level = 3;

    return { id, level, content: blockText, children: [] };
  });

  // 트리를 빌드하여 반환
  return buildTreeFromChunks(flatChunks);
}
