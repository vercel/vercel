import type {V2_MetaFunction} from '@shopify/remix-oxygen';
import {json, type LoaderArgs} from '@shopify/remix-oxygen';
import {Link, useLoaderData} from '@remix-run/react';
import {Image, Pagination, getPaginationVariables} from '@shopify/hydrogen';
import type {ArticleItemFragment} from 'storefrontapi.generated';

export const meta: V2_MetaFunction = ({data}) => {
  return [{title: `Hydrogen | ${data.blog.title} blog`}];
};

export const loader = async ({
  request,
  params,
  context: {storefront},
}: LoaderArgs) => {
  const paginationVariables = getPaginationVariables(request, {
    pageBy: 4,
  });

  if (!params.blogHandle) {
    throw new Response(`blog not found`, {status: 404});
  }

  const {blog} = await storefront.query(BLOGS_QUERY, {
    variables: {
      blogHandle: params.blogHandle,
      ...paginationVariables,
    },
  });

  if (!blog?.articles) {
    throw new Response('Not found', {status: 404});
  }

  return json({blog});
};

export default function Blog() {
  const {blog} = useLoaderData<typeof loader>();
  const {articles} = blog;

  return (
    <div className="blog">
      <h1>{blog.title}</h1>
      <div className="blog-grid">
        <Pagination connection={articles}>
          {({nodes, isLoading, PreviousLink, NextLink}) => {
            return (
              <>
                <PreviousLink>
                  {isLoading ? 'Loading...' : <span>↑ Load previous</span>}
                </PreviousLink>
                {nodes.map((article, index) => {
                  return (
                    <ArticleItem
                      article={article}
                      key={article.id}
                      loading={index < 2 ? 'eager' : 'lazy'}
                    />
                  );
                })}
                <NextLink>
                  {isLoading ? 'Loading...' : <span>Load more ↓</span>}
                </NextLink>
              </>
            );
          }}
        </Pagination>
      </div>
    </div>
  );
}

function ArticleItem({
  article,
  loading,
}: {
  article: ArticleItemFragment;
  loading?: HTMLImageElement['loading'];
}) {
  const publishedAt = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(article.publishedAt!));
  return (
    <div className="blog-article" key={article.id}>
      <Link to={`/blogs/${article.blog.handle}/${article.handle}`}>
        {article.image && (
          <div className="blog-article-image">
            <Image
              alt={article.image.altText || article.title}
              aspectRatio="3/2"
              data={article.image}
              loading={loading}
              sizes="(min-width: 768px) 50vw, 100vw"
            />
          </div>
        )}
        <h3>{article.title}</h3>
        <small>{publishedAt}</small>
      </Link>
    </div>
  );
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/blog
const BLOGS_QUERY = `#graphql
  query Blog(
    $language: LanguageCode
    $blogHandle: String!
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
  ) @inContext(language: $language) {
    blog(handle: $blogHandle) {
      title
      seo {
        title
        description
      }
      articles(
        first: $first,
        last: $last,
        before: $startCursor,
        after: $endCursor
      ) {
        nodes {
          ...ArticleItem
        }
        pageInfo {
          hasPreviousPage
          hasNextPage
          hasNextPage
          endCursor
        }

      }
    }
  }
  fragment ArticleItem on Article {
    author: authorV2 {
      name
    }
    contentHtml
    handle
    id
    image {
      id
      altText
      url
      width
      height
    }
    publishedAt
    title
    blog {
      handle
    }
  }
` as const;
