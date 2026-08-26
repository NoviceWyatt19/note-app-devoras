export const isSameOrInside = (target: string, base: string) =>
  target === base || target.startsWith(base + '/');

export const rebasePath = (target: string, oldBase: string, newBase: string) =>
  newBase + target.slice(oldBase.length);
