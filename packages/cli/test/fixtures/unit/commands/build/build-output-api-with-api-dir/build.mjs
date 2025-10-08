import fs from 'fs'

fs.mkdirSync('.vercel/output', { recursive: true })
fs.writeFileSync('.vercel/output/config.json', JSON.stringify({
  version: 3
}, null, 2))
