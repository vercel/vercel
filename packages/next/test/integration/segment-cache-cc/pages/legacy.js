// Pages-router route. `hasPostponed` is an app-router PPR signal, so the
// Prerender produced here must leave it `undefined`. `revalidate` makes this an
// ISR Prerender (rather than a plain static file) so the assertion has an
// output entry to inspect.
export async function getStaticProps() {
  return { props: { now: Date.now() }, revalidate: 60 };
}

export default function Legacy({ now }) {
  return <div id="legacy">legacy:{now}</div>;
}
