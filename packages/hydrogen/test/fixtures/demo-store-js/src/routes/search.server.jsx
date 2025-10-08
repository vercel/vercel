import {gql, useLocalization, useShopQuery, useUrl} from '@shopify/hydrogen';

import {PRODUCT_CARD_FRAGMENT} from '~/lib/fragments';
import {ProductGrid, Section, Text} from '~/components';
import {NoResultRecommendations, SearchPage} from '~/components/index.server';
import {PAGINATION_SIZE} from '~/lib/const';
import {Suspense} from 'react';

export default function Search({pageBy = PAGINATION_SIZE, params}) {
  const {
    language: {isoCode: languageCode},
    country: {isoCode: countryCode},
  } = useLocalization();

  const {handle} = params;
  const {searchParams} = useUrl();

  const searchTerm = searchParams.get('q');

  const {data} = useShopQuery({
    query: SEARCH_QUERY,
    variables: {
      handle,
      country: countryCode,
      language: languageCode,
      pageBy,
      searchTerm,
    },
    preload: true,
  });

  const products = data?.products;
  const noResults = products?.nodes?.length === 0;

  if (!searchTerm || noResults) {
    return (
      <SearchPage searchTerm={searchTerm ? decodeURI(searchTerm) : null}>
        {noResults && (
          <Section padding="x">
            <Text className="opacity-50">No results, try something else.</Text>
          </Section>
        )}
        <Suspense>
          <NoResultRecommendations
            country={countryCode}
            language={languageCode}
          />
        </Suspense>
      </SearchPage>
    );
  }

  return (
    <SearchPage searchTerm={decodeURI(searchTerm)}>
      <Section>
        <ProductGrid
          key="search"
          url={`/search?country=${countryCode}&q=${searchTerm}`}
          collection={{products}}
        />
      </Section>
    </SearchPage>
  );
}

// API to paginate the results of the search query.
// @see templates/demo-store/src/components/product/ProductGrid.client.tsx
export async function api(request, {params, queryShop}) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: {Allow: 'POST'},
    });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  const country = url.searchParams.get('country');
  const searchTerm = url.searchParams.get('q');
  const {handle} = params;

  return await queryShop({
    query: PAGINATE_SEARCH_QUERY,
    variables: {
      handle,
      cursor,
      pageBy: PAGINATION_SIZE,
      country,
      searchTerm,
    },
  });
}

const SEARCH_QUERY = gql`
  ${PRODUCT_CARD_FRAGMENT}
  query search(
    $searchTerm: String
    $country: CountryCode
    $language: LanguageCode
    $pageBy: Int!
    $after: String
  ) @inContext(country: $country, language: $language) {
    products(
      first: $pageBy
      sortKey: RELEVANCE
      query: $searchTerm
      after: $after
    ) {
      nodes {
        ...ProductCard
      }
      pageInfo {
        startCursor
        endCursor
        hasNextPage
        hasPreviousPage
      }
    }
  }
`;

const PAGINATE_SEARCH_QUERY = gql`
  ${PRODUCT_CARD_FRAGMENT}
  query ProductsPage(
    $searchTerm: String
    $pageBy: Int!
    $cursor: String
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    products(
      sortKey: RELEVANCE
      query: $searchTerm
      first: $pageBy
      after: $cursor
    ) {
      nodes {
        ...ProductCard
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
