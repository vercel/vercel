import Client from '../client';
import textInput from '../input/text';

export default async function getAuthCode(client: Client) {
  return textInput({
    label: `- Transfer auth code: `,
    validateValue: isValidAuthCode,
    stdout: client.stderr
  });
}

function isValidAuthCode(code?: string): code is string {
  return !!(code && code.length > 0);
}
