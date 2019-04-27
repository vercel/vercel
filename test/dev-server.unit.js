import test from 'ava'
import path from 'path'
import fetch from 'node-fetch'
import createOutput from '../src/util/output'
import DevServer from '../src/commands/dev/lib/dev-server'

let server

test.before(async () => {
  let readyResolve
  let readyPromise = new Promise(resolve => {
    readyResolve = resolve
  })

  const output = createOutput({})
  const origReady = output.ready
  output.ready = msg => {
    if (msg.toString().match(/Development server running at/)) {
      readyResolve()
    }
    origReady(msg)
  }

  server = new DevServer(
    path.join(__dirname, 'fixtures/unit/now-dev-query'),
    { output }
  )
  await server.start()
  await readyPromise
})

test.after(() => server.stop())

test('[DevServer] maintains query when proxying route', async t => {
  const res = await fetch('http://localhost:3000/_next/webpack-hmr?page=1')
  const text = await res.text()
  t.regex(text, /\?page=1/)
})
