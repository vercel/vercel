// Native
import path from 'path'

// Packages
import fs from 'fs-promise'
import download from 'download'
import tmp from 'tmp-promise'

const downloadRepo = async repoPath => {
  const url = `https://api.github.com/repos/${repoPath}/tarball`

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

export const isRepoPath = path => {
  if (!path) {
    return false
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
