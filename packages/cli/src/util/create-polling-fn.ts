import sleep from './sleep';

export default function createPollingFn<R>(
  future: (...args: any[]) => Promise<R>,
  sleepTime: number
) {
  return async function*(...args: any[]) {
    while (true) {
      yield await future(...args);
      await sleep(sleepTime);
    }
  };
}
