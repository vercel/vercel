// @flow

// Packages
const ms = require('ms')
const fetch = require('node-fetch')
const mri = require('mri')
const { gray, bold } = require('chalk')
const uid = require('uid-promise')
const bytes = require('bytes')
const sleep = require('then-sleep')
const debug = require('debug')('now:gcp:deploy')

// Utilities
const ok = require('../../util/output/ok')
const info = require('../../util/output/info')
const wait = require('../../util/output/wait')
const link = require('../../util/output/link')
const success = require('../../util/output/success')
const humanPath = require('../../util/humanize-path')
const resolve = require('../../resolve')
const error = require('../../util/output/error')
const param = require('../../util/output/param')
const build = require('../../serverless/build')
const getToken = require('./util/get-access-token')
const describeProject = require('../../describe-project')
const copyToClipboard = require('../../util/copy-to-clipboard')
const getFunctionHandler = require('./util/get-function-handler')
const generateBucketName = require('./util/generate-bucket-name')
const { writeToConfigFile } = require('../../util/config-files')

const deploy = async (ctx: {
  config: any,
  authConfig: any,
  argv: Array<string>
}) => {
  const { argv: argv_ } = ctx
  const argv = mri(argv_, {
    boolean: ['help'],
    alias: {
      help: 'h'
    }
  })

  const token = await getToken(ctx)

  // `now [provider] [deploy] [target]`
  const [cmdOrTarget = null, target_ = null] = argv._.slice(2).slice(-2)

  let target

  if (cmdOrTarget === 'gcp' || cmdOrTarget === 'deploy') {
    target = target_ === null ? process.cwd() : target_
  } else {
    if (target_) {
      console.error(error('Unexpected number of arguments for deploy command'))
      return 1
    } else {
      target = cmdOrTarget === null ? process.cwd() : cmdOrTarget
    }
  }

  const start = Date.now()
  const resolved = await resolve(target)

  if (resolved === null) {
    console.error(error(`Could not resolve deployment target ${param(target)}`))
    return 1
  }

  let desc = null

  try {
    desc = await describeProject(resolved)
  } catch (err) {
    if (err.code === 'AMBIGOUS_CONFIG') {
      console.error(
        error(`There is more than one source of \`now\` config: ${err.files}`)
      )
      return 1
    } else {
      throw err
    }
  }

  // Example now.json for gcpConfig
  // {
  //   functionName: String,
  //   timeout: String,
  //   memory: Number,
  //   region: String
  // }
  const { nowJSON: { gcp: gcpConfig } } = desc

  const overrides = {
    'function.js': getFunctionHandler(desc)
  }

  const region = gcpConfig.region || 'us-central1'

  console.log(
    info(
      `Deploying ${param(humanPath(resolved))} ${gray('(gcp)')} ${gray(
        `(${region})`
      )}`
    )
  )

  const buildStart = Date.now()
  const stopBuildSpinner = wait('Building and bundling your app…')
  const zipFile = await build(resolved, desc, { overrides })
  stopBuildSpinner()

  if (zipFile.length > 100 * 1024 * 1024) {
    console.error(error('The build exceeds the 100mb GCP Functions limit'))
    return 1
  }

  console.log(
    ok(
      `Build generated a ${bold(bytes(zipFile.length))} zip ${gray(
        `[${ms(Date.now() - buildStart)}]`
      )}`
    )
  )

  const deploymentId = gcpConfig.functionName || 'now-' + desc.name + '-' + (await uid(10))
  const zipFileName = `${deploymentId}.zip`

  const { project } = ctx.authConfig.credentials.find(p => p.provider === 'gcp')

  const resourcesStart = Date.now()

  debug('checking gcp function check')
  const fnCheckExistsRes = await fetch(
    `https://cloudfunctions.googleapis.com/v1beta2/projects/${project.id}/locations/${region}/functions/${deploymentId}`,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    }
  )
  const fnExists = fnCheckExistsRes.status !== 404

  const stopResourcesSpinner = wait(`${fnExists ? 'Updating' : 'Creating'} API resources`)

  if (!ctx.config.gcp) ctx.config.gcp = {}
  if (!ctx.config.gcp.bucketName) {
    ctx.config.gcp.bucketName = generateBucketName()
    writeToConfigFile(ctx.config)
  }

  const { bucketName } = ctx.config.gcp

  debug('creating gcp storage bucket')
  const bucketRes = await fetch(
    `https://www.googleapis.com/storage/v1/b?project=${project.id}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: bucketName
      })
    }
  )

  if (
    bucketRes.status !== 200 &&
    bucketRes.status !== 409 /* already exists */
  ) {
    console.error(
      error(
        `Error while creating GCP Storage bucket: ${await bucketRes.text()}`
      )
    )
    return 1
  }

  debug('creating gcp storage file')
  const fileRes = await fetch(
    `https://www.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
      bucketName
    )}/o?uploadType=media&name=${encodeURIComponent(
      zipFileName
    )}&project=${encodeURIComponent(project.id)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': zipFile.length,
        Authorization: `Bearer ${token}`
      },
      body: zipFile
    }
  )

  try {
    await assertSuccessfulResponse(fileRes)
  } catch (err) {
    console.error(error(err.message))
    return 1
  }

  debug('creating gcp function create')
  const fnCreateRes = await fetch(
    `https://cloudfunctions.googleapis.com/v1beta2/projects/${project.id}/locations/${region}/functions${fnExists ? `/${deploymentId}` : ''}`,
    {
      method: fnExists ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: `projects/${project.id}/locations/${region}/functions/${deploymentId}`,
        timeout: gcpConfig.timeout || '15s',
        availableMemoryMb: gcpConfig.memory || 512,
        sourceArchiveUrl: `gs://${encodeURIComponent(
          bucketName
        )}/${zipFileName}`,
        entryPoint: 'handler',
        httpsTrigger: {
          url: null
        }
      })
    }
  )

  if (403 === fnCreateRes.status) {
    const url = `https://console.cloud.google.com/apis/api/cloudfunctions.googleapis.com/overview?project=${project.id}`
    console.error(
      error(
        'GCP Permission Denied error. Make sure the "Google Cloud Functions API" ' +
          `is enabled in the API Manager\n  ${bold('API Manager URL')}: ${link(
            url
          )}`
      )
    )
    return 1
  }

  try {
    await assertSuccessfulResponse(fnCreateRes)
  } catch (err) {
    console.error(error(err.message))
    return 1
  }

  let retriesLeft = 10
  let status
  let url = ''

  do {
    if (!--retriesLeft) {
      console.error(
        error('Could not determine status of the deployment: ' + String(url))
      )
      return 1
    } else {
      await sleep(5000)
    }

    try {
      await assertSuccessfulResponse(fnCheckExistsRes)
    } catch (err) {
      console.error(error(err.message))
      return 1
    }

    ;({ status, httpsTrigger: { url } } = await fnCheckExistsRes.json())
  } while (status !== 'READY')

  stopResourcesSpinner()
  console.log(
    ok(
      `API resources ${fnExists ? 'updated' : 'created'} (id: ${param(deploymentId)}) ${gray(
        `[${ms(Date.now() - resourcesStart)}]`
      )}`
    )
  )

  const copied = copyToClipboard(url, ctx.config.copyToClipboard)

  console.log(
    success(
      `${link(url)} ${copied ? gray('(in clipboard)') : ''} ${gray(
        `[${ms(Date.now() - start)}]`
      )}`
    )
  )

  return 0
}

const assertSuccessfulResponse = async res => {
  if (!res.ok) {
    let msg
    let body

    try {
      body = await res.json()
    } catch (err) {
      msg = `An API error was returned (${res.status}), but the error code could not be diagnosed`
    }

    if (body && body.error) msg = body.error.message
    throw new Error(msg)
  }
}

module.exports = deploy
