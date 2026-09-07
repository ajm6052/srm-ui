import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

const resolve = (p) => fileURLToPath(new URL(p, import.meta.url))

// Path aliases, matching the layout of our other Vue apps so components read the
// same across projects (@views/…, @components/…, @stores/…, etc.).
const alias = {
  '@': resolve('.'),
  '@src': resolve('src'),
  '@router': resolve('src/router'),
  '@views': resolve('src/router/views'),
  '@layouts': resolve('src/router/layouts'),
  '@components': resolve('src/components'),
  '@utils': resolve('src/utils'),
  '@stores': resolve('src/stores'),
  '@i18n': resolve('src/i18n'),
}

export default defineConfig({
  resolve: {
    alias,
    // Allow the extensionless imports the routes use (e.g. import('@views/schedule')).
    extensions: ['.mjs', '.js', '.jsx', '.json', '.vue'],
  },
  plugins: [vue(), vuetify({ autoImport: true })],
  server: {
    // Dev server port. The backend's CORS allowlist (cmd/api/server.go) includes
    // http://localhost:4100, so this origin is accepted out of the box.
    port: Number(process.env.PORT) || 4100,
  },
  build: {
    sourcemap: true,
  },
})
