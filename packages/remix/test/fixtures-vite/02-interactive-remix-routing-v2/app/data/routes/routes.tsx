import type { TreeNode } from "~/types/tree";
import basicRoutes from "./basicRoutes";
import dotDelimeters from "./dotDelimeters";
import dynamicSegments from "./dynamicSegments";
import folderOrganization from "./folderOrganization";
import nestedRoutes from "./nestedRoutes";
import nestedWOlayout from "./nestedWOlayout";
import optionalSegments from "./optionalSegments";
import pathlessRoutes from "./pathlessRoutes";
import specialCharacters from "./specialCharacters";
import splatRoutes from "./splatRoutes";

const routes: { title: string; tree: TreeNode }[] = [
  { title: "Basic Routes", tree: basicRoutes },
  { title: "Dot Delimeters", tree: dotDelimeters },
  { title: "Dynamic Segments", tree: dynamicSegments },
  { title: "Nested Routes", tree: nestedRoutes },
  { title: "Nested Without Layout", tree: nestedWOlayout },
  { title: "Pathless Routes", tree: pathlessRoutes },
  { title: "Optional Segments", tree: optionalSegments },
  { title: "Splat Routes", tree: splatRoutes },
  { title: "Special Characters", tree: specialCharacters },
  { title: "Folder Orgnanization", tree: folderOrganization },
];

export default routes;
