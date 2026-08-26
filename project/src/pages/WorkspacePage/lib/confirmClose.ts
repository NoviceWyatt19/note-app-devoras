import { ask } from '@tauri-apps/plugin-dialog';
import { SplitPane, TabItem } from '@/entities/document/model/store';

export async function confirmDiscardIfDirty(tab: TabItem | undefined): Promise<boolean> {
  if (!tab?.isDirty) return true;
  return ask(`'${tab.title}'에 저장되지 않은 변경 사항이 있습니다. 닫으시겠습니까?`,
             { title: 'Devoras', kind: 'warning' });
}

export function hasDirtyTabs(panes: SplitPane[]): boolean {
  return panes.some(p => p.tabs.some(t => t.isDirty));
}
