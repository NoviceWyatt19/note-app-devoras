/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // tailwind.config.js — theme.extend.colors 전체. 토큰 26개 ↔ 키 26개, 1:1.
      //
      // 명명 규칙: 레거시 이름이 있으면 그것이 정본이다. 같은 토큰에 새 키를 덧붙이지 않는다
      // (같은 색에 두 이름이 생기는 것이 이 저장소가 반복해 온 A1 계열 결함이다).
      // 레거시 6개는 사용처 259~266곳을 무수정으로 남긴다 — 가리키는 토큰만 바뀐다.
      colors: {
        // ── 레거시 6개 (이름 유지) ──────────────────────────────
        darkBg:     'rgb(var(--surface-base-rgb) / <alpha-value>)',
        darkPanel:  'rgb(var(--surface-panel-rgb) / <alpha-value>)',
        darkBorder: 'rgb(var(--border-rgb) / <alpha-value>)',
        primary:    'rgb(var(--accent-rgb) / <alpha-value>)',        // ← indigo. 새 팔레트 치환도 이 이름을 쓴다
        accent:     'rgb(var(--accent-alt-rgb) / <alpha-value>)',    // ← teal. 사용처 1곳뿐이지만 이름을 뺏지 않는다
        mutedText:  'rgb(var(--text-muted-rgb) / <alpha-value>)',    // ← 텍스트 muted 단의 정본 이름

        // ── 신규 (레거시가 덮지 않는 토큰만) ────────────────────
        raised:       'rgb(var(--surface-raised-rgb) / <alpha-value>)',
        strong:       'rgb(var(--text-strong-rgb) / <alpha-value>)',
        body:         'rgb(var(--text-body-rgb) / <alpha-value>)',
        faint:        'rgb(var(--text-faint-rgb) / <alpha-value>)',
        borderStrong: 'rgb(var(--border-strong-rgb) / <alpha-value>)',
        accentSoft:   'rgb(var(--accent-soft-rgb) / <alpha-value>)',
        accentSubtle: 'rgb(var(--accent-subtle-rgb) / <alpha-value>)',
        danger:    'rgb(var(--danger-rgb) / <alpha-value>)',
        dangerBg:  'rgb(var(--danger-bg-rgb) / <alpha-value>)',
        warning:   'rgb(var(--warning-rgb) / <alpha-value>)',
        info:      'rgb(var(--info-rgb) / <alpha-value>)',
        highlight: 'rgb(var(--highlight-rgb) / <alpha-value>)',
        magenta:   'rgb(var(--magenta-rgb) / <alpha-value>)',
        node1: 'rgb(var(--node-1-rgb) / <alpha-value>)',
        node2: 'rgb(var(--node-2-rgb) / <alpha-value>)',
        node3: 'rgb(var(--node-3-rgb) / <alpha-value>)',
        node4: 'rgb(var(--node-4-rgb) / <alpha-value>)',
        node5: 'rgb(var(--node-5-rgb) / <alpha-value>)',
        overlay: 'rgb(var(--overlay-rgb) / <alpha-value>)',
        scrim:   'rgb(var(--scrim-rgb) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
