export default async function readStandardInput(
  wait = 100
): Promise<string | undefined> {
  return new Promise<string | undefined>(resolve => {
    // There is no reliable way to determine if stdin is provided
    // so we use a timeout to resolve in case there is no stdin.
    const t = setTimeout(() => resolve(undefined), wait);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', data => {
      clearTimeout(t);
      resolve(data);
    });
  });
}
