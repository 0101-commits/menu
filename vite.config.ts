import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages 는 https://0101-commits.github.io/menu/ 하위 경로로 서빙한다.
// base 를 비워 두면 /assets/... 를 도메인 루트에서 찾아 404 가 난다.
// 다른 곳에 올릴 때는 VITE_BASE 로 덮는다(예: 커스텀 도메인이면 VITE_BASE=/).
const base = process.env.VITE_BASE ?? '/menu/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // 새 배포가 나오면 다음 방문에 조용히 갈아끼운다.
      // 사용자에게 "새 버전이 있습니다" 를 물을 만한 앱이 아니다.
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '맛핀',
        short_name: '맛핀',
        description: '저장한 맛집을 지도에서 찾고 세 지도의 평점을 한 번에 비교합니다.',
        lang: 'ko',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f4f5f7',
        theme_color: '#c8362a',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱 껍데기만 미리 받는다. 데이터(places 1.4MB + ratings 1.3MB)를 precache 에 넣으면
        // 첫 방문에 서비스워커와 앱이 같은 파일을 각각 받아 2.7MB 를 두 번 내려받는다.
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            // 앱이 실제로 받을 때 캐시에 들어간다. 그 다음부터는 캐시를 먼저 주고
            // 뒤에서 갱신한다 — 오프라인에서 목록·검색·평점이 그대로 열린다.
            urlPattern: ({ url }) => url.pathname.endsWith('.json') && url.pathname.includes('/data/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'matpin-data',
              expiration: { maxEntries: 4, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // 포트를 고정한다. 카카오 SDK 는 콘솔에 등록한 "도메인:포트" 에서만 내려오므로
    // 5173 이 막혔다고 조용히 5174 로 밀려나면 지도와 장소 검색이 그냥 안 된다.
    // 차라리 시작에서 실패하는 편이 낫다.
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // 데이터는 public/ 에서 따로 받으므로 번들에는 코드만 들어간다.
    chunkSizeWarningLimit: 700,
  },
});
