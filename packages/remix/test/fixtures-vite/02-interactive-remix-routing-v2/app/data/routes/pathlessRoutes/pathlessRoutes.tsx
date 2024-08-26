import type { TreeNode } from "~/types/tree";

const pathlessRoutes: TreeNode = {
  name: "routes",
  type: "f",
  path: "",
  children: [
    { name: "_auth.login.tsx", type: "r", path: "/login", children: [] },
    { name: "_auth.register.tsx", type: "r", path: "/register", children: [] },
    { name: "_auth.tsx", type: "l", path: "", children: [] },
  ],
};

export default pathlessRoutes;
