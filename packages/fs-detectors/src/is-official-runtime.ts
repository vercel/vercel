/*
 * Helper function to support both `@vercel` and legacy `@now` official Runtimes.
 */
export const isOfficialRuntime = (desired: string, name?: string): boolean => {
  if (typeof name !== 'string') {
    return false;
  }
  return (
    name === `@vercel/${desired}` ||
    name === `@now/${desired}` ||
    name.startsWith(`@vercel/${desired}@`) ||
    name.startsWith(`@now/${desired}@`)
  );
};

/*
 * Helper function to detect both `@vercel/static` and legacy `@now/static` official Runtimes.
 */
export const isStaticRuntime = (name?: string): boolean => {
  return isOfficialRuntime('static', name);
};
