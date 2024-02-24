import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  name: "routes/_auth.login.tsx"
};

export const handle: HandleCustom = {
  links: [{ label: "Login", link: "/login", key: "login" }],
};
export const meta = generateMeta("Login");

const filePath = "routes/_auth.login.tsx";

export default function authLoginPage() {
  return <RouteWrapper filePath={filePath}>authLogin Page</RouteWrapper>;
}
