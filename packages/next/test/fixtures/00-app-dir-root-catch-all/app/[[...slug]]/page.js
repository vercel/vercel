export default function Page(props) {
  return (
    <p>catch-all {JSON.stringify(props.params || {})}</p>
  )
}

export function generateStaticParams() {
  return [
    {
      slug: ['']
    },
    {
      slug: ['index']
    },
    {
      slug: ['first']
    }
  ]
}

export const revalidate = 0
