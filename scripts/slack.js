#!/usr/bin/env node

const {spawnSync: spawn} = require('child_process')

const fetch = require('node-fetch')

const REPO = process.env.TRAVIS_REPO_SLUG
const COMMIT = process.env.TRAVIS_COMMIT
const BRANCH = process.env.TRAVIS_BRANCH
const TOKEN = process.env.SLACKUP_TOKEN
const CHANNEL = process.env.SLACKUP_CHANNEL
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

// skip if not on a zeit repo
if (!/^zeit\//.test(REPO)) {
  process.exit(0)
}

// skip if it's a build from a pull request
if (process.env.TRAVIS_PULL_REQUEST !== 'false') {
  process.exit(0)
}

if (!TOKEN) {
  console.log('$SLACKUP_TOKEN not found')
  process.exit(0)
}

if (!CHANNEL) {
  console.log('$SLACKUP_CHANNEL not found')
  process.exit(0)
}

if (!GITHUB_TOKEN) {
  console.log('$GITHUB_TOKEN not found')
  process.exit(0)
}

const opts = {
  headers: {
    authorization: `token ${GITHUB_TOKEN}`
  }
}

fetch(`https://api.github.com/repos/${REPO}/commits/${COMMIT}`, opts)
  .then(res => res.json())
  .then(res => res.author)
  .then(author => {
    const msg1 = `<${author.html_url}|${author.login}> just pushed <https://github.com/${REPO}/commit/${COMMIT}|${COMMIT.substr(0, 7)}> to the branch <https://github.com/${REPO}/tree/${BRANCH}|${BRANCH}> of <https://github.com/${REPO}|${REPO}>`
    const msg2 = `Here are the binaries:`

    const binaries = [
      `${__dirname}/../packed/now-macos`,
      `${__dirname}/../packed/now-linux`,
      `${__dirname}/../packed/now-win.exe`
    ]

    spawn('slackup', ['-c', CHANNEL, '--msg', msg1])
    spawn('slackup', ['-c', CHANNEL, '--msg', msg2])
    spawn('slackup', ['-c', CHANNEL, '--file', binaries[0], '--file', binaries[1], '--file', binaries[2]])
  })
  .catch(console.error)
