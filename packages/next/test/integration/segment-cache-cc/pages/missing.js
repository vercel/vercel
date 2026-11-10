// Lands in the prerender manifest's `notFoundRoutes`. Next.js emits no
// prerender classification for those, so the resulting Prerender must carry
// none either.
export async function getStaticProps() {
  return { notFound: true, revalidate: 60 };
}

export default function Missing() {
  return <div id="missing">missing</div>;
}
