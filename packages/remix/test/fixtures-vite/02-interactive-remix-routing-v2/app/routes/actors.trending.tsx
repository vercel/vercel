import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  group: "actors"
};

export const handle: HandleCustom = {
  links: [
    { label: "Actors", link: "", key: "actors" },
    { label: "Trending", link: "", key: "trending" },
  ],
};
export const meta = generateMeta("Trending Actors");
const filePath = "routes/actors.trending.tsx";

export default function ActorsTrendingPage() {
  return <RouteWrapper filePath={filePath}>ActorsTrending Page</RouteWrapper>;
}
