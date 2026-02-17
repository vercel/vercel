export async function generateStaticParams() {
  return [{ segments: ['foobar', 'one'] }];
}

export default async function Page({ params }) {
  const { segments = [] } = await params;
  return <div>Catch Result: {segments.join('/')}</div>;
}
