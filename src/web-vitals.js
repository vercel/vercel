import { getCLS, getFCP, getFID, getLCP, getTTFB } from "web-vitals";

let isRegistered = false;

function onError(err) {
  console.error("[gatsby-plugin-vercel]", err); // eslint-disable-line no-console
}

function onDebug(label, payload) {
  console.log(label, payload); // eslint-disable-line no-console
}

function sendToAnalytics(metric, options) {
  const body = {
    dsn: options.analyticsId,
    id: metric.id,
    page: location.pathname,
    href: location.href,
    event_name: metric.name,
    value: metric.value.toString(),
    speed:
      "connection" in navigator &&
      navigator["connection"] &&
      "effectiveType" in navigator["connection"]
        ? navigator["connection"]["effectiveType"]
        : "",
  };

  if (options.debug) {
    onDebug(metric.name, JSON.stringify(body, null, 2));
  }

  const blob = new Blob([new URLSearchParams(body).toString()], {
    // This content type is necessary for `sendBeacon`:
    type: "application/x-www-form-urlencoded",
  });
  const vitalsUrl = "https://vitals.vercel-analytics.com/v1/vitals";
  (navigator.sendBeacon && navigator.sendBeacon(vitalsUrl, blob)) ||
    fetch(vitalsUrl, {
      body: blob,
      method: "POST",
      credentials: "omit",
      keepalive: true,
    });
}

export async function webVitals({ options }) {
  // Only register listeners once
  if (isRegistered) {
    return;
  }
  isRegistered = true;

  try {
    getFID((metric) => sendToAnalytics(metric, options));
    getTTFB((metric) => sendToAnalytics(metric, options));
    getLCP((metric) => sendToAnalytics(metric, options));
    getCLS((metric) => sendToAnalytics(metric, options));
    getFCP((metric) => sendToAnalytics(metric, options));
  } catch (err) {
    onError(err);
  }
}
