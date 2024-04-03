import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  group: "special"
};

export const handle: HandleCustom = {
  links: [{ label: "Weird URL", link: "", key: "weird" }],
};
export const meta = generateMeta("Weird");
const filePath = "routes/weird-url.[_index].tsx ";

export default function SpecialCharPage() {
  return <RouteWrapper filePath={filePath}>SpecialChar Page</RouteWrapper>;
}
