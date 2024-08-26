export default function parsePolicy(policy?: string | string[]) {
  if (!policy) {
    return {};
  }

  if (typeof policy === 'string') {
    policy = [policy];
  }

  const parsed: { [k: string]: string } = {};

  for (const item of policy) {
    const [key, ...rest] = item.split('=');
    parsed[key] = rest.join('=');
  }

  return parsed;
}
