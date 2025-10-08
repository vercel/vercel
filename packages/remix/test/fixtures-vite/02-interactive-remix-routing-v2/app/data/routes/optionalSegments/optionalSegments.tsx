import type { TreeNode } from "~/types/tree";

const optionalSegments: TreeNode = {
  name: "routes",
  type: "f",
  path: "",
  children: [
    {
      name: "products.($lang)._index.tsx",
      type: "r",
      path: "/products/fr",
      children: [],
    },
    {
      name: "products.($lang).$productId.tsx",
      type: "r",
      path: "/products/en/american-flag-speedo",
      children: [],
    },
    {
      name: "products.($lang).categories.tsx",
      type: "r",
      path: "/products/fr/categories",
      children: [],
    },
  ],
};

export default optionalSegments;
