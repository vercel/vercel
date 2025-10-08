export default async function Page({ params }) {
  const { lang } = await params;

  return <div>This is the page {lang}</div>;
}
