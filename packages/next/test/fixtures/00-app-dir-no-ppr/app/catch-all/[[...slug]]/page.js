export default async function Page(props) {
  return (<p>catch-all {JSON.stringify((await props.params) || {})}</p>);
}

export function generateStaticParams() {
  return [
    {
      slug: ['']
    },
    {
      slug: ['first']
    }
  ]
}
