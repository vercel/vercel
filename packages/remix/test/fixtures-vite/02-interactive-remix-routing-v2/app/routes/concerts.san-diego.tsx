import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  name: "routes/concerts.san-diego.tsx"
};

export const handle: HandleCustom = {
  links: [
    { label: "Concerts", link: "", key: "concerts" },
    { label: "San Diego", link: "", key: "san-diego" },
  ],
};
export const meta = generateMeta("Concerts in San Diego");
const filePath = "routes/concerts.san-diego.tsx";

export default function ConcertsSanDiegoPage() {
  return <RouteWrapper filePath={filePath}>ConcertsSanDiego Page</RouteWrapper>;
}
