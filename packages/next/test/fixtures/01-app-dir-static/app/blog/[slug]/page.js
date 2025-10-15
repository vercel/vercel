export const dynamicParams = false;

export async function generateStaticParams() {
  return [{ slug: 'about' }];
}

export default async function BlogSlugPage({ params }) {
  return (
    <>
      <p>{(await params).slug}</p>
    </>
  );
}
