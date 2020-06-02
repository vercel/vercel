// this is making sure a object prototype name doesn't
// cause conflict as an output name

const Page = () => 'hi';
Page.getInitialProps = () => ({ hello: 'world' });

export default Page;
