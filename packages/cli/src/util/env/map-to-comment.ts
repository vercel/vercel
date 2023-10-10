import { Dictionary } from '@vercel/client';

export const mapToEnvValueWithComment = (
  oldEnvs: Dictionary<string | undefined>
): Dictionary<{ value: string; comment?: string }> => {
  const newEnvs: Dictionary<{ value: string; comment?: string }> = {};

  for (const [key, value] of Object.entries(oldEnvs)) {
    newEnvs[key] = { value: value || '', comment: undefined };
  }

  return newEnvs;
};
