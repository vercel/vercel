import { importAlias } from "@/import-alias";

export default req => {
  return new Response(`RANDOMNESS_PLACEHOLDER:${importAlias}`);
};
