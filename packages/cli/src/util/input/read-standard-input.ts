export default async function readStandardInput(): Promise<string> {
  return new Promise<string>(resolve => {
    setTimeout(() => resolve(''), 500);

    if (process.stdin.isTTY) {
      // found tty so we know there is nothing piped to stdin
      resolve('');
    } else {
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', resolve);
    }
  });
}
