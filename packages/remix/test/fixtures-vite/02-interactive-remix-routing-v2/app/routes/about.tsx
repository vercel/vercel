import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  group: "basic"
};

export const handle: HandleCustom = {
  links: [{ label: "About", link: "/about", key: "about" }],
};
export const meta = generateMeta("About");

const filePath = "routes/about.tsx";

export default function AboutPage() {
  return <RouteWrapper filePath={filePath}>About Page</RouteWrapper>;
}
