// Runtime cron dispatcher (CJS). Generated into a Vercel cron service
// lambda by `applyCronDispatch` in @vercel/backends. JS analog of
// vercel-runtime/src/vercel_runtime/crons.py — pre-resolves the route
// table at module load and dispatches inbound requests to the matching
// handler on the user's module.
//
// `__VC_USER_MODULE_PATH__` is replaced at build time with the relative
// path to the user's cron entrypoint.
const { timingSafeEqual: __vc_timingSafeEqual } = require('node:crypto')
const __vc_user_module = require('__VC_USER_MODULE_PATH__')

function jsonResponse(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

function unwrapDefault(value) {
  let current = value
  for (let i = 0; i < 5; i++) {
    if (
      current &&
      typeof current === 'object' &&
      'default' in current &&
      current.default
    ) {
      current = current.default
    } else {
      break
    }
  }
  return current
}

function resolveCronHandler(userModule, name) {
  if (name === 'default') {
    const unwrapped = unwrapDefault(userModule)
    if (typeof unwrapped === 'function') return unwrapped
    if (typeof userModule === 'function') return userModule
    return undefined
  }
  const fn = userModule != null ? userModule[name] : undefined
  return typeof fn === 'function' ? fn : undefined
}

function safeBearerEqual(authHeader, secret) {
  if (typeof authHeader !== 'string') return false
  const expected = 'Bearer ' + secret
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return __vc_timingSafeEqual(a, b)
}

// Pre-resolve every route at module load. A bad route table fails the
// lambda at boot
const __vc_routes_raw = process.env.__VC_CRON_ROUTES
if (!__vc_routes_raw) {
  throw new Error(
    'unable to bootstrap cron service: "__VC_CRON_ROUTES" environment variable is not set'
  )
}
const __vc_routes_parsed = JSON.parse(__vc_routes_raw)
const RESOLVED_HANDLERS = new Map()
for (const __vc_path in __vc_routes_parsed) {
  const __vc_name = __vc_routes_parsed[__vc_path]
  const __vc_fn = resolveCronHandler(__vc_user_module, __vc_name)
  if (typeof __vc_fn !== 'function') {
    throw new Error(
      'cron handler "' +
        __vc_name +
        '" is not a function in the user module (route: ' +
        __vc_path +
        ')'
    )
  }
  RESOLVED_HANDLERS.set(__vc_path, __vc_fn)
}

async function vcCronDispatch(req, res) {
  // Drain any inbound request body so the underlying stream completes
  // independently of whether the user's cron handler reads it. Cron
  // handlers take no arguments — body bytes are never used. Idempotent
  // and a no-op for non-streaming runtimes.
  if (typeof req.resume === 'function') req.resume()

  const method = (req.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'POST') {
    jsonResponse(res, 405, { error: 'method not allowed' })
    return
  }
  const secret = process.env.CRON_SECRET
  if (secret) {
    const headers = req.headers || {}
    const authorization = headers.authorization || headers.Authorization
    if (!safeBearerEqual(authorization, secret)) {
      jsonResponse(res, 401, { error: 'unauthorized' })
      return
    }
  }
  const rawUrl = typeof req.url === 'string' ? req.url : '/'
  const path = rawUrl.split('?')[0]
  const fn = RESOLVED_HANDLERS.get(path)
  if (!fn) {
    jsonResponse(res, 404, { error: 'no cron handler for path: ' + path })
    return
  }
  try {
    await fn()
    jsonResponse(res, 200, { ok: true })
  } catch (err) {
    console.error(err)
    jsonResponse(res, 500, { error: 'internal' })
  }
}

module.exports = function (req, res) {
  return vcCronDispatch(req, res)
}
