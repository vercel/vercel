import type { MetaFunction } from "@vercel/remix";

export const meta: MetaFunction = () => [{ title: "Blog Page | New Remix App" }];

export default function Blog() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.4" }}>
      <h1>Blog Page</h1>
    </div>
  );
}
