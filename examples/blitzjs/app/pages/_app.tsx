import { AppProps } from "blitz"

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
