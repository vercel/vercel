import { Outlet } from '@remix-run/react';

export const config = { runtime: 'edge' };

export default function Projects() {
  return (
    <div>
      <h1>Projects</h1>
      <Outlet />
    </div>
  );
}
