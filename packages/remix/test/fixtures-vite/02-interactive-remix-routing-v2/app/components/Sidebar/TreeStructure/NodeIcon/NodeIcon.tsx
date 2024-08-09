import FolderIcon from "~/components/icons/FolderIcon";
import type { TreeNodeType } from "~/types/tree";

type Props = {
  nodeType: TreeNodeType;
};

export default function NodeIcon({ nodeType }: Props) {
  if (nodeType === "f") {
    return (
      <div className="w-5 h-5 grid place-items-center text-sm text-yellow-800 dark:text-yellow-400">
        <FolderIcon className="w-5 h-5" />
      </div>
    );
  }
  if (nodeType === "l") {
    return (
      <div className="w-5 h-5 grid place-items-center text-xs font-semibold bg-indigo-200 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-200 rounded-full">
        L
      </div>
    );
  }
  if (nodeType === "r") {
    return (
      <div className="w-5 h-5 grid place-items-center text-xs font-semibold bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-200 rounded-full">
        R
      </div>
    );
  }
  return null;
}
