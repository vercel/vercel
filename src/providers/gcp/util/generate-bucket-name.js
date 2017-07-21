const BUCKET_NAME_PREFIX = 'now-deployments-'
const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const MAX_LENGTH = 63

module.exports = function generateBucketName() {
  let name = BUCKET_NAME_PREFIX
  for (let i = 0, l = MAX_LENGTH - name.length; i < l; i++) {
    name += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return name
}
