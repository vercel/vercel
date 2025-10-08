export type TreeNodeType = "f" | "r" | "l";
export interface TreeNode {
  name: string;
  type: TreeNodeType;
  path: string;
  children: TreeNode[];
}
