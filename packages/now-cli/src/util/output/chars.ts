const chars = {
  // in some setups now.exe crashes if we use
  // the normal tick unicode character :|
  tick: process.platform === 'win32' ? '√' : '✔',
  cross: process.platform === 'win32' ? '☓' : '✘'
};

export default chars;
