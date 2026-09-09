import React, { useState, useEffect } from 'react';
import { useDocumentStore, TabItem } from '@/entities/document/model/store';
import { useEffectiveTabStore } from '@/entities/document/model/useEffectiveTabStore';
import { parseErdDocument, createEmptyErdDocument } from '@/entities/erd/model/erd';
import ErdDesigner from './ErdDesigner';

/**
 * D-3(REF-20260831-01) — BlockEditor 의 7-A 형태(tab prop)를 그대로 따른다.
 * 이 전환은 분할 패널에서 서로 다른 ERD 탭을 열었을 때의 교차 오염(7-A 가
 * 마크다운 패널만 다뤘기 때문에 남아 있던 구멍)도 함께 고친다.
 */
export const ErdDesignerMainView: React.FC<{ tab?: TabItem }> = ({ tab }) => {
  const { rawContent, setRawContent } = useEffectiveTabStore();
  const [document, setDocument] = useState<any>(null);
  // BUG-20260902-01 — 읽기 실패는 쓰기를 유발하지 않는다. 파싱 실패 원본을 보존해 표시만 한다.
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!rawContent || rawContent.trim() === '') {
      // D12(PM-20260904-01 §r1_closeout) — 빈 입력도 BUG-20260902-01 의 불변식
      // ("여는 것만으로 디스크에 쓰지 않는다") 대상이다. 스켈레톤 문서는 로컬
      // 상태로만 두고, 실제로 사용자가 편집(아래 onChange)할 때만 쓴다.
      setDocument(createEmptyErdDocument());
      setParseError(null);
      return;
    }

    try {
      setDocument(parseErdDocument(rawContent));
      setParseError(null);
    } catch (e) {
      console.error("Failed to parse ERD document", e);
      setDocument(null);
      setParseError(rawContent);
    }
  }, [rawContent, tab?.id]);

  if (parseError !== null) {
    return (
      <div className="p-4 h-full overflow-auto text-sm text-danger space-y-3">
        <p>ERD 문서를 해석할 수 없습니다. 원본 내용은 그대로 보존되어 있습니다 — 저장해도 사라지지 않습니다.</p>
        <pre className="whitespace-pre-wrap text-xs text-mutedText bg-scrim/20 p-3 rounded">{parseError}</pre>
      </div>
    );
  }

  if (!document) {
    return <div className="p-4 text-sm text-danger">ERD 문서를 로드하는 중...</div>;
  }

  return (
    <div className="w-full h-full bg-darkBg">
      <ErdDesigner
        document={document}
        filePath={tab?.id}
        onChange={(newDoc: any) => {
          // JSON 포맷으로 직렬화하여 저장
          const serialized = JSON.stringify(newDoc, null, 2);
          setRawContent(serialized);
          if (tab?.id) useDocumentStore.getState().updateContentForTab(tab.id, serialized);
        }}
        onExportSvg={() => {}}
        onExportPng={async () => {}}
      />
    </div>
  );
};
