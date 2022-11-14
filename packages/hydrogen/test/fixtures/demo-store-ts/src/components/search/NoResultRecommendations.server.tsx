import {gql, useShopQuery} from '@shopify/hydrogen';

import {PRODUCT_CARD_FRAGMENT} from '~/lib/fragments';
import {FeaturedCollections} from '~/components';
import {ProductSwimlane} from '~/components/index.server';
import {PAGINATION_SIZE} from '~/lib/const';

export function NoResultRecommendations({
  country,
  language,
}: {
  country: string;
  language: string;
}) {
  const {data} = useShopQuery<any>({
    query: SEARCH_NO_RESULTS_QUERY,
    variables: {
      country,
      language,
      pageBy: PAGINATION_SIZE,
    },
    preload: false,
  });

  return (
    <>
      <FeaturedCollections
        title="Trending Collections"
        data={data.featuredCollections.nodes}
      />
      <ProductSwimlane
        title="Trending Products"
        data={data.featuredProducts.nodes}
      />
    </>
  );
}

const SEARCH_NO_RESULTS_QUERY = gql`
  ${PRODUCT_CARD_FRAGMENT}
  query searchNoResult(
    $country: CountryCode
    $language: LanguageCode
    $pageBy: Int!
  ) @inContext(country: $country, language: $language) {
    featuredCollections: collections(first: 3, sortKey: UPDATED_AT) {
      nodes {
        id
        title
        handle
        image {
          altText
          width
          height
          url
        }
      }
    }
    featuredProducts: products(first: $pageBy) {
      nodes {
        ...ProductCard
      }
    }
  }
`;
