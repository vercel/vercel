import { type RouteConfig, index, route } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";

export default [
  route("/", "pages/alternate-page.tsx"),

  ...(await flatRoutes()),
] satisfies RouteConfig;
