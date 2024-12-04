import { onCLS, onFCP, onFID, onLCP, onTTFB, type Metric } from 'web-vitals';

const vitalsUrl = 'https://vitals.vercel-analytics.com/v1/vitals';

function getConnectionSpeed() {
	// @ts-ignore
	return navigator?.connection?.effectiveType ?? '';
}

function sendToAnalytics(metric: Metric, options: { params: { [s: string]: any; } | ArrayLike<any>; path: string; analyticsId: string; debug: boolean; }) {
	const page = Object.entries(options.params).reduce(
		(acc, [key, value]) => acc.replace(value, `[${key}]`),
		options.path
	);

	const body = {
		dsn: options.analyticsId,
		id: metric.id,
		page,
		href: location.href,
		event_name: metric.name,
		value: metric.value.toString(),
		speed: getConnectionSpeed()
	};

	if (options.debug) {
		console.log('[Web Vitals]', metric.name, JSON.stringify(body, null, 2));
	}

	const blob = new Blob([new URLSearchParams(body).toString()], {
		// This content type is necessary for `sendBeacon`
		type: 'application/x-www-form-urlencoded'
	});
	if (navigator.sendBeacon) {
		navigator.sendBeacon(vitalsUrl, blob);
	} else
		fetch(vitalsUrl, {
			body: blob,
			method: 'POST',
			credentials: 'omit',
			keepalive: true
		});
}

export function webVitals(options: any) {
	try {
		console.log(`[Web Vitals] for page ${options.path}`);
		onFID((metric) => sendToAnalytics(metric, options));
		onTTFB((metric) => sendToAnalytics(metric, options));
		onLCP((metric) => sendToAnalytics(metric, options));
		onCLS((metric) => sendToAnalytics(metric, options));
		onFCP((metric) => sendToAnalytics(metric, options));
	} catch (err) {
		console.error(`[Web Vitals] for page ${options.path}`, err);
	}
}
