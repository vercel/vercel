export default function Page() {
  return <p>ssg page</p>;
}

export function getStaticProps() {
  return {
    props: {
      now: Date.now(),
    },
    revalidate: 3,
  };
}
