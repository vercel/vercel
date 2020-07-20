export default function Page() {
  return 'hello';
}

export function getStaticProps() {
  return { props: {}, unstable_revalidate: 10 };
}
