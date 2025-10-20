export default async function IdLayout({ children, params }) {
  return (
    <>
      <h3>
        Id Layout. Params:{' '}
        <span id="id-layout-params">{JSON.stringify(await params)}</span>
      </h3>
      {children}
    </>
  );
}
