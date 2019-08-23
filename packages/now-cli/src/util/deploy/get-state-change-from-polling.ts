//
import sleep from '../sleep';

import createPollingFn from '../create-polling-fn';

import getDeploymentByIdOrThrow from './get-deployment-by-id-or-throw';

const POLLING_INTERVAL = 5000;

async function* getStatusChangeFromPolling(
  now: any,
  contextName: string,
  idOrHost: string,
  initialState: string
) {
  const pollDeployment = createPollingFn(
    getDeploymentByIdOrThrow,
    POLLING_INTERVAL
  );
  let prevState = initialState;
  for await (const deployment of pollDeployment(now, contextName, idOrHost)) {
    if (prevState !== deployment.state) {
      await sleep(5000);
      yield {
        type: 'state-change',
        created: Date.now(),
        payload: { value: deployment.state }
      };
    } else {
      prevState = deployment.state;
    }
  }
}

export default getStatusChangeFromPolling;
