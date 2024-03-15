import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  group: "special"
};

export const handle: HandleCustom = {
  links: [{ label: "Sitemap", link: "", key: "sitemap" }],
};
export const meta = generateMeta("Sitemap");
const filePath = "routes/sitemap[.]xml.tsx 	";

export default function SpecialCharPage() {
  return <RouteWrapper filePath={filePath}>SpecialChar Page</RouteWrapper>;
}
