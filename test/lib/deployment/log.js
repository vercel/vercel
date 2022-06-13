const fs = require('fs');
const util = require('util');
const isCi = require('is-ci');

const shouldWriteToFile = isCi || process.env.WRITE_LOGS_TO_FILES;

exports.logWithinTest = logWithinTest;

const dateFormat = new Intl.DateTimeFormat('en-us', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

function logWithinTest(...inputs) {
  const { testPath, currentTestName } =
    typeof expect !== 'undefined' ? expect.getState() : {};

  const messages = [
    dateFormat.format(new Date()),
    currentTestName,
    ...inputs,
  ].filter(Boolean);
  const message = messages
    .map(x => (typeof x === 'string' ? x : util.inspect(x)))
    .join('\t');

  if (shouldWriteToFile && testPath) {
    const filePath = `${testPath}.artifact.log`;
    fs.appendFileSync(filePath, `${message.trim()}\n`);
  }

  console.log(message.trim());
}
