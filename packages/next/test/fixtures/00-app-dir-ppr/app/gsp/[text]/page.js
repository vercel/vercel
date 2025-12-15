export default async function DynamicPage(props) {
  const params = await props.params;
  return (
    <main>
      <h1>Dynamic page</h1>
      <p>Param: {params.text}</p>
    </main>
  );
}

export async function generateStaticParams() {
  return [
    {
      text: 'one',
    },
  ];
}
