import React, { useEffect, useRef } from 'react';
import { EditorState, Compartment, Transaction } from '@codemirror/state';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { LanguageDescription } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';

import { useEffectiveTabStore } from '@/entities/document/model/useEffectiveTabStore';
import { useDocumentStore, TabItem } from '@/entities/document/model/store';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { useSettingsStore } from '@/entities/settings/model/store';
import { useDebouncedCallback } from '@/shared/lib/useDebouncedCallback';
import { registerEditorView, unregisterEditorView, reportCaretFocus } from '@/shared/lib/editorViewRegistry';
import { useTauriInputManager } from '@/shared/lib/editor/useTauriInputManager';
import { useImeInputManager } from '@/shared/lib/editor/useImeInputManager';
import { createImeIsolationExtension } from '@/shared/lib/editor/extensions/ImeIsolation';
import { saveImageAssetWithPolicy } from '@/shared/lib/fs/imageAsset';
import { parseCodeFenceInfo } from '@/shared/lib/markdown/codeFenceInfo';

import { createSingleDocDecorationPlugin } from '@/shared/lib/editor/decorators/singleDocOrchestrator';
import { structuralDecorators, viewportDecorators } from '@/shared/lib/editor/decorators/singleDocDecorators';
import { blockCardTheme } from '@/shared/lib/editor/decorators/impl/BlockCardDecorator';
import { codeBlockInteractionPlugin } from '@/shared/lib/editor/decorators/impl/CodeBlockDecorator';
import { tableInteractionPlugin, tableKeymap } from '@/shared/lib/editor/decorators/impl/TableDecorator';

/**
 * `SingleDocEditor` — 문서 전체를 하나의 `EditorView` 로 편집하는 프로토타입
 * (`single_cm_transition.md` §6 Step 1, `DEBUG_PLAN.md` §5.0.3 2단 게이트의
 * 첫 단). `singleDocEditorFlag.ts` 로만 켜진다 — 기존 `BlockNode`/`CodeMirrorBlock`
 * 경로(`BlockEditor.tsx`)를 대체하지 않고 나란히 둔다.
 *
 * 이 프로토타입이 **일부러 건드리지 않는 것**(Step 1 의 명시적 범위):
 *   - `tabStore.blocks`/`resolveBlocksFromContent` — ReadView 가 아직 그 경로를 쓴다.
 *     이 컴포넌트는 편집 시 `setContent(rawContent)` 를 그대로 호출해 blocks/nodes 를
 *     기존 파이프라인으로 갱신할 뿐, 그 파이프라인 자체는 Step 2 전까지 그대로 둔다.
 *   - 블록 단위 `activeBlockId`/`focusOffset`/`focusToken` 캐럿 조정 — 그 개념 자체가
 *     "블록마다 CM 인스턴스"를 전제하므로 단일 CM 에는 대응이 없다. 대신 마운트 시
 *     한 번 자체 포커스한다.
 *
 * 데코레이션: `createSingleDocDecorationPlugin`(스파이크 B 가 검증한 2계층 설계) +
 * `BlockCardDecorator`(스파이크 A 가 검증한 L2⊃L3 카드).
 */

const matchFenceLanguage = (info: string) => {
  const { lang } = parseCodeFenceInfo(info);
  return lang ? LanguageDescription.matchLanguageName(languages, lang, true) : null;
};

// 데코레이터 목록(구조/뷰포트 분류 포함)은 singleDocDecorators.ts 가 유일한
// 출처다 — structural_trigger_coverage_harness.ts 가 그 배열을 직접 순회한다.
const singleDocDecorationPlugin = createSingleDocDecorationPlugin(structuralDecorators, viewportDecorators);

/** `getActiveEditorView()`(FormatToolbar 등)가 조회하는 레지스트리 키의 블록 자리 —
 *  단일 CM 에는 "블록"이 없으므로 고정 센티널을 쓴다. */
const SINGLE_DOC_SENTINEL_ID = '__single-doc__';

const lineWrappingCompartment = new Compartment();
const editorThemeCompartment = new Compartment();

