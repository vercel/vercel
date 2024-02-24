import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  group: "concerts"
};

export const handle: HandleCustom = {
  links: [
    { label: "Concerts", link: "", key: "concerts" },
    { label: "Trending", link: "", key: "trending" },
  ],
};
export const meta = generateMeta("Trending Concerts");
const filePath = "routes/concerts.trending.tsx";

export default function ConcertsTrendingPage() {
  return <RouteWrapper filePath={filePath}>ConcertsTrending Page</RouteWrapper>;
}
