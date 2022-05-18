import { defineComponent, isRef, Transition } from "vue";
import { _wrapIf } from "./utils.mjs";
import { useRoute } from "#app";
import layouts from "#build/layouts";
const defaultLayoutTransition = { name: "layout", mode: "out-in" };
export default defineComponent({
  props: {
    name: {
      type: [String, Boolean, Object],
      default: null
    }
  },
  setup(props, context) {
    const route = useRoute();
    return () => {
      const layout = (isRef(props.name) ? props.name.value : props.name) ?? route.meta.layout ?? "default";
      const hasLayout = layout && layout in layouts;
      if (process.dev && layout && !hasLayout && layout !== "default") {
        console.warn(`Invalid layout \`${layout}\` selected.`);
      }
      return _wrapIf(Transition, hasLayout && (route.meta.layoutTransition ?? defaultLayoutTransition), _wrapIf(layouts[layout], hasLayout, context.slots)).default();
    };
  }
});
