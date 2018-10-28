// @flow
import sleep from './sleep';

function createPollingFn<T>(
  future: (...args: any[]) => Promise<T>,
  sleepTime: number
): (...args: any[]) => AsyncGenerator<T, void, void> {
  return async function*(...args: any[]) {
    while (true) {
      yield await future(...args);
      await sleep(sleepTime);
    }
  };
}

export default createPollingFn;
