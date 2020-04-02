export default async function readStandardInput(): Promise<string> {
  return new Promise<string>(resolve => {
    if (process.stdin.isTTY) {
      // In this case, no data is being piped to stdin.
      // See https://stackoverflow.com/q/39801643/266535
      // The empty string is used here to avoid `<string | undefined>` type.
      resolve('');
    } else {
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', data => resolve(data));
    }
  });
}
