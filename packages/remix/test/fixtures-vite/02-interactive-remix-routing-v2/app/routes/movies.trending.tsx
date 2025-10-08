import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  group: "movies"
};

export const handle: HandleCustom = {
  links: [{ label: "Trending", link: "", key: "trending" }],
};
export const meta = generateMeta("Trending Movies");
const filePath = "routes/movies.trending.tsx";

export default function MoviesTrendingPage() {
  return <RouteWrapper filePath={filePath}>MoviesTrending Page</RouteWrapper>;
}
