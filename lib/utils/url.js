exports.maybeURL = id => {
  // E.g, "appname-asdf"
  return id.includes('-')
}

exports.normalizeURL = u => {
  // Normalize URL by removing slash from the end
  if (u.slice(-1) === '/') {
    u = u.slice(0, -1)
  }

  // `url` should match the hostname of the deployment
  u = u.replace(/^https:\/\//i, '')

  if (!u.includes('.')) {
    // `.now.sh` domain is implied if just the subdomain is given
    u += '.now.sh'
  }

  return u
}
