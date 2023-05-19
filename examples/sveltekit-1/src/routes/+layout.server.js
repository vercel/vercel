import { VERCEL_ANALYTICS_ID } from '$env/static/private';

/** @type {import('./$types').LayoutServerLoad} */
export function load() {
	return { analyticsId: VERCEL_ANALYTICS_ID };
}
