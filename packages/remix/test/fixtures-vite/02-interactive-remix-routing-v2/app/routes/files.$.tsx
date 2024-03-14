import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  group: "basic"
};

export const handle: HandleCustom = {
  links: [{ label: "Files", link: "", key: "files" }],
};
export const meta = generateMeta("Files");
const filePath = "routes/files.$.tsx";

export default function FilesGenericPage() {
  return <RouteWrapper filePath={filePath}>Files Generic Page</RouteWrapper>;
}
