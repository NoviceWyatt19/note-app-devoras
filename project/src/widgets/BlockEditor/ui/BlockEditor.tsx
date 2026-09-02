import React, { useEffect, useRef} from 'react';
import { EditorBlock, flattenTree } from '@/entities/block/model/store';
import { useDocumentStore, TabItem } from '@/entities/document/model/store';
import { useEffectiveTabStore } from '@/entities/document/model/useEffectiveTabStore';
import { useDebouncedCallback } from '@/shared/lib/useDebouncedCallback';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { EditorState, Transaction, Compartment } from '@codemirror/state';
import { EditorView, keymap, drawSelection} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';
import { useSettingsStore } from '@/entities/settings/model/store';
import { computeMinimalChange } from '@/shared/lib/editor/minimalDiff';
import { decideCaretAction } from '@/shared/lib/editor/caretCoordinator';

const lineWrappingCompartment = new Compartment();
const editorThemeCompartment = new Compartment();

import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { LanguageDescription } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { FileEdit } from 'lucide-react';
import { FormatToolbar } from './FormatToolbar';
import { ReadView, renderBlockToHtml } from './ReadView';




import { registerEditorView, unregisterEditorView, reportCaretFocus, getActiveEditorView } from '@/shared/lib/editorViewRegistry';
import { useTauriInputManager } from '@/shared/lib/editor/useTauriInputManager';
import { useImeInputManager } from '@/shared/lib/editor/useImeInputManager';
import { createImeIsolationExtension } from '@/shared/lib/editor/extensions/ImeIsolation';

import { saveImageAssetWithPolicy } from '@/shared/lib/fs/imageAsset';
import { createDecorationPlugin } from '@/shared/lib/editor/decorators/orchestrator';
import { BoldItalicDecorator } from '@/shared/lib/editor/decorators/impl/BoldItalicDecorator';
import { StrikethroughDecorator } from '@/shared/lib/editor/decorators/impl/StrikethroughDecorator';
import { CheckboxDecorator } from '@/shared/lib/editor/decorators/impl/CheckboxDecorator';
import { CodeBlockDecorator, codeBlockInteractionPlugin } from '@/shared/lib/editor/decorators/impl/CodeBlockDecorator';
import { LatexDecorator } from '@/shared/lib/editor/decorators/impl/LatexDecorator';
import { HyperlinkDecorator } from '@/shared/lib/editor/decorators/impl/HyperlinkDecorator';
import { ImageDecorator } from '@/shared/lib/editor/decorators/impl/ImageDecorator';
import { HeadingDecorator } from '@/shared/lib/editor/decorators/impl/HeadingDecorator';
import { ListDecorator } from '@/shared/lib/editor/decorators/impl/ListDecorator';
import { BlockquoteDecorator } from '@/shared/lib/editor/decorators/impl/BlockquoteDecorator';
import { HorizontalRuleDecorator } from '@/shared/lib/editor/decorators/impl/HorizontalRuleDecorator';
import { CustomSymbolDecorator } from '@/shared/lib/editor/decorators/impl/CustomSymbolDecorator';
import { TableDecorator, tableInteractionPlugin, tableKeymap } from '@/shared/lib/editor/decorators/impl/TableDecorator';
import { parseCodeFenceInfo } from '@/shared/lib/markdown/codeFenceInfo';

/** CodeMirror 마크다운 파서는 코드펜스 info 문자열을 공백까지만 잘라 언어를 찾는다.
 *  따라서 Devoras 확장 문법(```lang|title|="제목")을 그대로 넘기면 언어 매칭이 실패하거나
 *  제목 안의 확장자에 퍼지 매칭되어 엉뚱한 언어로 하이라이팅된다.
 *  info 를 먼저 파싱해 순수 언어 이름만 넘긴다. */
const matchFenceLanguage = (info: string) => {
  const { lang } = parseCodeFenceInfo(info);
  return lang ? LanguageDescription.matchLanguageName(languages, lang, true) : null;
};

