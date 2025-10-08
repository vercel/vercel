import React from 'react';

// eslint-disable-next-line camelcase
export async function getStaticProps() {
  return {
    props: {
      world: 'world',
      time: new Date().getTime(),
    },
    revalidate: 5,
  };
}

export default ({ world, time }) => {
  return (
    <>
      <p>hello: {world}</p>
      <span>time: {time}</span>
    </>
  );
};
