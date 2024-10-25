export const dynamic = 'force-static';

export default async function Page({ params }) {
  const resolvedParams = await params;
  return (
    <div id="content">
      Segment Value: {resolvedParams['hyphenated-segment']}
    </div>
  );
}
