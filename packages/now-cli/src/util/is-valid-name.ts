// Soft validation to prevent invalid API calls
export function isValidName(name: string = ''): boolean {
  // The name must have at least one different character.
  // We need to do it this way to still allow project names
  // with different characters, like other languages, but
  // prevent API calls like `https://api.zeit.co/v5/now/deployments/%2F`
  const blacklist = ':/#?&@%+~'.split('');
  return !name.split('').every(c => blacklist.includes(c));
}
