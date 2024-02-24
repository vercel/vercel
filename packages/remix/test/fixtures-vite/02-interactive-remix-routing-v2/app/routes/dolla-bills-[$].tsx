import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  group: "special"
};

export const handle: HandleCustom = {
  links: [{ label: "Doll Bills", link: "", key: "" }],
};
export const meta = generateMeta("Dolla");
const filePath = "routes/dolla-bills-[$].tsx 	";

export default function SpecialCharPage() {
  return <RouteWrapper filePath={filePath}>SpecialChar Page</RouteWrapper>;
}
