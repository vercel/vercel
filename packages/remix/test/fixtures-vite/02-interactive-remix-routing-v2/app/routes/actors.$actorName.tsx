import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  name: "routes/actors.$actorName.tsx"
};

export const handle: HandleCustom = {
  links: [
    { label: "Actors", link: "", key: "actor-root" },
    { label: "Profile", link: "", key: "profile" },
  ],
};
export const meta = generateMeta("Actor Profile");
const filePath = "routes/actors.$actorName.tsx";

export default function ActorsCommonActornamePage() {
  return (
    <RouteWrapper filePath={filePath}>ActorsCommonActorname Page</RouteWrapper>
  );
}
