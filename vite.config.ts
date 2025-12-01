import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      // Serve i JSON di Avacy da src anche in dev su /data/avacy/json/...
      name: 'avacy-json-static',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || ''
          if (url.startsWith('/data/avacy/json/')) {
            const relativePath = url.replace(/^\//, '')
            const filePath = path.resolve(__dirname, 'src', relativePath)
            fs.readFile(filePath, (err, data) => {
              if (err) {
                return next()
              }
              res.setHeader('Content-Type', 'application/json')
              res.end(data)
            })
            return
          }
          next()
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@components': path.resolve(__dirname, 'src/components'),
      '@slides': path.resolve(__dirname, 'src/slides'),
      '@presentations': path.resolve(__dirname, 'src/presentations'),
    },
  },
  server: {
    open: '/index.html'
  }
})


