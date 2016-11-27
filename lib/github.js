// Native
import path from 'path'
import url from 'url'

// Packages
import fs from 'fs-promise'
import download from 'download'
import tmp from 'tmp-promise'
import isURL from 'is-url'

const downloadRepo = async repoPath => {
  const pathParts = gitPathParts(repoPath)
  console.log(pathParts)
  const url = `https://api.github.com/repos/${pathParts.main}/tarball/${pathParts.ref}`

  const tmpDir = await tmp.dir({
    // We'll remove it manually once deployment is done
    keep: true,
    // Recursively remove directory when calling respective method
    unsafeCleanup: true
  })

  try {
    await download(url, tmpDir.path, {
      extract: true
    })
  } catch (err) {
    tmpDir.cleanup()
    return false
  }

  const tmpContents = await fs.readdir(tmpDir.path)
  tmpDir.path = path.join(tmpDir.path, tmpContents[0])

  return tmpDir
}

const splittedURL = fullURL => {
  const pathParts = url.parse(fullURL).path.split('/')
  pathParts.shift()

  // Set path to repo...
  const main = pathParts[0] + '/' + pathParts[1]

  // ...and then remove it from the parts
  pathParts.splice(0, 2)

  return {
    main,
    ref: pathParts.length >= 2 ? pathParts[1] : ''
  }
}

export const gitPathParts = main => {
  let ref = ''

  if (isURL(main)) {
    return splittedURL(main)
  }

  if (main.split('/')[1].includes('#')) {
    const parts = main.split('#')

    ref = parts[1]
    main = parts[0]
  }

  return {main, ref}
}

export const isRepoPath = path => {
  if (!path) {
    return false
  }

  if (isURL(path)) {
    const urlParts = url.parse(path)
    const slashCount = (urlParts.path.match(new RegExp('/', 'g')) || []).length
    const notBare = slashCount >= 2

    if (urlParts.host === 'github.com' && notBare) {
      return true
    }
  }

  return /[^\s\\]\/[^\s\\]/g.test(path)
}

export const onGitHub = async (path, debug) => {
  let tmpDir = false

  try {
    tmpDir = await downloadRepo(path)
  } catch (err) {
    if (debug) {
      console.log(`Could not download "${path}" repo from GitHub`)
    }
  }

  return tmpDir
}
