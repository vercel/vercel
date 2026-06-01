export function shouldUseCleanUrls(
  cleanUrls: boolean | undefined,
  cleanUrlsByDefault?: boolean | null
) {
  return cleanUrls ?? cleanUrlsByDefault === true;
}
