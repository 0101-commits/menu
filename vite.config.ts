import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 는 https://0101-commits.github.io/menu/ 하위 경로로 서빙한다.
// base 를 비워 두면 /assets/... 를 도메인 루트에서 찾아 404 가 난다.
// 다른 곳에 올릴 때는 VITE_BASE 로 덮는다(예: 커스텀 도메인이면 VITE_BASE=/).
const base = process.env.VITE_BASE ?? '/menu/';

export default defineConfig({
  base,
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // 데이터는 public/ 에서 따로 받으므로 번들에는 코드만 들어간다.
    chunkSizeWarningLimit: 700,
  },
});
