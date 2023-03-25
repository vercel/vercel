type ProcOrError = Partial<Error> & {
  stdout: string;
  stderr: string;
};

function indent(content: string) {
  return '  ' + content.replace(/\n/g, '\n  ');
}

function getMessages(output: ProcOrError) {
  const { stdout, stderr, message } = output;
  const messages = [];

  if (stdout) {
    messages.push(`Stdout:\n${indent(stdout)}`);
  }
  if (stderr) {
    messages.push(`Stderr:\n${indent(stderr)}`);
  }

  // only show the spawn error if no better details are available
  if (messages.length === 0 && message) {
    messages.push(`Spawn Error:\n${indent(message)}`);
  }

  return messages;
}

function combineMessages(messages: string[], output: ProcOrError) {
  if (messages.length === 0) {
    return output.toString();
  }

  return messages.join(`\n\n-----\n\n`);
}

export default function formatOutput(output: ProcOrError) {
  const messages = getMessages(output);
  const combinedMessage = combineMessages(messages, output);
  const borderedMessage = `-----\n\n${combinedMessage}\n\n-----`;

  // add 2-space indent to match the Custom Message indent
  return indent(borderedMessage).trim();
}
