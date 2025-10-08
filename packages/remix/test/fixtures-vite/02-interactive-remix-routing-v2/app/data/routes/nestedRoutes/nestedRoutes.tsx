import type { TreeNode } from "~/types/tree";

const nestedRoutes: TreeNode = {
  name: "routes",
  type: "f",
  path: "",
  children: [
    { name: "actors._index.tsx", type: "r", path: "/actors", children: [] },
    {
      name: "actors.$actorName.tsx",
      type: "r",
      path: "/actors/morgan-freeman",
      children: [],
    },
    {
      name: "actors.trending.tsx",
      type: "r",
      path: "/actors/trending",
      children: [],
    },
    { name: "actors.tsx", type: "l", path: "l", children: [] },
  ],
};
export default nestedRoutes;
