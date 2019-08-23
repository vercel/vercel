import wait from './output/wait';

export default async function withSpinner<T>(msg: string, f: () => Promise<T>) {
  const stopSpinner = wait(msg);
  try {
    const res = await f();
    stopSpinner();
    return res;
  } catch (error) {
    stopSpinner();
    throw error;
  }
}
