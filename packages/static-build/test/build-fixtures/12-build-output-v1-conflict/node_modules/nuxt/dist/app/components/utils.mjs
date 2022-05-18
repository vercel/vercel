import { h } from "vue";
const Fragment = {
  setup(_props, { slots }) {
    return () => slots.default?.();
  }
};
export const _wrapIf = (component, props, slots) => {
  return { default: () => props ? h(component, props === true ? {} : props, slots) : h(Fragment, {}, slots) };
};
