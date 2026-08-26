export function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  if (!node) return null;
  if (node === document.body || node === document.documentElement) return node;

  const style = window.getComputedStyle(node);
  if (/(auto|scroll)/.test(style.overflowY)) {
    return node;
  }
  return getScrollParent(node.parentElement);
}
