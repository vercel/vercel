import type { TreeNode } from "~/types/tree";

const specialCharacters: TreeNode = {
  name: "routes",
  type: "f",
  path: "",
  children: [
    {
      name: "sitemap[.]xml.tsx",
      type: "r",
      path: "/sitemap.xml",
      children: [],
    },
    {
      name: "[sitemap2.xml].tsx",
      type: "r",
      path: "/sitemap2.xml",
      children: [],
    },
    {
      name: "weird-url.[_index].tsx",
      type: "r",
      path: "/weird-url/_index",
      children: [],
    },
    {
      name: "dolla-bills-[$].tsx",
      type: "r",
      path: "/dolla-bills-$",
      children: [],
    },
    { name: "[[so-weird]].tsx", type: "r", path: "/[so-weird]", children: [] },
  ],
};

export default specialCharacters;
