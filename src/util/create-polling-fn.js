import { infinite, delay, map } from 'shiksha';

const createPollingFn = (future, sleepTime) => (...args) =>
  map(() => future(...args), delay(sleepTime, infinite()));

export default createPollingFn;
