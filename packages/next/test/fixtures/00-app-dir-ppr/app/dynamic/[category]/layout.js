export default async function CategoryLayout({ children, params }) {
  return (
    <>
      <h2>
        Category Layout. Params:{' '}
        <span id="category-layout-params">{JSON.stringify(await params)}</span>{' '}
      </h2>
      {children}
    </>
  );
}
