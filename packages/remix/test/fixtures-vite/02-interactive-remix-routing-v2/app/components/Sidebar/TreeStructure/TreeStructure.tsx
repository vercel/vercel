import NodeIcon from "~/components/Sidebar/TreeStructure/NodeIcon";
import { NavLink } from "@remix-run/react";
import type { TreeNode } from "~/types/tree";

type Props = { node: TreeNode; isLastChild?: boolean };

export default function TreeStructure({ node, isLastChild = true }: Props) {
  return (
    <div className="relative ml-6">
      {isLastChild ? (
        <div className="vertical-line last-child" />
      ) : (
        <div className="vertical-line normal" />
      )}

      <div className="horizontal-line" />
      <div className="py-1.5">
        <div className="inline-flex items-center  px-1.5 rounded-md">
          <NodeIcon nodeType={node.type} />
          <div className="ml-1.5 h-6 inline-flex items-center ">
            {node.type === "r" ? (
              <NavLink to={node.path} className="">
                {node.name}
              </NavLink>
            ) : (
              <>{node.name}</>
            )}
          </div>
        </div>
      </div>

      {node.children.map((child, index) => (
        <TreeStructure
          key={index}
          node={child}
          isLastChild={index === node.children.length - 1}
        />
      ))}
    </div>
  );
}
