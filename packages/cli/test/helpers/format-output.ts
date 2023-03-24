interface ProcOutput {
  stdout: string;
  stderr: string;
}

export default function formatOutput(output: ProcOutput | Error) {
  if (output instanceof Error) {
    return output.stack || 'Error: (no stack)';
  }

  const { stdout, stderr } = output;

  return `
-----

Stderr:
${stderr || '(no output)'}

-----

Stdout:
${stdout || '(no output)'}

-----
  `;
}
