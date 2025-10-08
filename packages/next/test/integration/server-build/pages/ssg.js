export default function Page() {
  return '/static';
}

export function getStaticProps() {
  return {
    props: {
      hello: 'world',
    },
  };
}
