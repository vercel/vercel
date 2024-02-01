export default function Page(props) {
  return (
    <>
      <p>404 | Page Not Found</p>
      <p>{JSON.stringify(props)}</p>
    </>
  );
}

export function getStaticProps({ locale }) {
  return {
    props: {
      locale,
      // 1MB string which is duplicated in HTML totalling 2MB
      // this will be generated for each locale as well
      largeData: new Array(1 * 1024 * 1024).fill('a').join(''),
    },
  };
}
