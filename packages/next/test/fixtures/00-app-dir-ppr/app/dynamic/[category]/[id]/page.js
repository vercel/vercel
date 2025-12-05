export default async function IdPage({ children, params }) {
  return (
    <>
      <p>
        Id Page. Params:{' '}
        <span id="id-page-params">{JSON.stringify(await params)}</span>
      </p>
      {children}
    </>
  );
}
