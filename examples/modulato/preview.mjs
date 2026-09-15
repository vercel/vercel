// Serve the Vercel Build Output (.vercel/output) locally, the way Vercel
// would: static files first, then the __ssr function as catch-all.
// Build first: VERCEL=1 npm run build
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(root, '.vercel/output')
const staticDir = path.join(out, 'static')
const { default: handler } = await import(
  pathToFileURL(path.join(out, 'functions/__ssr.func/index.mjs'))
)

const MIME = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

const port = Number(process.env.PORT ?? 4173)
http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const file = path.join(staticDir, decodeURIComponent(url.pathname))
    if (file.startsWith(staticDir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream')
      fs.createReadStream(file).pipe(res)
      return
    }
    await handler(req, res)
  })
  .listen(port, () => {
    console.log(`vercel-output preview on http://localhost:${port}`)
  })
