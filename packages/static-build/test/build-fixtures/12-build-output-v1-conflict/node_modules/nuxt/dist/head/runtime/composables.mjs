import { isFunction } from "@vue/shared";
import { computed } from "vue";
import { useNuxtApp } from "#app";
export function useHead(meta) {
  const resolvedMeta = isFunction(meta) ? computed(meta) : meta;
  useNuxtApp()._useHead(resolvedMeta);
}
export function useMeta(meta) {
  return useHead(meta);
}
