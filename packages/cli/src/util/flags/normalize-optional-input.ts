import type Client from '../client';

export function normalizeOptionalInput(
  input: string | undefined
): string | undefined {
  const value = input?.trim();
  return value ? value : undefined;
}

export async function resolveOptionalInput(
  client: Client,
  input: string | undefined,
  defaultValue: string,
  promptMessage: string
): Promise<string> {
  const value = normalizeOptionalInput(input);
  if (value !== undefined) {
    return value;
  }

  if (!client.stdin.isTTY) {
    return defaultValue;
  }

  const response = await client.input.text({
    message: promptMessage,
    default: defaultValue,
  });

  return normalizeOptionalInput(response) || defaultValue;
}
