import { add } from '@test/common';

const Page = () => {
  return <div>hello world {add(1, 5)}</div>;
};

Page.getInitialProps = () => ({ hello: 'world' });

export default Page;
