import { env } from '$env/dynamic/private';

/** @type {import('./$types').LayoutServerLoad} */
export function load() {
	return { analyticsId: env.VERCEL_ANALYTICS_ID };
}
