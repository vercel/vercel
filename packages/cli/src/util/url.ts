export const maybeURL = (id: string): boolean =>
  // E.g, "appname-asdf"
  id.includes('-');

export const normalizeURL = (u: string): string => {
  // Normalize URL by removing slash from the end
  if (u.slice(-1) === '/') {
    u = u.slice(0, -1);
  }

  // `url` should match the hostname of the deployment
  u = u.replace(/^https:\/\//i, '');

  return u;
};
