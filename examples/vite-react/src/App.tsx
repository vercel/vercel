
// Deploy this site instantly on https://vercel.com or https://netlify.com // 1. Create a new Next.js or React project // 2. Paste this component into your app // 3. Deploy and get your public link

export default function AnimeLunaticsWebsite(): JSX.Element { return ( <div className="min-h-screen bg-black text-white overflow-hidden relative font-sans"> {/* Background glow */} <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-900 to-black opacity-95" />

{/* Dragon smoke left */}
  <div className="absolute left-0 top-0 h-full w-40 bg-gradient-to-r from-purple-900/40 via-transparent to-transparent blur-3xl opacity-70" />

  {/* Yin Yang smoke right */}
  <div className="absolute right-0 top-0 h-full w-40 bg-gradient-to-l from-cyan-900/40 via-transparent to-transparent blur-3xl opacity-70" />

  {/* Floating smoke */}
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    <div className="absolute top-10 left-10 w-72 h-72 bg-purple-700/20 rounded-full blur-3xl animate-pulse" />
    <div className="absolute bottom-10 right-10 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
    <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-red-500/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
  </div>

  <div className="relative z-10">
    {/* Hero Section */}
    <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_60%)]" />

      <div className="mb-6 tracking-[0.5em] uppercase text-zinc-400 text-sm">
        Underground Anime Society
      </div>

      <h1 className="text-6xl md:text-8xl font-black uppercase leading-none tracking-tight mb-6 drop-shadow-[0_0_20px_rgba(168,85,247,0.5)]">
        <span className="text-white">The Anime</span>
        <br />
        <span className="bg-gradient-to-r from-purple-400 via-pink-500 to-cyan-400 text-transparent bg-clip-text">
          Lunatics
        </span>
      </h1>

      <p className="max-w-2xl text-zinc-300 text-lg md:text-2xl italic mb-10 leading-relaxed">
        “Debates about updates, you want it, we got it.”
      </p>

      <div className="flex gap-4 flex-wrap justify-center">
        <button className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl font-bold uppercase tracking-wide hover:scale-105 transition-all shadow-2xl shadow-purple-900/50">
          Join The Club
        </button>

        <button className="px-8 py-4 border border-zinc-700 bg-zinc-900/60 backdrop-blur rounded-2xl uppercase tracking-wide hover:bg-zinc-800 transition-all">
          Enter The Cafe
        </button>
      </div>

      {/* Mystery Card */}
      <div className="mt-20 bg-zinc-900/60 border border-zinc-800 rounded-3xl p-8 max-w-4xl backdrop-blur-xl shadow-2xl shadow-black/50">
        <div className="grid md:grid-cols-3 gap-6 text-left">
          <div className="bg-black/40 rounded-2xl p-5 border border-zinc-800 hover:border-purple-500 transition-all">
            <h3 className="text-xl font-bold mb-2 text-purple-400">Anime Debates</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Wild theories, hot takes, power scaling battles, and nonstop anime arguments.
            </p>
          </div>

          <div className="bg-black/40 rounded-2xl p-5 border border-zinc-800 hover:border-cyan-400 transition-all">
            <h3 className="text-xl font-bold mb-2 text-cyan-400">Underground Cafe</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              A secret late-night vibe inspired by hidden anime cafes and mysterious city streets.
            </p>
          </div>

          <div className="bg-black/40 rounded-2xl p-5 border border-zinc-800 hover:border-pink-500 transition-all">
            <h3 className="text-xl font-bold mb-2 text-pink-400">Lunatic Energy</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Chaos, hype, updates, memes, and everything anime fans obsess over.
            </p>
          </div>
        </div>
      </div>
    </section>

    {/* About Section */}
    <section className="px-6 py-24 max-w-6xl mx-auto">
      <div className="grid md:grid-cols-2 gap-10 items-center">
        <div>
          <div className="text-purple-400 uppercase tracking-[0.3em] mb-4 text-sm">
            Hidden Headquarters
          </div>

          <h2 className="text-5xl font-black mb-6 leading-tight">
            More Than Just
            <span className="block text-cyan-400">Anime Fans</span>
          </h2>

          <p className="text-zinc-400 leading-relaxed text-lg mb-6">
            The Anime Lunatics is a secret-style anime club where fans gather to discuss new episodes, manga leaks, anime theories, and legendary debates.
          </p>

          <p className="text-zinc-500 leading-relaxed">
            Inspired by dark underground cafes, Tokyo neon streets, dragon smoke aesthetics, and mysterious anime organizations.
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 blur-3xl rounded-full" />

          <div className="relative bg-zinc-900/70 border border-zinc-800 rounded-[2rem] p-10 backdrop-blur-xl shadow-2xl">
            <div className="space-y-6">
              <div>
                <div className="text-zinc-500 uppercase text-xs tracking-widest mb-2">
                  Current Mission
                </div>
                <div className="text-2xl font-bold">Find the best anime of all time.</div>
              </div>

              <div className="h-px bg-zinc-800" />

              <div>
                <div className="text-zinc-500 uppercase text-xs tracking-widest mb-2">
                  Club Access
                </div>
                <div className="text-lg text-purple-400">Members Only</div>
              </div>

              <div className="h-px bg-zinc-800" />

              <div>
                <div className="text-zinc-500 uppercase text-xs tracking-widest mb-2">
                  Vibe
                </div>
                <div className="text-lg text-cyan-400">Dark • Mysterious • Hype</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Footer */}
    <footer className="border-t border-zinc-900 px-6 py-10 text-center text-zinc-500">
      <div className="text-xl font-bold tracking-wide text-zinc-300 mb-2 uppercase">
        The Anime Lunatics
      </div>

      <p className="italic mb-4">
        “Debates about updates, you want it, we got it.”
      </p>

      <div className="text-sm text-zinc-600">
        Hidden in the shadows. Powered by anime obsession.
      </div>
    </footer>
  </div>
</div>

) }
