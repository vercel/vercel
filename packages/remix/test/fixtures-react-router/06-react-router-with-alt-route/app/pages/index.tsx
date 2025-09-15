import type { Route } from "./+types/index";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Home" }];
}

export default function Index() {
  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1 className="text-2xl font-bold">Home (pages/index)</h1>
      <p>Welcome to the index page.</p>
    </main>
  );
}
