import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  name: "routes/products.($lang).categories.tsx"
};

export const handle: HandleCustom = {
  links: [{ label: "Categories", link: "", key: "categories" }],
};
export const meta = generateMeta("Categories");
const filePath = "routes/products.($lang).categories.tsx";

export default function ProductCategoriesPage() {
  return (
    <RouteWrapper filePath={filePath}>Product Categories Page</RouteWrapper>
  );
}
