import { webVitals } from "./web-vitals";

export const onClientEntry = (_, pluginOptions = {}) => {
  let options = {
    projectId: undefined,
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
