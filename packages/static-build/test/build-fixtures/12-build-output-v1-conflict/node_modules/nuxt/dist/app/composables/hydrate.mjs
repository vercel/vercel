import { useNuxtApp } from "#app";
export const useHydration = (key, get, set) => {
  const nuxt = useNuxtApp();
  if (process.server) {
    nuxt.hooks.hook("app:rendered", () => {
      nuxt.payload[key] = get();
    });
  }
  if (process.client) {
    nuxt.hooks.hook("app:created", () => {
      set(nuxt.payload[key]);
    });
  }
};
