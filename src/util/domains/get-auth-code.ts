import textInput from '../input/text';

export default async function getAuthCode(code?: string) {
  if (isValidAuthCode(code)) {
    return code;
  }
  return textInput({
    label: `- Transfer auth code: `,
    validateValue: isValidAuthCode
  });
}

function isValidAuthCode(code?: string): code is string {
  return !!(code && code.length > 0);
}
