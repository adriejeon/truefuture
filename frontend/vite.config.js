import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  base: '/',
  build: {
    // SSR 번들(dist-ssr)은 프리렌더 스크립트만 쓰므로 public/ 을 복사하지 않는다
    copyPublicDir: !isSsrBuild,
  },
}))
