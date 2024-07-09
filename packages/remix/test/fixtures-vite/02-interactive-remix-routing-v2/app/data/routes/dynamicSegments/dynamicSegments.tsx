import type { TreeNode } from "~/types/tree";

const dynamicSegments: TreeNode = {
  name: "routes",
  type: "f",
  path: "",
  children: [
    {
      name: "movies.$movieName.tsx",
      type: "r",
      path: "movies/avatar",
      children: [],
    },
    {
      name: "movies.trending.tsx",
      type: "r",
      path: "movies/trending",
      children: [],
    },
  ],
};

export default dynamicSegments;
