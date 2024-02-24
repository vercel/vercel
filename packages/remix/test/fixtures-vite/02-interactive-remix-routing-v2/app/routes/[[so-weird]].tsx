import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  group: "special"
};

export const handle: HandleCustom = {
  links: [{ label: "[so-weird]", link: "/", key: "so-weird" }],
};
export const meta = generateMeta("So Weird");
const filePath = "routes/[[so-weird]].tsx";

export default function SpecialCharPage() {
  return <RouteWrapper filePath={filePath}>SpecialChar Page</RouteWrapper>;
}
