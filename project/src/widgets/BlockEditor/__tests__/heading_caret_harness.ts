// G1 캐럿 안정성 하네스 (수동 DevTools 실행용)
// 사용법: 아래 코드를 빌드하거나, 혹은 이 시나리오에 따라 콘솔에서 getActiveEditorView() 를 사용해 검증하세요.

export async function runCaretHarness() {
  // @ts-ignore
  const view = window.__getActiveEditorView?.();
  if (!view) {
    console.error("No active editor view found. Focus the editor first.");
    return;
  }

  console.log("C1~C6 Harness starting...");
  
  // 1. Get initial state
  const initialHead = view.state.selection.main.head;
  const initialCoords = view.coordsAtPos(initialHead);
  const scrollContainer = document.querySelector('.block-node-wrapper')?.parentElement;
  if (!scrollContainer) {
    console.error("No scroll container found.");
    return;
  }
  const initialScrollTop = scrollContainer.scrollTop;

  console.log({ initialHead, initialCoords, initialScrollTop });
  
  // To test C1~C4, we manually dispatch transactions to simulate typing
  view.dispatch({
    changes: { from: initialHead, insert: '# ' },
    selection: { anchor: initialHead + 2, head: initialHead + 2 }
  });

  // Need to wait for layout update
  requestAnimationFrame(() => {
    const headAfterH1 = view.state.selection.main.head;
    const coordsAfterH1 = view.coordsAtPos(headAfterH1);
    const scrollAfterH1 = scrollContainer.scrollTop;
    
    console.log("After inserting '# ':", { headAfterH1, coordsAfterH1, scrollAfterH1 });
    
    // Check C1: head moved by 2
    if (headAfterH1 !== initialHead + 2) console.error("C1 FAILED: head jumped!");
    
    // Check C3: scroll unshifted
    if (scrollAfterH1 !== initialScrollTop) console.error("C3 FAILED: Scroll jumped!");
    
    // Run C6 on the new line
    const domLine = view.domAtPos(headAfterH1).node;
    if (domLine instanceof HTMLElement) {
      const rect = domLine.getBoundingClientRect();
      console.log("C6 Rect:", rect);
      if (rect.height === 0) console.error("C6 FAILED: height is 0");
    }
    
    console.log("Harness complete. Review the logs to confirm V/T/R and C1~C6.");
  });
}
