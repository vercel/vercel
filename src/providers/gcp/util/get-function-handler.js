const getHandler = require('../../../serverless/get-handler')

const getFunctionHandler = desc => {
  // the command that our handler will invoke to fire up
  // the user-suppled HTTP server
  let cmd = null
  let script = null

  if (desc.packageJSON) {
    if (desc.packageJSON.scripts && desc.packageJSON.scripts.start) {
      cmd = desc.packageJSON.scripts.start
    } else {
      // `node .` will use `main` or fallback to `index.js`
      script = './'
    }
  } else {
    if (desc.hasServerJSFile) {
      script = 'server.js'
    } else {
      script = 'index.js'
    }
  }

  return getHandler({ cmd, script }, (makeRequest, getPort, req, res) => {
    let body

    if ('object' === typeof req.body && !(body instanceof Buffer)) {
      body = JSON.stringify(req.body)
    } else {
      body = req.body
    }

    console.log('got request', req.url, req.method, req.headers)
    const proxyRequest = makeRequest(
      {
        port: getPort(),
        hostname: '127.0.0.1',
        // TODO: figure out how to get the path?
        path: req.url,
        method: req.method,
        headers: req.headers
      },
      proxyRes => {
        proxyRes.on('data', data => {
          res.write(data)
        })
        proxyRes.on('error', err => {
          console.error(err)
          res.status(500).end()
        })
        proxyRes.on('end', () => {
          res.end()
        })
      }
    )
    proxyRequest.on('error', err => {
      console.error(err)
      res.status(500).end()
    })
    proxyRequest.end(body)
  })
}

module.exports = getFunctionHandler
