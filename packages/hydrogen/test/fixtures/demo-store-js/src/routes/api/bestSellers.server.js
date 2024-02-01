import {gql} from '@shopify/hydrogen';
import {PRODUCT_CARD_FRAGMENT} from '~/lib/fragments';

export async function api(_request, {queryShop}) {
  const {
    data: {products},
  } = await queryShop({
    query: TOP_PRODUCTS_QUERY,
    variables: {
      count: 4,
    },
  });

  return products.nodes;
}

const TOP_PRODUCTS_QUERY = gql`
  ${PRODUCT_CARD_FRAGMENT}
  query topProducts(
    $count: Int
    $countryCode: CountryCode
    $languageCode: LanguageCode
  ) @inContext(country: $countryCode, language: $languageCode) {
    products(first: $count, sortKey: BEST_SELLING) {
      nodes {
        ...ProductCard
      }
    }
  }
`;
