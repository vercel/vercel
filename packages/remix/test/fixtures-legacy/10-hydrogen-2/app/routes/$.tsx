import type {LoaderArgs} from '@shopify/remix-oxygen';

export async function loader({request}: LoaderArgs) {
  throw new Response(`${new URL(request.url).pathname} not found`, {
    status: 404,
  });
}
