import {Image, Link} from '@shopify/hydrogen';

import {Heading} from '~/components';

export function CollectionCard({collection, loading}) {
  return (
    <Link to={`/collections/${collection.handle}`} className="grid gap-4">
      <div className="card-image bg-primary/5 aspect-[3/2]">
        {collection?.image && (
          <Image
            alt={`Image of ${collection.title}`}
            data={collection.image}
            height={400}
            sizes="(max-width: 32em) 100vw, 33vw"
            width={600}
            widths={[400, 500, 600, 700, 800, 900]}
            loaderOptions={{
              scale: 2,
              crop: 'center',
            }}
          />
        )}
      </div>
      <Heading as="h3" size="copy">
        {collection.title}
      </Heading>
    </Link>
  );
}
