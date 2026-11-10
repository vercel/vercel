// Pages-router route, for asserting the classification of a non-app prerender.
// `revalidate` makes this an ISR Prerender (rather than a plain static file) so
// the assertion has an output entry to inspect.
export async function getStaticProps() {
  return { props: { now: Date.now() }, revalidate: 60 };
}

export default function Legacy({ now }) {
  return <div id="legacy">legacy:{now}</div>;
}
