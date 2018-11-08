const path = require('path')

const fetch = require('node-fetch')
const tar = require('tar')
const getWritableDirectory = require('@now/build-utils/fs/get-writable-directory.js');

const url = 'https://dl.google.com/go/go1.11.1.linux-amd64.tar.gz'

module.exports = async () => {
  const res = await fetch(url)
  const dir = await getWritableDirectory()

  if (!res.ok) {
    throw new Error(`Failed to download: ${url}`);
  }

  return new Promise((resolve, reject) => {
    res.body
      .on('error', reject)
      .pipe(tar.extract({ cwd: dir, strip: 1 }))
      .on('finish', () => resolve(path.join(dir, 'bin', 'go')));
  })

}