const markdownDecorationPlugin = createDecorationPlugin([
  new BoldItalicDecorator(),
  new StrikethroughDecorator(),
  new CheckboxDecorator(),
  new CodeBlockDecorator(),
  new LatexDecorator(),
  new HyperlinkDecorator(),
  new ImageDecorator(),
  new HeadingDecorator(),
  new ListDecorator(),
  new BlockquoteDecorator(),
  new HorizontalRuleDecorator(),
  new CustomSymbolDecorator(),
  new TableDecorator(),
]);

interface CodeMirrorBlockProps {
  paneId: string;
  block: EditorBlock;
  isFocused: boolean;
  focusOffset: number;
  /** BUG-20260831-01 — focusOffset 이 새 캐럿 명령인지 판정하는 토큰. */
  focusToken: number;
  onUpdate: (content: string, cursorOffset: number) => void;
  onMerge: () => void;
  onFocusPrev: () => void;
  onFocusNext: () => void;
}

function createEditorTheme(settingsEditor: any) {
  return EditorView.theme({
    '&': { background: 'transparent !important', height: 'auto' },
    '.cm-scroller': {
      fontFamily: settingsEditor.fontFamily,
      fontSize: `${settingsEditor.fontSize}px`,
      overflow: 'hidden',
      minWidth: '0',
    },
    '.cm-content': { caretColor: '#6366f1', padding: '4px 0', minWidth: '0' },
    '.cm-line': { padding: '0 4px' },
    '.cm-line > span:not([class*="cm-"])': {
      fontSize: 'inherit',
      lineHeight: 'inherit',
      verticalAlign: 'baseline',
    },
    '.cm-widgetBuffer': { fontSize: 'inherit' },
    '&.cm-focused .cm-cursor': { borderLeftColor: '#6366f1' },
    '&.cm-focused': { outline: 'none' },
  });
}

