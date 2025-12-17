export default async function DeploymentsPage(props) {
  return (
    <>
      <p>
        hello from app/dashboard/deployments/[id]/settings. ID is:{' '}
        {(await props.params).id}
      </p>
    </>
  );
}
