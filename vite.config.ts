import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 앱 주소는 https://matpin.pages.dev/ (Cloudflare Pages, 도메인 맨 앞에서 서빙).
// 하위 경로에 올릴 때만 VITE_BASE 로 덮는다(예: 옛 GitHub Pages 는 VITE_BASE=/menu/).
// 그때 base 를 안 맞추면 /assets/... 를 도메인 맨 앞에서 찾아 404 가 난다.
const base = process.env.VITE_BASE ?? '/';

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
        id: base,
        name: '맛핀',
        short_name: '맛핀',
        description: '저장한 맛집을 지도에서 찾고 세 지도의 평점을 한 번에 비교합니다.',
        lang: 'ko',
        start_url: base,
        scope: base,
        display: 'standalone',
        categories: ['food', 'travel', 'navigation'],
        // 안드로이드에서 설치한 맛핀이 다른 앱의 「공유」 목록에 뜬다. 받은 글은 시작 주소의
        // ?title=&text=&url= 로 오고 src/lib/share.ts 가 저장한 가게를 찾는다. 아이폰 사파리는 이 기능이 없다.
        // enctype 을 비우면 크롬이 매니페스트 경고를 낸다(기본값으로 처리는 되지만 굳이 남기지 않는다).
        share_target: {
          action: base,
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        // 자기 자신을 적어 두면 install.html 이 navigator.getInstalledRelatedApps() 로
        // "이미 설치돼서 메뉴에 설치 대신 열기가 뜨는" 경우를 알아낸다. 주소는 매니페스트 기준 상대 경로.
        related_applications: [{ platform: 'webapp', url: 'manifest.webmanifest' }],
        background_color: '#f4f5f7',
        theme_color: '#c8362a',
        // 안드로이드(Chrome WebAPK·삼성 인터넷)는 PNG 192·512 가 없으면 설치를 안 띄운다.
        // SVG 만 있을 때 아이폰은 되고 갤럭시는 안 됐다. PNG 는 icon.svg 를 그대로 래스터화한 것,
        // maskable 은 둥근 모서리만 뺀 판(핀이 안전 영역 80% 원 안에 이미 들어간다).
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // 앱 껍데기만 미리 받는다. 데이터(places 1.4MB + ratings 1.3MB)를 precache 에 넣으면
        // 첫 방문에 서비스워커와 앱이 같은 파일을 각각 받아 2.7MB 를 두 번 내려받는다.
        globPatterns: ['**/*.{js,css,html,svg}'],
        // 설치 점검 페이지는 늘 네트워크에서 새로 받는다. 서비스워커가 묵은 판을 쥐고 있는지 보려는
        // 페이지가 그 서비스워커 캐시에서 나오면 점검이 안 된다.
        // Cloudflare Pages 는 .html 을 떼어 /install 로 308 을 주므로 두 꼴을 다 비켜 간다.
        globIgnores: ['**/install.html'],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/install(\.html)?(\?|$)/],
        runtimeCaching: [
          {
            // 앱이 실제로 받을 때 캐시에 들어간다. 그 다음부터는 캐시를 먼저 주고
            // 뒤에서 갱신한다 — 오프라인에서 목록·검색·평점이 그대로 열린다.
            urlPattern: ({ url }) => url.pathname.endsWith('.json') && url.pathname.includes('/data/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'matpin-data',
              // places·ratings·meta·details 넷에 여유 둘.
              expiration: { maxEntries: 6, maxAgeSeconds: 30 * 24 * 60 * 60 },
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
