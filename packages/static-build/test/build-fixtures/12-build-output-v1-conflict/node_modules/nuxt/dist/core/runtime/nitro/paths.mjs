import { joinURL } from "ufo";
import { useRuntimeConfig } from "#internal/nitro";
export function baseURL() {
  return useRuntimeConfig().app.baseURL;
}
export function buildAssetsDir() {
  return useRuntimeConfig().app.buildAssetsDir;
}
export function buildAssetsURL(...path) {
  return joinURL(publicAssetsURL(), useRuntimeConfig().app.buildAssetsDir, ...path);
}
export function publicAssetsURL(...path) {
  const publicBase = useRuntimeConfig().app.cdnURL || useRuntimeConfig().app.baseURL;
  return path.length ? joinURL(publicBase, ...path) : publicBase;
}
