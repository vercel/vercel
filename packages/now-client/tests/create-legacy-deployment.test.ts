import path from 'path'
import { TOKEN } from './constants'
import { fetch, API_DELETE_DEPLOYMENTS_LEGACY } from '../src/utils'
import { Deployment } from './types'
import { createLegacyDeployment } from '../src/index'

describe('create v1 deployment', () => {
  let deployment: Deployment | undefined

  afterEach(async () => {
    if (deployment) {
      const response = await fetch(
        `${API_DELETE_DEPLOYMENTS_LEGACY}/${deployment.deploymentId || deployment.uid}`,
        TOKEN,
        {
          method: 'DELETE'
        }
      )
      expect(response.status).toEqual(200)
      deployment = undefined
    }
  })

  it('will create a v1 static deployment', async () => {
    for await (const event of createLegacyDeployment(
      path.resolve(__dirname, 'fixtures', 'v1', 'static'),
      {
        token: TOKEN,
        name: 'now-client-tests-v1-static'
      }
    )) {
      if (event.type === 'ready') {
        deployment = event.payload
        if (deployment) {
          expect(deployment.readyState || deployment.state).toEqual('READY')
          break
        }
      }
    }
  })

  it('will create a v1 npm deployment', async () => {
    for await (const event of createLegacyDeployment(
      path.resolve(__dirname, 'fixtures', 'v1', 'npm'),
      {
        token: TOKEN,
        name: 'now-client-tests-v1-npm'
      }
    )) {
      if (event.type === 'ready') {
        deployment = event.payload
        if (deployment) {
          expect(deployment.readyState || deployment.state).toEqual('READY')
          break
        }
      }
    }
  })

  it('will create a v1 Docker deployment', async () => {
    for await (const event of createLegacyDeployment(
      path.resolve(__dirname, 'fixtures', 'v1', 'docker'),
      {
        token: TOKEN,
        name: 'now-client-tests-v1-docker'
      }
    )) {
      if (event.type === 'ready') {
        deployment = event.payload
        if (deployment) {
          expect(deployment.readyState || deployment.state).toEqual('READY')
          break
        }
      }
    }
  })
})
