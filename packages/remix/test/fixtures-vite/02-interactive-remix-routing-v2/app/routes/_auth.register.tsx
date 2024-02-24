import RouteWrapper from "~/components/wrappers/RouteWrapper";
import generateMeta from "~/utils/generateMeta";
import type { HandleCustom } from "~/components/Breadcrumbs/Breadcrumbs";

export const config = {
  name: "routes/_auth.register.tsx"
};

export const handle: HandleCustom = {
  links: [{ label: "Register", link: "/register", key: "register" }],
};
export const meta = generateMeta("Register");

const filePath = "routes/_auth.register.tsx";

export default function authRegisterPage() {
  return <RouteWrapper filePath={filePath}>authRegister Page</RouteWrapper>;
}
