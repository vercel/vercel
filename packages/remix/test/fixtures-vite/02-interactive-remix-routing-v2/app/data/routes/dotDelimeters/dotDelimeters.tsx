import type { TreeNode } from "~/types/tree";

const dotDelimeters: TreeNode = {
  name: "routes",
  type: "f",
  path: "",
  children: [
    {
      name: "concerts.trending.tsx",
      type: "r",
      path: "/concerts/trending",
      children: [],
    },
    {
      name: "concerts.salt-lake-city.tsx",
      type: "r",
      path: "concerts/salt-lake-city",
      children: [],
    },
    {
      name: "concerts.san-diego.tsx",
      type: "r",
      path: "concerts/san-diego",
      children: [],
    },
  ],
};

export default dotDelimeters;
