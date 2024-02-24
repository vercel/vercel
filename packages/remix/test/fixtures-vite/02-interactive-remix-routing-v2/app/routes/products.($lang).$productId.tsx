import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  name: "routes/products.($lang).$productId.tsx"
};

export const handle: HandleCustom = {
  links: [{ label: "Products", link: "", key: "products" }],
};
export const meta = generateMeta("Products");
const filePath = "routes/products.($lang).$productId.tsx";

export default function ProductPage() {
  return <RouteWrapper filePath={filePath}>ProductPage</RouteWrapper>;
}
