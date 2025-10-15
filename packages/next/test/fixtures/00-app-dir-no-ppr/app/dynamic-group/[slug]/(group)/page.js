export default async function Page({params}) {
  return (
    <>
      <p>
        Catch All Page. Params:{' '}
        <span id="catch-all-page-params">{JSON.stringify(await params)}</span>
      </p>
      {children}
    </>
  );  
}