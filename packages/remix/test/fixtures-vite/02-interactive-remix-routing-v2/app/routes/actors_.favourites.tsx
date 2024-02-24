import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  name: "routes/actors_.favourites.tsx"
};

export const handle: HandleCustom = {
  links: [
    { label: "Actors", link: "", key: "actors-root" },
    { label: "Favourites", link: "", key: "favourites" },
  ],
};
export const meta = generateMeta("Favourite Actors");
const filePath = "routes/actors_.favourites.tsx";

export default function ActorsFavouritesPage() {
  return <RouteWrapper filePath={filePath}>ActorsFavourites Page</RouteWrapper>;
}
