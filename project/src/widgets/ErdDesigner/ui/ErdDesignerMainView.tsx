import React, { useState, useEffect } from 'react';
import { useDocumentStore } from '@/entities/document/model/store';
import { parseErdDocument, createEmptyErdDocument } from '@/entities/erd/model/erd';
import ErdDesigner from './ErdDesigner';

export const ErdDesignerMainView: React.FC = () => {
  const { rawContent, updateContent } = useDocumentStore();
  const activeTabId = useDocumentStore(state => state.getActiveTab()?.id);
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
      updateContent(JSON.stringify(finalDoc, null, 2));
    }
  }, [rawContent, updateContent]);

  if (!document) {
    return <div className="p-4 text-sm text-red-400">ERD 문서를 로드하는 중...</div>;
  }

  return (
    <div className="w-full h-full bg-darkBg">
      <ErdDesigner
        document={document}
        filePath={activeTabId}
        onChange={(newDoc: any) => {
          // JSON 포맷으로 직렬화하여 updateContent 호출
          updateContent(JSON.stringify(newDoc, null, 2));
        }}
        onExportSvg={() => {}}
        onExportPng={async () => {}}
      />
    </div>
  );
};
