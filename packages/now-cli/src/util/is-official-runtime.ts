export const isOfficialRuntime = (desired: string, name?: string): boolean => {
  return (
    typeof name === 'string' &&
    (name.startsWith(`@vercel/${desired}`) ||
      name.startsWith(`@now/${desired}`))
  );
};
