import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  name: "routes/[sitemap2.xml]"
};

export const handle: HandleCustom = {
  links: [{ label: "Sitemap 2", link: "/sitemap2.xml", key: "Sitemap-2" }],
};
export const meta = generateMeta("Sitemap 2");
const filePath = "routes/[sitemap2.xml].tsx";

export default function SpecialCharPage() {
  return <RouteWrapper filePath={filePath}>SpecialChar Page</RouteWrapper>;
}
