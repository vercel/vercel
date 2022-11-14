export default function Home() {
  return 'another page';
}

export function getServerSideProps() {
  require('fs').readFileSync(require('path').join(process.cwd(), 'data.txt'));
  return {
    props: {},
  };
}
