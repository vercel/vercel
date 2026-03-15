"use client";
import { useRef } from "react";
import { ArrowDownIcon } from "@heroicons/react/24/outline";

export default function Home() {
  const howItWorksRef = useRef<HTMLDivElement | null>(null);

  const scrollToHow = () => {
    howItWorksRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="bg-[#0B1C3A] text-white">
      {/* HERO SECTION */}
      <section className="relative w-full min-h-screen flex flex-col justify-center items-center text-center px-6 pt-24">
        <h1 className="text-5xl md:text-6xl font-extrabold leading-tight">
          Fantasy Football. <br />
          <span className="text-[#2A7FFF]">Rebuilt.</span>
        </h1>

        <p className="mt-6 text-lg md:text-xl text-gray-300 max-w-2xl">
          Draft two NFL teams. Score big. Win weekly.  
          A fast, simple fantasy experience for every football fan.
        </p>

        <div className="mt-8 flex gap-4">
          <a
            href="/signup"
            className="px-8 py-3 bg-[#2A7FFF] rounded-lg font-semibold hover:bg-blue-500 transition"
          >
            Play Free
          </a>

          <button
            onClick={scrollToHow}
            className="px-8 py-3 bg-white text-[#0B1C3A] rounded-lg font-semibold hover:bg-gray-200 transition flex items-center gap-2"
          >
            How It Works <ArrowDownIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="absolute inset-0 bg-[url('/hero-bg.jpg')] bg-cover bg-center opacity-10 pointer-events-none" />
      </section>

      {/* HOW IT WORKS */}
      <section
        ref={howItWorksRef}
        className="w-full bg-[#0F254A] py-20 px-6 text-center"
      >
        <h2 className="text-4xl font-bold mb-12">How It Works</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto">
          <div className="p-6 bg-[#132B55] rounded-xl shadow-lg">
            <h3 className="text-2xl font-semibold mb-4">1. Join a Contest</h3>
            <p className="text-gray-300">
              Enter the free weekly league or use tickets to join higher-tier
              contests.
            </p>
          </div>

          <div className="p-6 bg-[#132B55] rounded-xl shadow-lg">
            <h3 className="text-2xl font-semibold mb-4">
              2. Draft Two NFL Teams
            </h3>
            <p className="text-gray-300">
              A fast, two-round snake draft. Build your lineup with full NFL
              teams.
            </p>
          </div>

          <div className="p-6 bg-[#132B55] rounded-xl shadow-lg">
            <h3 className="text-2xl font-semibold mb-4">
              3. Score From Every Play
            </h3>
            <p className="text-gray-300">
              Real NFL stats combine to form your score. Top players win
              tickets and trophies.
            </p>
          </div>
        </div>
      </section>

      {/* WHY THIS GAME IS DIFFERENT */}
      <section className="w-full bg-[#0B1C3A] py-20 px-6 text-center">
        <h2 className="text-4xl font-bold mb-12">Why This Game Is Different</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 max-w-6xl mx-auto">
          {[
            "Two-Team Entries = more strategy, more fun.",
            "Fast 2-round snake drafts.",
            "No individual players. Easy for beginners.",
            "Limited entries based on NFL schedule.",
            "Weekly contests, no season-long grind.",
            "Transparent scoring from real NFL plays.",
          ].map((text, i) => (
            <div
              key={i}
              className="p-6 bg-[#132B55] rounded-xl shadow-lg text-gray-200"
            >
              {text}
            </div>
          ))}
        </div>
      </section>

      {/* LEAGUE TIERS */}
      <section className="w-full bg-[#0F254A] py-20 px-6 text-center">
        <h2 className="text-4xl font-bold mb-12">League Tiers</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 max-w-7xl mx-auto">
          {[
            { name: "Beginner", cost: "FREE", color: "bg-green-500" },
            { name: "Bronze", cost: "500 Tickets", color: "bg-yellow-600" },
            { name: "Silver", cost: "1,000 Tickets", color: "bg-gray-400" },
            { name: "Gold", cost: "2,500 Tickets", color: "bg-yellow-400" },
            { name: "Platinum", cost: "5,000 Tickets", color: "bg-blue-400" },
          ].map((tier, i) => (
            <div
              key={i}
              className="p-6 bg-[#132B55] rounded-xl shadow-lg flex flex-col"
            >
              <h3 className="text-2xl font-semibold mb-4">{tier.name}</h3>
              <span
                className={`text-xl font-bold px-4 py-2 rounded ${tier.color} text-[#0B1C3A]`}
              >
                {tier.cost}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="w-full bg-[#09172E] py-10 text-center text-gray-400">
        <p>© {new Date().getFullYear()} Your Game Name. All rights reserved.</p>
        <div className="mt-4 flex justify-center gap-6 text-sm">
          <a href="/rules" className="hover:text-white transition">
            Rules & Scoring
          </a>
          <a href="/support" className="hover:text-white transition">
            Support
          </a>
          <a href="/terms" className="hover:text-white transition">
            Terms of Use
          </a>
        </div>
      </footer>
    </main>
  );
}
