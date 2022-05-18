const getExport = name => import('../dist/undici.mjs').then(r => r[name])
const createCaller = name => (input, init) => getExport(name).then(fn => fn(input, init))

exports.fetch = createCaller('fetch')
exports.$fetch = createCaller('$fetch')
exports.$fetch.raw = (input, init) => getExport('$fetch').then($fetch => $fetch.raw(input, init))
