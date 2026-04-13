/**
 * Generate a dashboard URL for a specific flag
 */
export function getFlagDashboardUrl(
  orgSlug: string,
  projectName: string,
  flagSlug: string
): string {
  return `https://vercel.com/${orgSlug}/${projectName}/flag/${flagSlug}`;
}

/**
 * Generate a dashboard URL for the flags list
 */
export function getFlagsDashboardUrl(
  orgSlug: string,
  projectName: string
): string {
  return `https://vercel.com/${orgSlug}/${projectName}/flags`;
}
