const getHandler = require('../../serverless/get-handler')

// generate the handler that we'll use as the ƛ function
const getLambdaHandler = desc => {
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

  return getHandler({ script, cmd }, (makeRequest, getPort, req, ctx, fn) => {
    const url =
      req.path +
      '?' +
      require('querystring').stringify(req.queryStringParameters)
    const proxy = makeRequest(
      {
        port: getPort(),
        hostname: '127.0.0.1',
        path: url,
        method: req.httpMethod,
        headers: req.headers
      },
      proxyRes => {
        let body = ''
        proxyRes.on('data', data => {
          body += data
        })
        proxyRes.on('error', err => {
          fn(err)
          body = ''
        })
        proxyRes.on('end', () => {
          fn(null, {
            statusCode: proxyRes.statusCode,
            headers: proxyRes.headers,
            body
          })
        })
      }
    )
    proxy.on('error', fn)
    proxy.end(req.body)
  })
}

module.exports = getLambdaHandler
