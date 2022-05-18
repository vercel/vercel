import { isRef, ref } from "vue";
export const wrapInRef = (value) => isRef(value) ? value : ref(value);
