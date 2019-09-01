const Page = ({ world }) => (
  <p>Hello {world}</p>
)

Page.getInitialProps = () => ({ world: 'world' })

export default Page