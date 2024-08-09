/* eslint-disable no-var */

declare global {
  // must be `var` to work
  var process: {
    env: Record<string, string>;
  };
}
