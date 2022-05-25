import fs from 'fs';
import path from 'path';

export default function Page(props) {
  return (
    <>
      <p>index page</p>
      <p>{JSON.stringify(props)}</p>
    </>
  );
}

export function getServerSideProps() {
  const data = fs.readFileSync(
    path.join(process.cwd(), '../data/hello.json'),
    'utf8'
  );
  return {
    props: {
      now: Date.now(),
      data,
    },
  };
}
