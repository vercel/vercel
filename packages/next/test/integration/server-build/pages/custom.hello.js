export default function Page() {
  return 'custom page extension';
}

export function getServerSideProps() {
  return {
    props: {
      hello: 'world',
    },
  };
}
