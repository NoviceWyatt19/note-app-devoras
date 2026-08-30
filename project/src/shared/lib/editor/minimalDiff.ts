/**
 * 두 문자열 사이의 최소 치환 구간을 공통 접두/접미 절단으로 계산한다.
 *
 * A2: 블록 스토어→에디터 뷰 동기화가 항상 문서 전체를 `from:0, to:len` 으로
 * 치환하고 있었다 — 커서를 삽입 텍스트 끝으로 밀어내고, undo 입도를 뭉개고,
 * 데코레이션 위치를 전부 무효화했다. 블록 내용은 대개 한두 글자만 다르므로
 * 공통 접두/접미를 잘라낸 최소 범위 치환으로 충분하다(전체 LCS/트리 diff 는
 * 과한 설계 — 이 용도엔 필요 없다).
 */
export interface MinimalChange {
  from: number;
  to: number;
  insert: string;
}

export function computeMinimalChange(oldDoc: string, newDoc: string): MinimalChange {
  const maxCommon = Math.min(oldDoc.length, newDoc.length);

  let prefix = 0;
  while (prefix < maxCommon && oldDoc.charCodeAt(prefix) === newDoc.charCodeAt(prefix)) {
    prefix++;
  }

  let oldEnd = oldDoc.length;
  let newEnd = newDoc.length;
  while (
    oldEnd > prefix &&
    newEnd > prefix &&
    oldDoc.charCodeAt(oldEnd - 1) === newDoc.charCodeAt(newEnd - 1)
  ) {
    oldEnd--;
    newEnd--;
  }

  return { from: prefix, to: oldEnd, insert: newDoc.slice(prefix, newEnd) };
}