function createEditorTheme(settingsEditor: { fontFamily: string; fontSize: number }) {
  return EditorView.theme({
    '&': { background: 'transparent !important', height: 'auto' },
    '.cm-scroller': {
      fontFamily: settingsEditor.fontFamily,
      fontSize: `${settingsEditor.fontSize}px`,
      minWidth: '0',
    },
    '.cm-content': { caretColor: '#6366f1', padding: '24px 0', minWidth: '0' },
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

export const SingleDocEditor: React.FC<{ paneId: string; tab: TabItem }> = ({ paneId, tab }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { rawContent, setContent, setDirty } = useEffectiveTabStore();
  const { settings } = useSettingsStore();

  const myTabIdRef = useRef(tab.id);
  useEffect(() => {
    myTabIdRef.current = tab.id;
  }, [tab.id]);

  const isImeComposingRef = useImeInputManager();

  // 설정 변경 시 컴파트먼트 재구성 — 구 쓰기 경로(CodeMirrorBlock)와 동일한 패턴.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        lineWrappingCompartment.reconfigure(settings.editor.lineWrapping ? EditorView.lineWrapping : []),
        editorThemeCompartment.reconfigure(createEditorTheme(settings.editor)),
      ],
    });
  }, [settings.editor.lineWrapping, settings.editor.fontFamily, settings.editor.fontSize]);

  // 디바운스 동기화 — 문서 스토어(탭 바 dirty 점 · 디스크 저장 대상)에 rawContent 를
  // 반영한다. `setContent` 가 기존 파이프라인(resolveBlocksFromContent/parseMarkdown)
  // 으로 blocks/nodes 도 함께 갱신하므로 ReadView·MindView 는 변경 없이 계속 동작한다.
  const syncContent = useDebouncedCallback((rawText: string) => {
    setContent(rawText);
    useDocumentStore.getState().updateContentForTab(myTabIdRef.current, rawText);
  }, 150);

  useEffect(() => {
    return () => {
      syncContent.flush();
    };
  }, []);

  useTauriInputManager({
    enabled: () => !!viewRef.current,
    onCommand: async (cmd) => {
      if (cmd.type !== 'INSERT_IMAGE') return;
      const { data, mimeType } = cmd.payload;

      const view = viewRef.current;
      if (!view) return;

      const { workspacePath, config } = useWorkspaceStore.getState();
      if (!workspacePath) return;

      const currentFilePath = tab.fileEntry?.path ?? null;

      try {
        const relativePath = await saveImageAssetWithPolicy(workspacePath, currentFilePath, data, mimeType, config);
        const md = `![이미지](${relativePath})`;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: md },
          selection: { anchor: from + md.length },
        });
      } catch (err) {
        console.error('[SingleDocEditor] INSERT_IMAGE failed', err);
      }
    },
  });

  React.useLayoutEffect(() => {
    if (!containerRef.current) return;

    const editingKeymap = keymap.of([
      { key: 'Tab', run: indentMore },
      { key: 'Shift-Tab', run: indentLess },
    ]);

    const state = EditorState.create({
      doc: rawContent,
      extensions: [
        markdown({ codeLanguages: matchFenceLanguage }),
        lineWrappingCompartment.of(settings.editor.lineWrapping ? EditorView.lineWrapping : []),
        oneDark,
        history(),
        drawSelection(),
        editingKeymap,
        tableKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        singleDocDecorationPlugin,
        blockCardTheme,
        codeBlockInteractionPlugin,
        tableInteractionPlugin,
        createImeIsolationExtension(),
        EditorView.updateListener.of((update) => {
          if (update.focusChanged && update.view.hasFocus) {
            reportCaretFocus(paneId, SINGLE_DOC_SENTINEL_ID);
          }

          if (!update.docChanged) return;
          if (isImeComposingRef.current || update.view.composing) return;

          const isExternal = update.transactions.some((tr) => tr.annotation(Transaction.userEvent) === 'external');
          if (isExternal) return;

          setDirty(true);
          syncContent(update.state.doc.toString());
        }),
        editorThemeCompartment.of(createEditorTheme(settings.editor)),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    registerEditorView(paneId, SINGLE_DOC_SENTINEL_ID, view);
    reportCaretFocus(paneId, SINGLE_DOC_SENTINEL_ID);
    view.focus();

    return () => {
      unregisterEditorView(paneId, SINGLE_DOC_SENTINEL_ID);
      view.destroy();
      viewRef.current = null;
    };
    // 마운트당 한 번만 — 부모(`PaneContainer`)가 `key={activeTab.id}` 로 탭마다
    // 이 컴포넌트를 새로 마운트하므로, 탭 전환 대응을 이 안에서 따로 하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="w-full min-w-0" />;
};
