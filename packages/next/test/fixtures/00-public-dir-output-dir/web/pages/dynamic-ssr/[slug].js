export function getServerSideProps() {
  return {
    props: {
      hello: 'world',
      random: Math.random() + Date.now(),
    },
  };
}

export default function Dynamic() {
  return <p>Dynamic SSR Page</p>;
}
