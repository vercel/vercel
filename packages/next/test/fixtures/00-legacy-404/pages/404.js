export default function Page() {
  return <p>custom 404</p>;
}

export function getStaticProps() {
  return {
    props: {
      is404: true,
    },
  };
}
