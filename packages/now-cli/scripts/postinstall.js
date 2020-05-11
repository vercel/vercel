// Check for legacy Now CLI name `now` and print a message if it exists
console.log({
  execPath: process.execPath,
  argv: process.argv,
  __dirname,
});
