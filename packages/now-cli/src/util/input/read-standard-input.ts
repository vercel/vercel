export default async function readStandardInput(wait = 150): Promise<string> {
  return new Promise<string>(resolve => {
    // There is no reliable way to determine if stdin was provided
    // so we use a timeout to resolve in case there is no stdin.
    const t = setTimeout(() => resolve(''), wait);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', data => {
      clearTimeout(t);
      resolve(data);
    });
  });
}
