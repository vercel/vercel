const fetch = require('node-fetch');

// provides a `fetch` that is aware of the
// authenticatin mechanism of the now api
const fetchWithAuth = (url, token, opts) => (
  fetch(url, Object.assign({}, opts, {
    headers: Object.assign({}, opts ? opts.headers : null, {
      authorization: `bearer ${token}`
    })
  }))
)

module.exports = fetchWithAuth;
