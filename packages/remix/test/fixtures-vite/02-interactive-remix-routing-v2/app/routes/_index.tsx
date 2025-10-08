import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  group: "basic"
};

export const handle: HandleCustom = {
  links: [{ label: "Home", link: "/", key: "home" }],
};
export const meta = generateMeta("Home");

const filePath = "routes/index.tsx";

export default function HomePage() {
  return <RouteWrapper filePath={filePath}>Home Page</RouteWrapper>;
}
