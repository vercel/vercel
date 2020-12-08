async function waitFor(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

async function check(contentFn, regex, hardError = true) {
  let content;
  let lastErr;

  for (let tries = 0; tries < 30; tries++) {
    try {
      content = await contentFn();
      if (typeof regex === 'string') {
        if (regex === content) {
          return true;
        }
      } else if (regex.test(content)) {
        // found the content
        return true;
      }
      await waitFor(1000);
    } catch (err) {
      await waitFor(1000);
      lastErr = err;
    }
  }
  console.error('TIMED OUT CHECK: ', { regex, content, lastErr });

  if (hardError) {
    throw new Error('TIMED OUT: ' + regex + '\n\n' + content);
  }
  return false;
}

module.exports = {
  check,
  waitFor,
};
