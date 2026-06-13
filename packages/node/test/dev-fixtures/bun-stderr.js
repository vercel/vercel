const STDERR_TEST_MESSAGE = 'STDERR_TEST_MESSAGE_12345';

export function GET() {
  // Write to stderr during request handling
  console.error(STDERR_TEST_MESSAGE);
  return new Response('OK');
}
