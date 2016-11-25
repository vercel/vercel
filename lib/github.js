// Native
import path from 'path'

// Packages
import fs from 'fs-promise'
import fetch from 'node-fetch'
import download from 'download'
import tmp from 'tmp-promise'

// Ours
import {error} from './error'

const exists = async repoPath => {
  const apiURL = `https://api.github.com/repos/${repoPath}`
  let request

  try {
    request = await fetch(apiURL)
  } catch (err) {
    error(`Not able to check if repo exists - ${err.message}`)
    return false
  }

  const res = await request.json()

  if (!res.name) {
    return false
  }

  return res
}

const downloadRepo = async repoPath => {
  const url = `https://api.github.com/repos/${repoPath}/tarball`

  const tmpDir = await tmp.dir({
    keep: true
  })

  await download(url, tmpDir.path, {
    extract: true
  })

  const tmpContents = await fs.readdir(tmpDir.path)
  tmpDir.path = path.join(tmpDir.path, tmpContents[0])

  return tmpDir
}

export const isRepoPath = path => {
  if (!path) {
    return false
  }

  const slashCount = path.split('/').length - 1

  if (!slashCount || slashCount > 1) {
    return false
  }

  return true
}

export const onGitHub = async (path, debug) => {
  let repo = await exists(path)

  try {
    repo = await exists(path)
  } catch (err) {
    if (debug) {
      console.log(`Repository "${path}" does not exist on GitHub`)
    }

    return false
  }

  if (!repo) {
    return false
  }

  let tmpDir

  try {
    tmpDir = await downloadRepo(path)
  } catch (err) {
    error(`Not able to download repo: ${err.stack}`)
    process.exit(1)
  }

  return tmpDir
}
