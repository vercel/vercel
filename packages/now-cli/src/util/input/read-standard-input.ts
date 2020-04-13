export default async function readStandardInput(): Promise<string> {
  return new Promise<string>(resolve => {
    if (process.env.__NOW_STDIN_CI) {
      // special case CI to avoid hanging
      const t = setTimeout(() => resolve(''), 200);
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', data => {
        clearTimeout(t);
        resolve(data);
      });
      return;
    }

    if (process.stdin.isTTY) {
      // found tty so we know there is nothing piped to stdin
      resolve('');
    } else {
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', resolve);
    }
  });
}
