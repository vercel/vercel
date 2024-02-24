import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  name: "routes/movies.$movieName.tsx"
};

export const handle: HandleCustom = {
  links: [{ label: "Movies", link: "", key: "movies" }],
};
export const meta = generateMeta("Movies");
const filePath = "routes/movies.$movieName.tsx";

export default function MoviesCommonMovienamePage() {
  return (
    <RouteWrapper filePath={filePath}>MoviesCommonMoviename Page</RouteWrapper>
  );
}
