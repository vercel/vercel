export default function Home({ title, tagline }: { title: string; tagline: string }) {
  return (
    <main className="home">
      <h1 className="home__headline">{title}</h1>
      <p className="home__tagline">{tagline}</p>
    </main>
  )
}
