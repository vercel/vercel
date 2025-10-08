import type { TreeNode } from "~/types/tree";

const basicRoutes: TreeNode = {
  name: "routes",
  type: "f",
  path: "",
  children: [
    { name: "_index.tsx", type: "r", path: "/", children: [] },
    { name: "about.tsx", type: "r", path: "/about", children: [] },
  ],
};

export default basicRoutes;
