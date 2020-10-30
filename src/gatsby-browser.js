import { webVitals } from "./web-vitals";

export const onClientEntry = (_, pluginOptions = {}) => {
  let options = {
    projectId: process.env.VERCEL_ANALYTICS_ID,
    debug: false,
    ...pluginOptions,
  };

  if (!options.projectId) {
    return null;
  }

  if (options.debug || process.env.NODE_ENV === "production") {
    webVitals({ options });
  }
};
