export default function Page() {
  return <p>blog</p>;
}

export function getStaticProps() {
  return {
    props: {},
    revalidate: 1,
  };
}