const CodeMirrorBlock = React.memo<CodeMirrorBlockProps>(function CodeMirrorBlock({
  paneId,
  block,
  isFocused,
  focusOffset,
  focusToken,
  onUpdate,
  onMerge,
  onFocusPrev,
  onFocusNext,
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacksRef = useRef({ onFocusPrev, onFocusNext, onMerge, onUpdate, paneId, blockId: block.id });
  // BUG-20260831-01 — 이 블록 인스턴스가 마지막으로 "반영한" 캐럿 명령의 토큰.
  // 마운트 시점의 focusToken 으로 시작한다: EditorState.create(아래)가 이미
  // 그 시점의 focusOffset 으로 초기 캐럿을 심어 두므로, 조정자가 첫 실행에서
  // 그걸 "새 명령"으로 오판해 또 옮기지 않게 한다.
  const consumedFocusTokenRef = useRef(focusToken);

  const { settings } = useSettingsStore();

  useEffect(() => {
    callbacksRef.current = { onFocusPrev, onFocusNext, onMerge, onUpdate, paneId, blockId: block.id };
  });

  const isImeComposingRef = useImeInputManager();

  // 설정 변경 시 컴파트먼트 재구성
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: [
        lineWrappingCompartment.reconfigure(settings.editor.lineWrapping ? EditorView.lineWrapping : []),
        editorThemeCompartment.reconfigure(createEditorTheme(settings.editor))
      ]
    });
  }, [settings.editor.lineWrapping, settings.editor.fontFamily, settings.editor.fontSize]);

  React.useLayoutEffect(() => {
    if (!containerRef.current) return;

    const blockKeymap = keymap.of([
      {
        key: 'Backspace',
        run: (view) => {
          if (view.composing) return false;
          const { from, empty } = view.state.selection.main;
          if (empty && from === 0) {
            callbacksRef.current.onMerge();
            return true;
          }
          return false;
        },
      },
      {
        key: 'ArrowUp',
        run: (view) => {
          if (view.composing) return false;
          const { from, empty } = view.state.selection.main;
          if (empty && from === 0) {
            callbacksRef.current.onFocusPrev();
            return true;
          }
          return false;
        },
      },
      {
        key: 'ArrowDown',
        run: (view) => {
          if (view.composing) return false;
          const { from, empty } = view.state.selection.main;
          if (empty && from === view.state.doc.length) {
            callbacksRef.current.onFocusNext();
            return true;
          }
          return false;
        },
      },
      { key: 'Tab', run: indentMore },
      { key: 'Shift-Tab', run: indentLess },
    ]);

    const state = EditorState.create({
      doc: block.content,
      selection: { anchor: Math.min(focusOffset, block.content.length) },
      extensions: [
        markdown({ codeLanguages: matchFenceLanguage }),
        lineWrappingCompartment.of(settings.editor.lineWrapping ? EditorView.lineWrapping : []),
        oneDark,
        history(),
        drawSelection(),
        // blockKeymap 이 defaultKeymap 보다 먼저 와야 한다: cursorDown/cursorUp 은
        // 문서 경계에서도 항상 true 를 반환하므로, defaultKeymap 이 먼저 오면
        // 블록 간 이동(ArrowUp/ArrowDown)이 경계에 도달해도 절대 발동하지 않는다.
        blockKeymap,
        tableKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdownDecorationPlugin,
        codeBlockInteractionPlugin,
        tableInteractionPlugin,
        createImeIsolationExtension(),
        EditorView.updateListener.of((update) => {
          if (update.focusChanged && update.view.hasFocus) {
            reportCaretFocus(callbacksRef.current.paneId, callbacksRef.current.blockId);
          }

          if (!update.docChanged) return;

          if (isImeComposingRef.current || update.view.composing) return;

          const isExternal = update.transactions.some(
            tr => tr.annotation(Transaction.userEvent) === 'external'
          );
          if (isExternal) return;

          callbacksRef.current.onUpdate(
            update.state.doc.toString(),
            update.state.selection.main.anchor,
          );
        }),
        editorThemeCompartment.of(createEditorTheme(settings.editor)),
      ],
    });

    // G1 계측(A7 DoD 측정 수단): 개발 빌드에서 EditorView 생성/파괴를 블록 id 로
    // 로깅한다. 제목만 편집했는데 그 블록 id 에 대해 파괴 로그가 찍히면 리마운트가
    // 일어났다는 뜻 — id 가 여전히 내용(라벨)에서 파생되고 있다는 신호다.
    if (import.meta.env.DEV) {
      console.debug(`[G1] EditorView 생성: paneId=${paneId} blockId=${block.id}`);
    }
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      if (import.meta.env.DEV) {
        console.debug(`[G1] EditorView 파괴: paneId=${paneId} blockId=${block.id}`);
      }
      view.destroy();
      viewRef.current = null;
    };
  }, [paneId]); // block.id 의존성 제거 (G0: ID 변동에 의한 뷰 파괴 방지)

  // 뷰 생성 이펙트(위) 이후에 실행되어야 viewRef.current 가 채워진 상태로 등록된다.
  // 이 이펙트를 생성 이펙트보다 먼저 선언하면 최초 마운트 시 registerEditorView 가
  // viewRef.current === null 인 채로 스킵되어 레지스트리가 영구히 비게 된다.
  React.useLayoutEffect(() => {
    if (viewRef.current) {
      registerEditorView(paneId, block.id, viewRef.current);
    }
    return () => {
      unregisterEditorView(paneId, block.id);
    };
  }, [paneId, block.id]);

  // ── A1/A2 조정자: 스토어("원하는 상태") → 뷰 반영을 단일 진입점에서 처리한다 ──
  //
  // 이전에는 "캐럿 복원"(useLayoutEffect, deps=[isFocused,focusOffset])과 "내용
  // 동기화"(passive useEffect, deps=[block.content]) 가 따로 있었다. React 는
  // 모든 layout effect 를 passive effect 보다 먼저 돌리므로, 캐럿이 '아직
  // 교체되지 않은 옛 문서' 위에 놓인 뒤 문서가 통째로 갈리며 다시 밀려나는 순서
  // 의존 버그가 반복해서 났다 — 최근 버그 3건이 전부 "무엇을 하는가"가 아니라
  // "어떤 순서로 선언·등록했는가"에 정확성이 걸려 있었고, 그 순서는 코드 어디에도
  // 명시되지 않고 주석으로만 방어됐다. 하나의 useLayoutEffect 로 합쳐 그 순서
  // 의존성 자체를 없앤다: "어떤 순서로 실행되는가"가 주석이 아니라 이 함수
  // 본문의 문장 순서 그 자체가 된다.
  //
  // A2: 이전에는 내용이 다르면 항상 `changes: {from:0, to:len}` 로 문서 전체를
  // 치환했다 — 커서를 삽입 텍스트 끝으로 밀어내고, undo 입도를 뭉개고, 데코레이션
  // 위치를 전부 무효화했다. 블록 내용은 대개 한두 글자만 다르므로 공통 접두/접미를
  // 잘라낸 최소 diff 치환(computeMinimalChange)으로 바꾼다 — 커서·undo·데코레이션이
  // 자동으로 보존되어 조정 부담 자체가 준다.
  React.useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // IME 이중 가드 — 조합 중에는 diff 도 캐럿 재배치도 하지 않는다. 조합 중
    // 문서 치환은 Step 2-A 가 막 해소한 한글 입력 붕괴를 되살린다(BUG-20260810-02).
    if (isImeComposingRef.current || view.composing) return;

    const currentDoc = view.state.doc.toString();
    const contentChanged = currentDoc !== block.content;

    if (!contentChanged) {
      // 내용은 그대로 — 새 캐럿 명령이 있을 때만 반영한다. BUG-20260831-01:
      // focusOffset 을 매 렌더 캐럿 정답으로 취급하면(옛 코드) 일반 타이핑
      // 중에도 뷰의 캐럿을 낡은 값으로 되돌려 버린다 — 판정은 caretCoordinator.ts 참고.
      if (!isFocused) return;
      const decision = decideCaretAction({
        contentChanged: false,
        isFocused,
        focusToken,
        consumedFocusToken: consumedFocusTokenRef.current,
        focusOffset,
        mappedAnchor: 0, // contentChanged=false 분기에서는 안 쓰인다
        maxOffset: view.state.doc.length,
      });

      if (decision.type === 'apply') {
        view.dispatch({
          selection: { anchor: decision.anchor, head: decision.anchor },
          scrollIntoView: false,
        });
        consumedFocusTokenRef.current = focusToken;

        // R3 불변식 (A5, 위치 재조정): 방금 디스패치한 캐럿 명령이 실제로
        // 반영됐는지 확인한다. 병합 등으로 문서가 갈릴 때 캐럿이 조용히
        // 사라지는 걸 잡는다(BUG-20260828-02). 개발 빌드 한정, 실패해도
        // 편집을 막지 않는다. 새 명령이 없는 일반 타이핑 경로에서는
        // decision.type 이 'skip' 이라 이 분기에 들어오지 않는다 — 그게 이 수정의 핵심이다.
        if (import.meta.env.DEV) {
          const viewHead = view.state.selection.main.head;
          if (decision.anchor !== viewHead) {
            console.error(
              `[R3 불변식 위반] 캐럿 명령(anchor=${decision.anchor}) 이 반영되지 않음 — view.selection.main.head=${viewHead}`,
              new Error().stack,
            );
          }
        }
      }
      if (!view.hasFocus) view.focus();
      return;
    }

    // 내용이 다르다 — 최소 diff 만 치환한다(A2).
    const change = computeMinimalChange(currentDoc, block.content);
    const changes = view.state.changes(change);
    const mappedAnchor = changes.mapPos(view.state.selection.main.anchor);

    // 원하는 caret: 새 캐럿 명령이 있을 때만 스토어의 focusOffset 을 쓴다.
    // 없으면(디바운스 동기화·형제 블록 갱신·헤딩 재분할 등 단순 콘텐츠 갱신)
    // 지금 caret 위치를 diff 를 통해 그대로 투영한다 — 변경 구간 밖이면
    // 위치가 안 바뀐다(전체 치환처럼 매번 문서 끝으로 밀려나지 않는다).
    // isFocused 만으로 분기하던 이전 코드가 바로 위 !contentChanged 분기와
    // 같은 결함을 여기 갖고 있었다 — 판정은 두 분기 모두 같은 caretCoordinator.ts 로 통일했다.
    const decision = decideCaretAction({
      contentChanged: true,
      isFocused,
      focusToken,
      consumedFocusToken: consumedFocusTokenRef.current,
      focusOffset,
      mappedAnchor,
      maxOffset: block.content.length,
    });
    // contentChanged=true 분기는 decideCaretAction 이 항상 'apply' 를 돌려준다(치환은 캐럿 판단과 무관하게 필요).
    const anchor = decision.type === 'apply' ? decision.anchor : mappedAnchor;

    view.dispatch({
      changes: change,
      selection: { anchor, head: anchor },
      // updateListener 의 external 트랜잭션 배제 규칙이 이 태그로 이 dispatch 를
      // 걸러낸다 — 없으면 여기서 되돌려 쓴 내용이 다시 onUpdate 로 나가 루프가 된다.
      annotations: [Transaction.userEvent.of('external')],
    });

    const consumedFreshCommand = decision.type === 'apply' && decision.consumedFreshCommand;
    if (consumedFreshCommand) {
      consumedFocusTokenRef.current = focusToken;
    }

    // R3 불변식 (A5): 새 캐럿 명령을 반영했을 때만 검사한다 — 병합 등으로
    // 문서가 갈릴 때 캐럿이 조용히 사라지는 걸 잡는다(BUG-20260828-02).
    // 개발 빌드 한정, 실패해도 편집을 막지 않는다.
    if (import.meta.env.DEV && consumedFreshCommand) {
      const viewHead = view.state.selection.main.head;
      if (anchor !== viewHead) {
        console.error(
          `[R3 불변식 위반] 캐럿 명령(anchor=${anchor}) 이 반영되지 않음 — view.selection.main.head=${viewHead}`,
          new Error().stack,
        );
      }
    }

    // 병합으로 형제 블록이 언마운트되면 DOM 포커스가 통째로 사라진다 — 여기서 회수한다.
    if (isFocused && !view.hasFocus) view.focus();
  }, [block.content, isFocused, focusOffset, focusToken]);

  // Remove individual borders/backgrounds here so BlockNode can handle the layout tree.
  return (
    <div
      className="group relative py-1 transition-all duration-200 focus-within:bg-primary/10 hover:bg-darkPanel/30 rounded-lg"
    >
      <div ref={containerRef} className="w-full" />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Recursive Block Node
// ---------------------------------------------------------------------------
const BlockNode = React.memo<{
  paneId: string;
  block: EditorBlock;
  activeBlockId: string | null;
  focusOffset: number;
  focusToken: number;
  handleBlockUpdate: (id: string, text: string, cursorOffset: number) => void;
  handleMerge: (id: string) => void;
  focusBlock: (id: string, offset?: number) => void;
  handleFocusMove: (id: string, direction: 'prev' | 'next') => void;
}>(({ paneId, block, activeBlockId, focusOffset, focusToken, handleBlockUpdate, handleMerge, focusBlock, handleFocusMove }) => {
  
  const getLevelStyles = (level: number) => {
    switch(level) {
      case 1: 
        return 'mb-8 bg-transparent'; 
      case 2: 
        return 'mt-6 p-5 rounded-2xl bg-[#141520] border border-darkBorder/40 shadow-md';
      case 3: 
        return 'mt-4 p-4 rounded-xl bg-[#1d1f30] border border-darkBorder/40';
      default: 
        return 'mt-2 pl-2';
    }
  };

  const isFocused = activeBlockId === block.id;

  return (
    <div className={`block-node-wrapper transition-colors duration-200 ${getLevelStyles(block.level)}`}>
      <div className={block.level === 1 ? 'pb-3 mb-5 border-b-2 border-darkBorder/40' : ''}>
        <CodeMirrorBlock
          paneId={paneId}
          block={block}
          isFocused={isFocused}
          focusOffset={focusOffset}
          focusToken={focusToken}
          onUpdate={(text, offset) => handleBlockUpdate(block.id, text, offset)}
          onMerge={() => handleMerge(block.id)}
          onFocusPrev={() => handleFocusMove(block.id, 'prev')}
          onFocusNext={() => handleFocusMove(block.id, 'next')}
        />
      </div>
      {block.children.length > 0 && (
        <div className={`block-children ${block.level > 0 ? 'mt-4' : 'mt-1'}`}>
          {block.children.map(child => (
            <BlockNode
              key={child.id}
              paneId={paneId}
              block={child}
              activeBlockId={activeBlockId}
              focusOffset={focusOffset}
              focusToken={focusToken}
              handleBlockUpdate={handleBlockUpdate}
              handleMerge={handleMerge}
              focusBlock={focusBlock}
              handleFocusMove={handleFocusMove}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Inactive Pane — 7-A(P0-3 Stage A-2)·C-4: 탭 스코프 스토어를 편집하는
// 인스턴스를 상시 1개(활성 패널)로 제한한다. 비활성 패널은 이 정적 스냅샷만
// 그린다 — TabDocumentProvider 를 구독하지도, 쓰지도 않으므로 활성 패널의
// 편집 표면을 절대 덮어쓸 수 없다. 캐시가 아직 없으면(디스크에서 아직 안
// 읽힌 탭) 빈 문서로.
// ---------------------------------------------------------------------------
const InactivePaneSnapshot: React.FC<{ content: string }> = React.memo(({ content }) => {
  const workspacePath = useWorkspaceStore(s => s.workspacePath);
  return (
    <div className="w-full flex-1 px-4 sm:px-6 lg:px-8 py-6">
      <div
        className="rv-content max-w-none opacity-90"
        dangerouslySetInnerHTML={{ __html: renderBlockToHtml(content, workspacePath) }}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Editor
// ---------------------------------------------------------------------------
export const BlockEditor: React.FC<{ paneId?: string; tab?: TabItem; isActivePane?: boolean }> = ({
  paneId = 'pane-main',
  tab,
  isActivePane = true,
}) => {
  // C-2(REF-20260831-01): 이 패널이 그려야 할 문서는 전역 getCurrentFile() 이
  // 아니라 항상 자기 자신의 tab prop 이다(7-A 와 동일 원칙) — Provider 유무와
  // 무관하게 이 파생은 그대로 유효하다.
  const currentFile = tab?.fileEntry ?? null;
  const effectiveStore = useEffectiveTabStore();
  const {
    blocks,
    activeBlockId,
    focusOffset,
    focusToken,
    viewMode,
    mergeBlockWithPrevious,
    focusBlock,
    setContent,
    syncRawContentFromBlocks,
    getMergedContent,
    updateBlockContent,
    setDirty,
    getFreshBlocks,
  } = effectiveStore;
  const { settings } = useSettingsStore();

  React.useLayoutEffect(() => {
    if (viewMode === 'read') {
      const active = getActiveEditorView();
      if (active && active.hasFocus) {
        active.contentDOM.blur();
      }
    }
  }, [viewMode]);

  const handleFocusMove = React.useCallback((id: string, direction: 'prev' | 'next') => {
    const flatBlocks = flattenTree(getFreshBlocks());
    const index = flatBlocks.findIndex(b => b.id === id);
    if (index === -1) return;

    if (direction === 'prev' && index > 0) {
      focusBlock(flatBlocks[index - 1].id, flatBlocks[index - 1].content.length);
    } else if (direction === 'next' && index < flatBlocks.length - 1) {
      focusBlock(flatBlocks[index + 1].id, 0);
    }
  }, [focusBlock, getFreshBlocks]);

  const myTabIdRef = useRef<string>(tab?.id ?? '');
  React.useLayoutEffect(() => {
    myTabIdRef.current = tab?.id ?? '';
  }, [tab?.id]);

  const syncContent = useDebouncedCallback(() => {
    // C-4: 탭 스코프 스토어 인스턴스 자체가 이미 한 탭 소유이므로 소유권 경합이
    // 구조적으로 성립하지 않는다 — 런타임 소유권 가드 자체가 불필요해졌다.
    syncRawContentFromBlocks();
    useDocumentStore.getState().updateContentForTab(myTabIdRef.current, getMergedContent());
  }, 150);

  useEffect(() => {
    return () => {
      syncContent.flush();
    };
  }, []);
  React.useLayoutEffect(() => {
    // 7-A: 비활성 패널은 이 탭 스토어를 그릴 일이 없다(Provider 자체가 활성
    // 패널의 활성 탭에만 마운트된다) — 방어적으로 남겨 둔다.
    if (!isActivePane) return;
    // C-4: blocks 는 이미 TabDocumentProvider 의 initialContent 로 마운트
    // 시점에 정확히 세팅돼 있다(PaneContainer 가 activeTab.cache/savedContent
    // 에서 계산) — 여기서 다시 setContent 를 부르면 같은 내용을 또 재파싱하는
    // 낭비다. 이 effect 의 남은 책임은 "문서를 열면 첫 블록에 포커스" 뿐이다.
    if (currentFile && tab) {
      const firstBlock = getFreshBlocks()[0];
      if (firstBlock) focusBlock(firstBlock.id, 0);
    }
  }, [currentFile?.path]);

  useTauriInputManager({
    // 7-A: 비활성 패널엔 인터랙티브 에디터 뷰가 아예 없으므로, 여기서도 막아
    // 활성 패널의 드롭을 비활성 패널 인스턴스가 이중으로 처리하지 않게 한다.
    enabled: () => isActivePane && !!getActiveEditorView(),
    onCommand: async (cmd) => {
      if (cmd.type !== 'INSERT_IMAGE') return;
      const { data, mimeType } = cmd.payload;

      const view = getActiveEditorView();
      if (!view) return;
      
      const { workspacePath, config } = useWorkspaceStore.getState();
      if (!workspacePath) return;

      const currentFilePath = currentFile?.path ?? null;

      try {
        const relativePath = await saveImageAssetWithPolicy(
          workspacePath, currentFilePath, data, mimeType, config,
        );
        const md = `![이미지](${relativePath})`;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: md },
          selection: { anchor: from + md.length },
        });
      } catch (err) {
        console.error('[BlockEditor] INSERT_IMAGE failed', err);
      }
    },
  });

  const handleBlockUpdate = (id: string, text: string, cursorOffset: number) => {
    setDirty(true);

    // updateBlockContent 로 갱신되기 전 스냅샷 — 렌더 스냅샷(blocks)이 아니라
    // 항상-최신 값이 필요하다(같은 틱 안에서 이어지는 계산이 이 값을 쓴다).
    const blocksBeforeUpdate = getFreshBlocks();

    // O(N) flattenTree를 피하기 위해, 업데이트 대상 블록의 기존 텍스트만 트리 탐색으로 빠르게 찾음
    let oldContent = '';
    const findOldContent = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.id === id) { oldContent = node.content; return true; }
        if (node.children.length > 0 && findOldContent(node.children)) return true;
      }
      return false;
    };
    findOldContent(blocksBeforeUpdate);

    const countHeadings = (content: string) => {
      let count = 0;
      let fenceActive = false;
      // 단일 블록에 대한 split이므로 비용이 적음
      content.split('\n').forEach(line => {
        if (/^(`{3,}|~{3,})/.test(line)) { fenceActive = !fenceActive; return; }
        if (!fenceActive && /^#{1,3} /.test(line)) count++;
      });
      return count;
    };

    const oldHeadingCount = countHeadings(oldContent);
    const newHeadingCount = countHeadings(text);

    updateBlockContent(id, text);

    // 헤딩 개수가 변했을 때만 트리 분할(O(N) 리파싱)을 수행
    if (oldHeadingCount !== newHeadingCount) {
      const currentFlatBlocks = flattenTree(blocksBeforeUpdate);

      let absoluteCursorPos = cursorOffset;
      for (let b of currentFlatBlocks) {
        if (b.id === id) break;
        absoluteCursorPos += b.content.length + 1;
      }
      const merged = getMergedContent();
      setContent(merged);
      const nextFlatBlocks = flattenTree(getFreshBlocks());

      let accumulated = 0;
      let targetId = nextFlatBlocks[nextFlatBlocks.length - 1].id;
      let targetOffset = 0;

      for (let i = 0; i < nextFlatBlocks.length; i++) {
        const len = nextFlatBlocks[i].content.length;
        const isLastBlock = i === nextFlatBlocks.length - 1;

        if (absoluteCursorPos < accumulated + len || isLastBlock) {
          targetId = nextFlatBlocks[i].id;
          targetOffset = Math.min(Math.max(0, absoluteCursorPos - accumulated), len);
          break;
        }
        else if (absoluteCursorPos === accumulated + len) {
          targetId = nextFlatBlocks[i + 1].id;
          targetOffset = 0;
          break;
        }
        accumulated += len + 1;
      }

      setContent(merged);
      focusBlock(targetId, targetOffset);
      useDocumentStore.getState().updateContentForTab(myTabIdRef.current, merged);
    } else {
      syncContent();
    }
  };

  const handleMerge = (id: string) => {
    mergeBlockWithPrevious(id);
    syncContent();
  };

  // 7-A(P0-3 Stage A-2): 비활성 패널은 전역 blockStore/documentStore 를 전혀
  // 참조하지 않는 정적 스냅샷만 그린다 — 그 스토어들은 항상 "활성 패널의"
  // 문서를 담고 있으므로, 비활성 패널이 그걸 그대로 그리면 탭 바 제목과
  // 본문이 어긋난다(원 증상). 자기 자신의 tab prop 에서만 읽는다.
  if (!isActivePane) {
    if (!tab) {
      return (
        <div className="h-full flex items-center justify-center text-xs text-mutedText/40 select-none">
          열린 문서가 없습니다.
        </div>
      );
    }
    return <InactivePaneSnapshot content={tab.cache?.rawContent ?? tab.savedContent ?? ''} />;
  }

  if (!currentFile) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 select-none">
        <FileEdit className="w-12 h-12 text-primary/40 mb-3 animate-pulse" />
        <h3 className="text-sm font-semibold text-slate-300 mb-1">문서가 선택되지 않았습니다</h3>
        <p className="text-xs text-mutedText max-w-xs leading-relaxed">
          좌측 파일 탐색기에서 마크다운 문서를 선택하거나, 새 문서를 생성하여 편집을 시작해 주세요.
        </p>
      </div>
    );
  }

  const maxWidthStyle = settings.editor.contentMaxWidth > 0 
    ? { maxWidth: `${settings.editor.contentMaxWidth}px`, margin: '0 auto' } 
    : {};

  return (
    <div
      className="min-h-full flex flex-col items-center w-full"
      style={{ '--editor-font-size': `${settings.editor.fontSize}px` } as React.CSSProperties}
    >
      <div className="sticky top-0 z-10 bg-darkBg/95 backdrop-blur-sm w-full">
        <div className=" mx-auto" style={maxWidthStyle}>
          <FormatToolbar />
        </div>
      </div>

      {viewMode === 'read' ? (
        <div className="w-full flex-1">
          <ReadView tab={tab} />
        </div>
      ) : (
        <div className="w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24 flex-1 flex flex-col">
          <div className="flex-1 w-full" style={maxWidthStyle}>
            {blocks.map((rootBlock) => (
              <BlockNode
                key={rootBlock.id}
                paneId={paneId}
                block={rootBlock}
                activeBlockId={activeBlockId}
                focusOffset={focusOffset}
                focusToken={focusToken}
                handleBlockUpdate={handleBlockUpdate}
                handleMerge={handleMerge}
                focusBlock={focusBlock}
                handleFocusMove={handleFocusMove}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
