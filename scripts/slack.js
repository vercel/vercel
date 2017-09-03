#!/usr/bin/env node

const slackup = require('slackup')
const fetch = require('node-fetch')

const repo = process.env.TRAVIS_REPO_SLUG
const commit = process.env.TRAVIS_COMMIT
const branch = process.env.TRAVIS_BRANCH
const apiKey = process.env.SLACK_API_KEY
const channel = process.env.SLACK_CHANNEL
const githubToken = process.env.GITHUB_TOKEN

// Skip if not on a zeit repo
if (!/^zeit\//.test(repo)) {
  console.log('not a zeit repo')
  process.exit(0)
}

if (!apiKey) {
  console.log('$SLACKUP_TOKEN not found')
  process.exit(0)
}

if (!channel) {
  console.log('$SLACKUP_CHANNEL not found')
  process.exit(0)
}

if (!githubToken) {
  console.log('$GITHUB_TOKEN not found')
  process.exit(0)
}

const opts = {
  headers: {
    authorization: `token ${githubToken}`
  }
}

fetch(`https://api.github.com/repos/${repo}/commits/${commit}`, opts)
  .then(res => res.json())
  .then(res => ({
    message: res.commit.message,
    authorName: res.commit.author.name,
    authorUrl: res.author.html_url
  }))
  .then(async res => {
    const message = `:package: Here are the binaries for the branch *${branch}* of *${repo}* (commit <https://github.com/${repo}/commit/${commit}|${commit.substr(
      0,
      7
    )}> by <${res.authorUrl}|${res.authorName}>):`

    const binaries = [
      `${__dirname}/../packed/now-macos`,
      `${__dirname}/../packed/now-linux`,
      `${__dirname}/../packed/now-win.exe`
    ]

    try {
      await slackup({ apiKey, channel, type: 'message', message })
      await slackup({ apiKey, channel, type: 'file', filePath: binaries[0] })
      await slackup({ apiKey, channel, type: 'file', filePath: binaries[1] })
      await slackup({ apiKey, channel, type: 'file', filePath: binaries[2] })
    } catch (err) {
      console.log(`Couldn't send messages/files to Slack`, err)
    }
  })
  .catch(console.error)
