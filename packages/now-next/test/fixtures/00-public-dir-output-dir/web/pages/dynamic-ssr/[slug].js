export function getServerSideProps() {
  return {
    props: {
      hello: 'world',
      random: Math.random(),
    },
  };
}

export default function Dynamic() {
  return <p>Dynamic SSR Page</p>;
}
