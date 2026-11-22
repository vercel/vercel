import epipebomb from 'epipebomb';

const SILENCED_ERRORS = [
  'DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.',
];

let installed = false;

export function installProcessGuards(): void {
  if (installed) return;
  installed = true;

  // biome-ignore lint/suspicious/noConsole: intentional console usage
  const originalError = console.error;
  console.error = (msg: unknown) => {
    const isSilencedError = SILENCED_ERRORS.some(
      error => typeof msg === 'string' && msg.includes(error)
    );
    if (isSilencedError) {
      return;
    }
    originalError(msg);
  };

  /*
    By default, node throws EPIPE errors if process.stdout is being written to
    and a user runs it through a pipe that gets closed while the process is still outputting
    (eg, the simple case of piping a node app through head).

    This suppresses those errors.
  */
  epipebomb();
}
