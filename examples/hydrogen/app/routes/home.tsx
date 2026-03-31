import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Hydrogen" }];
}

export default function Home() {
  return (
    <div>
      <h1>Hydrogen</h1>
      <p>A custom storefront powered by Shopify Hydrogen and Vercel.</p>
    </div>
  );
}
