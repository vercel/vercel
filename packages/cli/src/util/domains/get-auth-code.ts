import type Client from '../client';

export default async function getAuthCode(client: Client, code?: string) {
  if (isValidAuthCode(code)) {
    return code;
  }
  return client.input.text({
    message: `- Transfer auth code: `,
    validate: isValidAuthCode,
  });
}

function isValidAuthCode(code?: string): code is string {
  return !!(code && code.length > 0);
}
