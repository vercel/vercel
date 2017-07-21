//@flow
const { tmpdir } = require('os')
const { parse, format } = require('url')
const fetch = require('node-fetch')
const tar = require('tar-fs')
const pipeStreams = require('pipe-streams-to-promise')
const { mkdir } = require('fs.promised')
const uid = require('uid-promise')
const { createGunzip } = require('zlib')
const { join } = require('path')
const debug = require('debug')('now:resolvers:github')

// matches a parameter that can be `now`d like zeit/now#master
const DEPLOY_PARAM_REGEX = /^([\w-]+)\/([\w-]+)(#\w+)?$/

// matches whether the parameter could be a github url
const GITHUB_TEST_REGEX = /^(https?:\/\/)(www\.)?github\.com/

// matches a github url pathname like: zeit/now/tree/master
const URL_PATHNAME_REGEX = /^\/([\w-]+)\/([\w-]+)(\/tree\/(\w+))?$/

const resolveGitHub = (param: string) => {
  // support simple `user/repo` syntax
  const match = param.match(DEPLOY_PARAM_REGEX)
  if (match) {
    const [, user, repo, tree = 'master'] = match
    return resolveGitHubByURL(`https://github.com/${user}/${repo}/tree/${tree}`)
  } else if (GITHUB_TEST_REGEX.test(param)) {
    return resolveGitHubByURL(param)
  } else {
    return null
  }
}

const resolveGitHubByURL = async (url: string) => {
  debug('resolving %s by github url', url)
  if (/^https?/.test(url)) {
    const parsed = parse(url)
    if (parsed.hostname === 'github.com') {
      const httpsUrl =
        'https:' === parsed.protocol ? url : format(Object.assign({}, parsed))
      const res = await fetch(httpsUrl)
      if (res.ok) {
        debug('attempting github clone')
        const { pathname = '' } = parsed
        const match = pathname.match(URL_PATHNAME_REGEX)
        if (match) {
          const [, user, repo, , tree] = match
          const downloadURL = format({
            protocol: 'https:',
            hostname: 'codeload.github.com',
            pathname: `/${user}/${repo}/tar.gz/${tree}`
          })
          debug('fetching download url', downloadURL)
          const downloadRes = await fetch(downloadURL, { compress: false })
          if (downloadRes.ok) {
            const tmpDir = join(tmpdir(), `now-gh-${await uid(20)}`)
            debug('creating tmp dir to extract', tmpDir)
            try {
              await mkdir(tmpDir)
            } catch (err) {
              throw new Error(
                'Error occurred while trying to extract ' +
                  `GH tarball to tmp directory ${tmpDir}: ${err.stack}`
              )
            }
            debug('unzipping and untarring stream')
            await pipeStreams([
              downloadRes.body,
              createGunzip(),
              tar.extract(tmpDir)
            ])
            // instead of stripping a directory upon untar,
            // we return the full path to the extracted project,
            // so that now can take advantage of the name
            return join(tmpDir, `${repo}-${tree}`)
          } else {
            throw new Error(
              'An HTTP error ${res.status} was returned ' +
                `by "${downloadURL}"`
            )
          }
        } else {
          debug('invalid github project url')
          return null
        }
      } else {
        debug('non-200 from github (%d)', res.status)
        return null
      }
    } else {
      debug('skipping non-github hostname')
      return null
    }
  } else {
    return null
  }
}

module.exports = resolveGitHub
