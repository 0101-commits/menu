/** @type {import('tailwindcss').Config} */
// 색은 여기서 정하지 않는다. src/styles/bridge.css 의 --matpin-* 을 유틸로 노출할 뿐이다.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Tailwind preflight 가 html 의 font-family 를 이 값으로 박는다. 여기서 정해 주지 않으면
      // 기본값 ui-sans-serif/system-ui 가 남아 윈도우에서 맑은 고딕으로 떨어진다 —
      // SEED 는 --seed-font-family 를 선언만 하고 어느 요소에도 적용하지 않으므로,
      // index.css 의 import 순서와 무관하게 preflight 가 항상 이긴다.
      // Pretendard 를 맨 앞에 두어 OS 와 상관없이 같은 글꼴로 읽히게 한다.
      fontFamily: {
        sans: [
          '"Pretendard Variable"',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Apple SD Gothic Neo"',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          '"Noto Sans"',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"',
        ],
      },
      colors: {
        primary: {
          DEFAULT: 'var(--matpin-primary)',
          pressed: 'var(--matpin-primary-pressed)',
          weak: 'var(--matpin-primary-weak)',
          'weak-pressed': 'var(--matpin-primary-weak-pressed)',
          fg: 'var(--matpin-primary-fg)',
          stroke: 'var(--matpin-primary-stroke)',
        },
        'on-primary': 'var(--matpin-on-primary)',
        surface: {
          DEFAULT: 'var(--matpin-surface)',
          raised: 'var(--matpin-surface-raised)',
          sunken: 'var(--matpin-surface-sunken)',
          fill: 'var(--matpin-surface-fill)',
          pressed: 'var(--matpin-surface-pressed)',
        },
        fg: {
          DEFAULT: 'var(--matpin-fg)',
          muted: 'var(--matpin-fg-muted)',
          subtle: 'var(--matpin-fg-subtle)',
          disabled: 'var(--matpin-fg-disabled)',
          placeholder: 'var(--matpin-fg-placeholder)',
          inverted: 'var(--matpin-fg-inverted)',
        },
        line: {
          DEFAULT: 'var(--matpin-line)',
          subtle: 'var(--matpin-line-subtle)',
          strong: 'var(--matpin-line-strong)',
        },
        critical: {
          DEFAULT: 'var(--matpin-critical)',
          weak: 'var(--matpin-critical-weak)',
        },
        // 외부 서비스 식별색. 테마와 무관한 상수다.
        naver: 'var(--matpin-brand-naver)',
        kakao: 'var(--matpin-brand-kakao)',
        google: 'var(--matpin-brand-google)',
      },
    },
  },
  plugins: [],
};
