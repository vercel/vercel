export default function Page() {
  return 'hello';
}

export function getStaticProps() {
  return { props: {}, revalidate: 10 };
}
