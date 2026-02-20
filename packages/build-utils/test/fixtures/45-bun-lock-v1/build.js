import { mkdir, rm, writeFile } from 'node:fs/promises'
import { say } from 'cowsay'

const text = say({ text: `bun version: ${process.versions.bun}` })
const content = say({ text })
await rm('./public', { recursive: true, force: true })
await mkdir('./public', { recursive: true })
await writeFile('./public/index.txt', content)
