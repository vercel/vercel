// @flow

// theirs
const ms = require('ms')
const mri = require('mri')
const { gray, bold } = require('chalk')
const bytes = require('bytes')
const uid = require('uid-promise')
const retry = require('async-retry')
const debug = require('debug')('now:aws:deploy')

// ours
const resolve = require('../../resolve')
const ok = require('../../util/output/ok')
const wait = require('../../util/output/wait')
const info = require('../../util/output/info')
const error = require('../../util/output/error')
const link = require('../../util/output/link')
const success = require('../../util/output/success')
const param = require('../../util/output/param')
const humanPath = require('../../util/humanize-path')
const build = require('../../serverless/build')
const getLambdaHandler = require('./get-lambda-handler')
const getAWS = require('./get-aws')
const describeProject = require('../../describe-project')
const copyToClipboard = require('../../util/copy-to-clipboard')

const NOW_DEFAULT_IAM_ROLE = 'now-default-role'
const IAM_POLICY_DOCUMENT = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: '',
      Effect: 'Allow',
      Principal: {
        Service: 'lambda.amazonaws.com'
      },
      Action: 'sts:AssumeRole'
    }
  ]
}

const deploy = async ({
  config,
  authConfig,
  argv: argv_
}: {
  config: any,
  authConfig: any,
  argv: Array<string>
}) => {
  const argv = mri(argv_, {
    boolean: ['help'],
    alias: {
      help: 'h'
    }
  })

  // `now [provider] [deploy] [target]`
  const [cmdOrTarget = null, target_ = null] = argv._.slice(2).slice(-2)

  let target

  if (cmdOrTarget === 'aws' || cmdOrTarget === 'deploy') {
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

  let desc

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

  // a set of files that we personalize for this build
  const overrides = {
    '__now_handler.js': getLambdaHandler(desc)
  }

  // initialize aws client
  const aws = getAWS(authConfig)
  const region = aws.config.region || 'us-west-1'

  console.log(
    info(
      `Deploying ${param(humanPath(resolved))} ${gray('(aws)')} ${gray(
        `(${region})`
      )}`
    )
  )
  const buildStart = Date.now()
  const stopBuildSpinner = wait('Building and bundling your app…')
  const zipFile = await build(resolved, desc, { overrides })
  stopBuildSpinner()

  // lambda limits to 50mb
  if (zipFile.length > 50 * 1024 * 1024) {
    console.error(error('The build exceeds the 50mb AWS Lambda limit'))
    return 1
  }

  console.log(
    ok(
      `Build generated a ${bold(bytes(zipFile.length))} zip ${gray(
        `[${ms(Date.now() - buildStart)}]`
      )}`
    )
  )

  const iam = new aws.IAM({ apiVersion: '2010-05-08' })

  const gateway = new aws.APIGateway({
    apiVersion: '2015-07-09',
    region
  })

  const lambda = new aws.Lambda({
    apiVersion: '2015-03-31',
    region
  })

  let role

  try {
    role = await getRole(iam, { RoleName: NOW_DEFAULT_IAM_ROLE })
  } catch (err) {
    if ('NoSuchEntity' === err.code) {
      const iamStart = Date.now()
      role = await createRole(iam, {
        AssumeRolePolicyDocument: JSON.stringify(IAM_POLICY_DOCUMENT),
        RoleName: NOW_DEFAULT_IAM_ROLE
      })
      console.log(
        ok(
          `Initialized IAM role ${param(NOW_DEFAULT_IAM_ROLE)} ${gray(
            `[${ms(iamStart - Date.now())}]`
          )}`
        )
      )
    } else {
      throw err
    }
  }

  const deploymentId = 'now-' + desc.name + '-' + (await uid(10))

  const resourcesStart = Date.now()
  const stopResourcesSpinner = wait('Creating API resources')

  debug('initializing lambda function')
  const λ = await retry(
    async bail => {
      try {
        return await createFunction(lambda, {
          Code: {
            ZipFile: zipFile
          },
          Runtime: 'nodejs6.10',
          Description: desc.description,
          FunctionName: deploymentId,
          Handler: '__now_handler.handler',
          Role: role.Role.Arn,
          Timeout: 15,
          MemorySize: 512
        })
      } catch (err) {
        if (
          err.retryable ||
          // created role is not ready
          err.code === 'InvalidParameterValueException'
        ) {
          debug('retrying creating function (%s)', err.message)
          throw err
        }

        bail(err)
      }
    },
    { minTimeout: 2500, maxTimeout: 5000 }
  )

  debug('initializing api gateway')
  const api = await createAPI(gateway, {
    name: deploymentId,
    description: desc.description
  })

  debug('retrieving root resource id')
  const resources = await getResources(gateway, {
    restApiId: api.id
  })
  const rootResourceId = resources.items[0].id

  debug('initializing gateway method for /')
  await putMethod(gateway, {
    restApiId: api.id,
    authorizationType: 'NONE',
    httpMethod: 'ANY',
    resourceId: rootResourceId
  })

  debug('initializing gateway integration for /')
  await putIntegration(gateway, {
    restApiId: api.id,
    resourceId: rootResourceId,
    httpMethod: 'ANY',
    type: 'AWS_PROXY',
    integrationHttpMethod: 'POST',
    uri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${λ.FunctionArn}/invocations`
  })

  debug('initializing gateway resource')
  const resource = await createResource(gateway, {
    restApiId: api.id,
    parentId: rootResourceId,
    pathPart: '{proxy+}'
  })

  debug('initializing gateway method for {proxy+}')
  await putMethod(gateway, {
    restApiId: api.id,
    authorizationType: 'NONE',
    httpMethod: 'ANY',
    resourceId: resource.id
  })

  debug('initializing gateway integration for {proxy+}')
  await putIntegration(gateway, {
    restApiId: api.id,
    resourceId: resource.id,
    httpMethod: 'ANY',
    type: 'AWS_PROXY',
    integrationHttpMethod: 'POST',
    uri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${λ.FunctionArn}/invocations`
  })

  debug('creating deployment')
  await createDeployment(gateway, {
    restApiId: api.id,
    stageName: 'now'
  })

  const [, accountId] = role.Role.Arn.match(/^arn:aws:iam::(\d+):/)

  await addPermission(lambda, {
    FunctionName: deploymentId,
    StatementId: deploymentId,
    Action: 'lambda:InvokeFunction',
    Principal: 'apigateway.amazonaws.com',
    SourceArn: `arn:aws:execute-api:${region}:${accountId}:${api.id}/now/ANY/*`
  })

  stopResourcesSpinner()
  console.log(
    ok(
      `API resources created (id: ${param(deploymentId)}) ${gray(
        `[${ms(Date.now() - resourcesStart)}]`
      )}`
    )
  )

  const url = `https://${api.id}.execute-api.${region}.amazonaws.com/now`
  const copied = copyToClipboard(url, config.copyToClipboard)

  console.log(
    success(
      `${link(url)} ${copied ? gray('(in clipboard)') : ''} ${gray(
        `[${ms(Date.now() - start)}]`
      )}`
    )
  )

  return 0
}

const getRole = (iam, params) => {
  return new Promise((res, reject) => {
    iam.getRole(params, (err, data) => {
      if (err) return reject(err)
      res(data)
    })
  })
}

const createRole = (iam, params) => {
  return new Promise((res, reject) => {
    iam.createRole(params, (err, data) => {
      if (err) return reject(err)
      res(data)
    })
  })
}

const createFunction = (lambda, params) => {
  return new Promise((res, reject) => {
    lambda.createFunction(params, (err, data) => {
      if (err) return reject(err)
      res(data)
    })
  })
}

const addPermission = (lambda, params) => {
  return new Promise((res, reject) => {
    lambda.addPermission(params, (err, data) => {
      if (err) return reject(err)
      res(data)
    })
  })
}

const createAPI = (gateway, params) => {
  return new Promise((res, reject) => {
    gateway.createRestApi(params, (err, data) => {
      if (err) return reject(err)
      res(data)
    })
  })
}

const getResources = (gateway, params) => {
  return new Promise((res, reject) => {
    gateway.getResources(params, (err, data) => {
      if (err) return reject(err)
      res(data)
    })
  })
}

const createResource = (gateway, params) => {
  return new Promise((res, reject) => {
    gateway.createResource(params, (err, data) => {
      if (err) return reject(err)
      res(data)
    })
  })
}

const putMethod = (gateway, params) => {
  return new Promise((res, reject) => {
    gateway.putMethod(params, (err, data) => {
      if (err) return reject(err)
      res(data)
    })
  })
}

const putIntegration = (gateway, params) => {
  return new Promise((res, reject) => {
    gateway.putIntegration(params, (err, data) => {
      if (err) return reject(err)
      res(data)
    })
  })
}

const createDeployment = (gateway, params) => {
  return new Promise((res, reject) => {
    gateway.createDeployment(params, (err, data) => {
      if (err) return reject(err)
      res(data)
    })
  })
}

module.exports = deploy
