import { isExperimentalServicesEnabled } from '../projects/detect-services';

export function isExperimentalSkipDevLinkEnabled(): boolean {
  return (
    process.env.VERCEL_EXPERIMENTAL_DEV_SKIP_LINK === '1' ||
    process.env.VERCEL_EXPERIMENTAL_DEV_SKIP_LINK?.toLowerCase() === 'true' ||
    isExperimentalServicesEnabled()
  );
}
