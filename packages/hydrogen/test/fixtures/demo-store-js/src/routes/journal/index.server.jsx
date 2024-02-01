import {
  CacheLong,
  flattenConnection,
  gql,
  Seo,
  useLocalization,
  useShopQuery,
} from '@shopify/hydrogen';
import {Suspense} from 'react';

import {ArticleCard, Grid, PageHeader} from '~/components';
import {Layout} from '~/components/index.server';
import {getImageLoadingPriority, PAGINATION_SIZE} from '~/lib/const';

const BLOG_HANDLE = 'Journal';

export default function Blog({pageBy = PAGINATION_SIZE, response}) {
  response.cache(CacheLong());

  return (
    <Layout>
      <Seo type="page" data={{title: 'All Journals'}} />
      <PageHeader heading={BLOG_HANDLE} className="gap-0">
        <Suspense>
          <JournalsGrid pageBy={pageBy} />
        </Suspense>
      </PageHeader>
    </Layout>
  );
}

function JournalsGrid({pageBy}) {
  const {
    language: {isoCode: languageCode},
    country: {isoCode: countryCode},
  } = useLocalization();

  const {data} = useShopQuery({
    query: BLOG_QUERY,
    variables: {
      language: languageCode,
      blogHandle: BLOG_HANDLE,
      pageBy,
    },
  });

  // TODO: How to fix this type?
  const rawArticles = flattenConnection(data.blog.articles);

  const articles = rawArticles.map((article) => {
    const {publishedAt} = article;
    return {
      ...article,
      publishedAt: new Intl.DateTimeFormat(`${languageCode}-${countryCode}`, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date(publishedAt)),
    };
  });

  if (articles.length === 0) {
    return <p>No articles found</p>;
  }

  return (
    <Grid as="ol" layout="blog" gap="blog">
      {articles.map((article, i) => {
        return (
          <ArticleCard
            blogHandle={BLOG_HANDLE.toLowerCase()}
            article={article}
            key={article.id}
            loading={getImageLoadingPriority(i, 2)}
          />
        );
      })}
    </Grid>
  );
}

const BLOG_QUERY = gql`
  query Blog(
    $language: LanguageCode
    $blogHandle: String!
    $pageBy: Int!
    $cursor: String
  ) @inContext(language: $language) {
    blog(handle: $blogHandle) {
      articles(first: $pageBy, after: $cursor) {
        edges {
          node {
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
          }
        }
      }
    }
  }
`;
