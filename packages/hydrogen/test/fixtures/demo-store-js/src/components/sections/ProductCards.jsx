import {ProductCard} from '../cards/ProductCard.client';

export function ProductCards({products}) {
  return (
    <>
      {products.map((product) => (
        <ProductCard
          product={product}
          key={product.id}
          className={'snap-start w-80'}
        />
      ))}
    </>
  );
}
