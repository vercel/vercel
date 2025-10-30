const runtime = typeof (globalThis as any).Bun !== "undefined" ? "bun" : "node";

export default async function Home(props: { params: { id: string } }) {
  return <div>{JSON.stringify({ runtime })}</div>;
}
