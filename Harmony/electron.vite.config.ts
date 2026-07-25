import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [svelte()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/renderer/index.html'),
          nested: resolve(__dirname, 'src/renderer/videocall.html'),
        },
      },
    }
  }
})
