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

  useEffect(() => {
    let finalDoc = null;
    let needsUpdate = false;
    try {
      if (!rawContent || rawContent.trim() === '') {
        finalDoc = createEmptyErdDocument();
        needsUpdate = true;
      } else {
        const parsed = JSON.parse(rawContent);
        if (!parsed.version || !parsed.tables) {
          finalDoc = createEmptyErdDocument();
          needsUpdate = true;
        } else {
          finalDoc = parsed;
        }
      }
    } catch (e) {
      console.error("Failed to parse ERD JSON", e);
      try {
        finalDoc = parseErdDocument(rawContent);
        needsUpdate = true;
      } catch (err) {
        finalDoc = createEmptyErdDocument();
        needsUpdate = true;
      }
    }

    setDocument(finalDoc);
    if (needsUpdate) {
      const normalized = JSON.stringify(finalDoc, null, 2);
      setRawContent(normalized);
      if (tab?.id) useDocumentStore.getState().updateContentForTab(tab.id, normalized);
    }
  }, [rawContent, setRawContent, tab?.id]);

  if (!document) {
    return <div className="p-4 text-sm text-red-400">ERD 문서를 로드하는 중...</div>;
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
