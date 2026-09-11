/** @type {import('tailwindcss').Config} */
// 색은 여기서 정하지 않는다. src/styles/bridge.css 의 --matpin-* 을 유틸로 노출할 뿐이다.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
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
