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
        // 목록·평점 데이터까지 미리 받아 둔다. 오프라인에서 지도 타일은 못 받지만
        // 목록·검색·평점은 그대로 열린다.
        globPatterns: ['**/*.{js,css,html,svg,json}'],
        // places.json 이 1.4MB 다. 기본 상한(2MB)에 걸리지 않게 넉넉히 둔다.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        // 카카오 지도 SDK·타일은 캐시하지 않는다. 오프라인에서 쓸 수 없고,
        // 오래된 SDK 를 붙들면 지도가 조용히 깨진다.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // 데이터는 public/ 에서 따로 받으므로 번들에는 코드만 들어간다.
    chunkSizeWarningLimit: 700,
  },
});
