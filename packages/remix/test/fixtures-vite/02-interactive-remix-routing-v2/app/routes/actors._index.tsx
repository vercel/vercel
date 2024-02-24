import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  name: "routes/actors._index.tsx"
};

export const handle: HandleCustom = {
  links: [{ label: "Actors", link: "", key: "actors" }],
};
export const meta = generateMeta("Actors");
const filePath = "routes/actors._index.tsx";

export default function ActorsindexPage() {
  return <RouteWrapper filePath={filePath}>Actorsindex Page</RouteWrapper>;
}
