import React from 'react';

// eslint-disable-next-line camelcase
export async function getStaticPaths() {
  return {
    paths: [
      '/blog/post-1/comment-1',
      { params: { post: 'post-2', comment: 'comment-2' } },
      '/blog/post-1337/comment-1337',
    ],
    fallback: true,
  };
}

// eslint-disable-next-line camelcase
export async function getStaticProps({ params }) {
  return {
    props: {
      post: params.post,
      comment: params.comment,
      time: new Date().getTime(),
    },
    unstable_revalidate: 2,
  };
}

export default ({ post, comment, time }) => {
  if (!post) return <p>loading...</p>;

  return (
    <>
      <p>Post: {post}</p>
      <p>Comment: {comment}</p>
      <span>time: {time}</span>
    </>
  );
};
