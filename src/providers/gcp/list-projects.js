// ours
const fetch = require('./util/fetch')
const getToken = require('./util/get-access-token')

const URL = 'https://cloudresourcemanager.googleapis.com/v1/projects'

const projectsLs = async ctx => {
  const token = await getToken(ctx)

  if (!token) {
    return 1
  }

  const { projects } = await fetch({ url: URL, token })

  return projects
}

module.exports = projectsLs
