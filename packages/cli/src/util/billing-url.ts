/**
 * Build the URL to a team's billing settings, where upgrades and payment
 * methods are managed. Shared so the various "upgrade to Pro" / payment nudges
 * point at the same place.
 */
export const getTeamBillingUrl = (teamSlug: string) =>
  `https://vercel.com/${teamSlug}/~/settings/billing`;
