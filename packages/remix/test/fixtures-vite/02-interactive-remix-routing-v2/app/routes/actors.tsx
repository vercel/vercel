import { Outlet } from "@remix-run/react";
import LayoutWrapper from "~/components/wrappers/LayoutWrapper";

export const config = { runtime: 'edge' };

const filePath = "routes/actors.tsx";

export default function ActorsLayout() {
  return (
    <LayoutWrapper filePath={filePath}>
      <Outlet />
    </LayoutWrapper>
  );
}
  