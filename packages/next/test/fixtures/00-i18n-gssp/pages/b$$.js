function Page({ date }) {
  return (
    <>
      <h1>b$$</h1>
      <p>Date: {date}</p>
    </>
  );
}

export async function getServerSideProps() {
  return {
    props: {
      date: new Date().toISOString(),
      page: 'b$$',
    },
  };
}

export default Page;
