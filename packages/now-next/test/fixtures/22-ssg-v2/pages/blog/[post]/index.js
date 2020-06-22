import React from 'react';

// eslint-disable-next-line camelcase
export async function getStaticPaths() {
  return {
    paths: ['/blog/post-1', { params: { post: 'post-2' } }],
    fallback: true,
  };
}

// eslint-disable-next-line camelcase
export async function getStaticProps({ params }) {
  if (params.post === 'post-10') {
    await new Promise(resolve => {
      setTimeout(() => resolve(), 1000);
    });
  }

  return {
    props: {
      post: params.post,
      time: (await import('perf_hooks')).performance.now(),
    },
    unstable_revalidate: 10,
  };
}

export default ({ post, time }) => {
  if (!post) return <p>loading...</p>;

  return (
    <>
      <p>Post: {post}</p>
      <span>time: {time}</span>
    </>
  );
};
