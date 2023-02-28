export default function Page() {
  return <p>ssp page</p>;
}

export function getServerSideProps() {
  return {
    props: {
      now: Date.now(),
    },
  };
}
