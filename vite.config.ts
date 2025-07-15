import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3003,           // 指定端口
    host: '0.0.0.0',      // 允许外部访问
    open: true,           // 自动打开浏览器
    https: false,         // 是否使用HTTPS
    cors: true,           // 启用CORS
  },
})
