// @flow
import { Now } from '../../util/types';
import createPollingFn from '../../../../util/create-polling-fn';
import type { StateChangeEvent } from '../types';
import getDeploymentByIdOrThrow from './get-deployment-by-id-or-throw';
import { map, pairwise, unshift, filter, delay } from 'shiksha';

const POLLING_INTERVAL = 1000;

const getStatusChangeFromPolling = (
  now: Now,
  contextName: string,
  idOrHost: string,
  initialState: 'INITIALIZING' | 'FROZEN' | 'READY' | 'ERROR'
): AsyncGenerator<StateChangeEvent, void, void> => {
  const pollDeployment = createPollingFn(
    getDeploymentByIdOrThrow,
    POLLING_INTERVAL
  );

  return delay(
    5000,
    map(
      ([, state]) => ({
        type: 'state-change',
        created: Date.now(),
        payload: { value: state }
      }),
      filter(
        ([prev, curr]) => prev !== curr,
        unshift(
          initialState,
          pairwise(
            map(
              deployment => deployment.state,
              pollDeployment(now, contextName, idOrHost)
            )
          )
        )
      )
    )
  );
};

export default getStatusChangeFromPolling;
