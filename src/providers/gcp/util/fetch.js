// node
const { encode: encodeQuery } = require('querystring')

// theirs
const _fetch = require('node-fetch')

const fetch = async ({ url, method = 'GET', token, query }) => {
  url = query ? url + '?' + encodeQuery(query) : url
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`
  }

  const res = await _fetch(url, {
    method,
    headers
  })

  const json = await res.json()

  return json
}

module.exports = fetch
