/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // 색은 전부 `src/app/styles/index.css` 의 `--*-rgb` 토큰이 소유한다.
      // 값이 RGB 채널 트리플릿인 이유: `'var(--x)'` 로 두면 `.bg-X` 는 생성되지만
      // `.bg-X/20`(불투명도 수식어)이 조용히 출력되지 않는다. 이 저장소에 66곳 있다.
      colors: {
        // 기존 6개 — 이름 유지(사용처 259곳 무수정)
        darkBg:     'rgb(var(--surface-0-rgb) / <alpha-value>)',
        darkPanel:  'rgb(var(--surface-3-rgb) / <alpha-value>)',
        darkBorder: 'rgb(var(--border-1-rgb) / <alpha-value>)',
        primary:    'rgb(var(--accent-0-rgb) / <alpha-value>)',
        accent:     'rgb(var(--accent-alt-rgb) / <alpha-value>)',
        mutedText:  'rgb(var(--text-3-rgb) / <alpha-value>)',
        // 팔레트 클래스 치환용 신규
        t0: 'rgb(var(--text-0-rgb) / <alpha-value>)',
        t1: 'rgb(var(--text-1-rgb) / <alpha-value>)',
        t2: 'rgb(var(--text-2-rgb) / <alpha-value>)',
        t3: 'rgb(var(--text-3-rgb) / <alpha-value>)',
        t4: 'rgb(var(--text-4-rgb) / <alpha-value>)',
        surface0: 'rgb(var(--surface-0-rgb) / <alpha-value>)',
        surface1: 'rgb(var(--surface-1-rgb) / <alpha-value>)',
        surface2: 'rgb(var(--surface-2-rgb) / <alpha-value>)',
        surface4: 'rgb(var(--surface-4-rgb) / <alpha-value>)',
        surface5: 'rgb(var(--surface-5-rgb) / <alpha-value>)',
        overlay: 'rgb(var(--overlay-rgb) / <alpha-value>)',
        scrim:   'rgb(var(--scrim-rgb) / <alpha-value>)',
        accent0: 'rgb(var(--accent-0-rgb) / <alpha-value>)',
        accent1: 'rgb(var(--accent-1-rgb) / <alpha-value>)',
        accent2: 'rgb(var(--accent-2-rgb) / <alpha-value>)',
        danger:   'rgb(var(--danger-rgb) / <alpha-value>)',
        dangerBg: 'rgb(var(--danger-bg-rgb) / <alpha-value>)',
        highlight: 'rgb(var(--highlight-rgb) / <alpha-value>)',
        node1: 'rgb(var(--node-1-rgb) / <alpha-value>)',
        node2: 'rgb(var(--node-2-rgb) / <alpha-value>)',
        node3: 'rgb(var(--node-3-rgb) / <alpha-value>)',
        node4: 'rgb(var(--node-4-rgb) / <alpha-value>)',
        node5: 'rgb(var(--node-5-rgb) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
