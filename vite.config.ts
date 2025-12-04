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
          // Rimuovi query string per il path resolution
          const [pathOnly] = url.split('?')
          
          if (pathOnly.startsWith('/data/avacy/json/')) {
            const relativePath = pathOnly.replace(/^\//, '')
            const filePath = path.resolve(__dirname, 'src', relativePath)

            fs.stat(filePath, (statErr, stats) => {
              if (statErr) {
                return next()
              }

              // Imposta intestazioni comuni (incluso Last-Modified per le date di aggiornamento)
              res.setHeader('Content-Type', 'application/json')
              if (stats.mtime) {
                res.setHeader('Last-Modified', stats.mtime.toUTCString())
              }

              // Per richieste HEAD basta inviare le intestazioni
              if (req.method === 'HEAD') {
                res.statusCode = 200
                res.end()
                return
              }

              fs.readFile(filePath, (err, data) => {
                if (err) {
                  return next()
                }
                res.end(data)
              })
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


