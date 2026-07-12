export default function About() {
  return (
    <main className="about">
      <h1 className="about__title">About</h1>
      <p>
        This page exists to prove a transition: navigate between Home and
        About and both pages coexist while transitions/home__about.ts slides
        them. Edit that file — or add a new pair with
        <code> npx modulato new transition</code>.
      </p>
    </main>
  )
}
