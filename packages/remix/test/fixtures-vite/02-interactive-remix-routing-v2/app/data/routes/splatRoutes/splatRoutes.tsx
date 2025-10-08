import type { TreeNode } from "~/types/tree";

const splatRoutes: TreeNode = {
  name: "routes",
  type: "f",
  path: "",
  children: [{ name: "files.$.tsx", type: "r", path: "/files", children: [] }],
};

export default splatRoutes;
