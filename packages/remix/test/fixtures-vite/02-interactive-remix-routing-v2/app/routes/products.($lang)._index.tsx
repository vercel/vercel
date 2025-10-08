import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  group: "products",
  runtime: 'edge',
};

export const handle: HandleCustom = {
  links: [{ label: "Products", link: "", key: "products" }],
};
export const meta = generateMeta("Products");
const filePath = "routes/products.($lang)._index.tsx";

export default function ProductsPage() {
  return <RouteWrapper filePath={filePath}>ProductsPage</RouteWrapper>;
}
