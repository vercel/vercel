import type { TreeNode } from "~/types/tree";

const nestedWOlayout: TreeNode = {
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
    { name: "actors.tsx", type: "l", path: "", children: [] },
    {
      name: "actors_.favourites.tsx",
      type: "r",
      path: "actors/favourites",
      children: [],
    },
  ],
};

export default nestedWOlayout;
