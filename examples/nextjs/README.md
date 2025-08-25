import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Gift, Coins, Trophy, User2, LogIn, PhoneCall, Send, Wallet, RefreshCw, X, Gamepad2 } from "lucide-react";

// --- Simple helpers ---
const fmt = (n) => new Intl.NumberFormat().format(n);
const now = () => new Date().toISOString();

// Demo inventory
const GAME_LIST = [
  { id: "super-ace", name: "Super Ace", badge: "JL", icon: "👑", hot: true },
  { id: "aviator-demo", name: "Aviator (Sim)", badge: "SPRIBE", icon: "✈️", hot: true },
  { id: "boxing-king", name: "Boxing King", badge: "JL", icon: "🥊", hot: false },
  { id: "elements", name: "Super Elements", badge: "JL", icon: "🧪", hot: false },
  { id: "lucky-7", name: "Lucky 7", badge: "Demo", icon: "🎰", hot: true },
];

// --- Root Component ---
export default function App() {
  const [user, setUser] = useState(null);
  const [jackpot, setJackpot] = useState(20000000 + Math.floor(Math.random() * 9000000));
  const [tab, setTab] = useState("home");
  const [vip, setVip] = useState({ level: 1, points: 0 });
  const [openAuth, setOpenAuth] = useState(false);
  const [openGame, setOpenGame] = useState(null);
  const [toast, setToast] = useState(null);

  // Jackpot ticker
  useEffect(() => {
    const t = setInterval(() => setJackpot((j) => j + Math.floor(10 + Math.random() * 35)), 120);
    return () => clearInterval(t);
  }, []);

  // Fake sign in
  const signIn = (email) => {
    const u = {
      id: Math.random().toString(36).slice(2),
      email,
      name: email.split("@")[0],
      balance: 5000,
      createdAt: now(),
      tx: [],
    };
    setUser(u);
    setOpenAuth(false);
    setToast({ type: "success", msg: `Welcome, ${u.name}! 5,000 free coins added.` });
  };

  const refill = () => {
    if (!user) return setOpenAuth(true);
    const last = user?.tx?.filter((t) => t.type === "refill").slice(-1)[0];
    const can = !last || Date.now() - new Date(last.at).getTime() > 1000 * 60 * 5; // 5 min cooldown
    if (!can) return setToast({ type: "warn", msg: "Refill available every 5 minutes." });
    const add = 2000;
    const nu = {
      ...user,
      balance: user.balance + add,
      tx: [...user.tx, { id: cryptoRandom(), type: "refill", amount: add, at: now() }],
    };
    setUser(nu);
    bumpVip(3);
  };

  const cryptoRandom = () => Math.random().toString(36).slice(2);

  const bumpVip = (pts) => setVip((v) => {
    const total = v.points + pts;
    const level = 1 + Math.floor(total / 100);
    return { level, points: total };
  });

  const onGameFinish = (delta, bet, gameId, outcome) => {
    const nu = {
      ...user,
      balance: Math.max(0, user.balance + delta),
      tx: [
        ...user.tx,
        { id: cryptoRandom(), type: "round", amount: delta, bet, gameId, outcome, at: now() },
      ],
    };
    setUser(nu);
    bumpVip(Math.max(1, Math.floor(Math.abs(delta) / 10)));
  };

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100">
      <TopBar onDownload={() => setToast({ type: "info", msg: "Demo UI – no real app download." })} />
      <Header user={user} onLogin={() => setOpenAuth(true)} />

      <main className="mx-auto max-w-6xl px-4 pb-24">
        <HeroStrip />
        <VIPRibbon vip={vip} />
        <QuickActions onRefill={refill} onInvite={() => setToast({ type: "info", msg: "Invite friends – demo only." })} onPromo={() => setToast({ type: "info", msg: "Use code DEMO for a smile 🙂" })} />

        <LobbySection jackpot={jackpot} onOpen={(g) => setOpenGame(g)} />
      </main>

      <BottomNav tab={tab} setTab={setTab} />
      <FloatingButtons />

      <AnimatePresence>{openAuth && (
        <AuthModal key="auth" onClose={() => setOpenAuth(false)} onSubmit={signIn} />
      )}</AnimatePresence>

      <AnimatePresence>{openGame && (
        <GameModal key={openGame.id} game={openGame} user={user} onClose={() => setOpenGame(null)} onFinish={onGameFinish} requireAuth={() => setOpenAuth(true)} />
      )}</AnimatePresence>

      <Toast to={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// --- UI pieces ---
function TopBar({ onDownload }) {
  return (
    <div className="bg-amber-600/20 border-b border-amber-500/30">
      <div className="mx-auto max-w-6xl flex items-center gap-4 px-4 py-2 text-sm">
        <span className="font-semibold">APP (DEMO) ▶</span>
        <button onClick={onDownload} className="ml-auto rounded-full bg-amber-500/20 px-3 py-1 hover:bg-amber-500/30 transition">DOWNLOAD</button>
      </div>
    </div>
  );
}

function Header({ user, onLogin }) {
  return (
    <div className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/70 border-b border-white/5">
      <div className="mx-auto max-w-6xl flex items-center gap-3 px-4 py-3">
        <span className="text-xl font-black tracking-wide text-amber-400">GK • JE DEMO</span>
        <span className="text-xs opacity-60">Free‑Play • No real money</span>
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5">
              <Coins className="h-4 w-4" />
              <span className="font-semibold">{fmt(user.balance)}</span>
              <span className="opacity-60">coins</span>
            </div>
          ) : (
            <button onClick={onLogin} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-semibold hover:bg-emerald-500">
              <LogIn className="h-4 w-4" /> Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HeroStrip() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl bg-gradient-to-r from-fuchsia-600/30 via-rose-600/30 to-amber-500/30 p-4 ring-1 ring-white/10">
      <div className="flex items-center gap-4">
        <Gift className="h-10 w-10" />
        <div>
          <div className="text-xl font-extrabold">WELCOME BONUS (DEMO)</div>
          <div className="text-sm opacity-80">Spin & play for fun • Practice only</div>
        </div>
        <div className="ml-auto">
          <button className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20">Learn more</button>
        </div>
      </div>
    </motion.div>
  );
}

function VIPRibbon({ vip }) {
  const pct = Math.min(100, (vip.points % 100));
  return (
    <div className="mt-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <div className="flex items-center gap-3">
        <Crown className="h-6 w-6 text-amber-400" />
        <div className="font-semibold">VIP Lv. {vip.level}</div>
        <div className="ml-auto w-1/2">
          <div className="h-2 rounded bg-white/10">
            <div className="h-2 rounded bg-amber-400" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-xs opacity-70">{vip.points % 100}/100 to next level</div>
        </div>
      </div>
    </div>
  );
}

function QuickActions({ onRefill, onInvite, onPromo }) {
  const Item = ({ title, desc, onClick }) => (
    <button onClick={onClick} className="group flex-1 rounded-2xl bg-gradient-to-br from-white/5 to-white/0 p-4 ring-1 ring-white/10 hover:ring-white/20 transition">
      <div className="text-lg font-bold">{title}</div>
      <div className="text-sm opacity-70">{desc}</div>
    </button>
  );
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
      <Item title="Deposit (Demo)" desc="UI only, no payments" onClick={onPromo} />
      <Item title="Invite Friends" desc="Refer & earn (demo)" onClick={onInvite} />
      <Item title="Refill Coins" desc="Get free coins" onClick={onRefill} />
    </div>
  );
}

function LobbySection({ jackpot, onOpen }) {
  const hot = GAME_LIST.filter((g) => g.hot);
  return (
    <div className="mt-6">
      <Jackpot value={jackpot} />
      <div className="mt-4 flex items-center justify-between">
        <h3 className="text-lg font-bold">Hot</h3>
        <div className="text-sm opacity-70">All games: {GAME_LIST.length}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {hot.map((g) => (<GameCard key={g.id} game={g} onOpen={() => onOpen(g)} />))}
      </div>
      <h3 className="mt-6 text-lg font-bold">All Games</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {GAME_LIST.map((g) => (<GameCard key={g.id} game={g} onOpen={() => onOpen(g)} />))}
      </div>
    </div>
  );
}

function Jackpot({ value }) {
  const digits = fmt(value).split("");
  return (
    <div className="rounded-2xl bg-emerald-600/15 p-4 ring-1 ring-emerald-500/30">
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6" />
        <div className="text-xl font-extrabold tracking-wider">JACKPOT</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {digits.map((d, i) => (
          <motion.div key={i} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.02 }} className="grid h-12 w-9 place-items-center rounded-md bg-black/40 text-lg font-bold ring-1 ring-white/10">
            {d}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function GameCard({ game, onOpen }) {
  return (
    <button onClick={onOpen} className="group relative overflow-hidden rounded-2xl bg-white/5 p-4 text-left ring-1 ring-white/10 hover:ring-white/20">
      <div className="absolute right-2 top-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wide ring-1 ring-white/20">{game.badge}</div>
      <div className="text-4xl">{game.icon}</div>
      <div className="mt-3 text-sm font-semibold">{game.name}</div>
      <div className="mt-1 text-xs opacity-60">Tap to play</div>
    </button>
  );
}

function BottomNav({ tab, setTab }) {
  const NavBtn = ({ id, label, icon: Icon }) => (
    <button onClick={() => setTab(id)} className={`flex flex-col items-center gap-1 ${tab === id ? "text-emerald-400" : "opacity-70"}`}>
      <Icon className="h-5 w-5" />
      <span className="text-xs">{label}</span>
    </button>
  );
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-neutral-950/90 backdrop-blur">
      <div className="mx-auto max-w-6xl grid grid-cols-5 px-6 py-2">
        <NavBtn id="home" label="Home" icon={Gamepad2} />
        <NavBtn id="promo" label="Promotion" icon={Gift} />
        <NavBtn id="invite" label="Invite" icon={Send} />
        <NavBtn id="reward" label="Reward" icon={Trophy} />
        <NavBtn id="profile" label="Profile" icon={User2} />
      </div>
    </div>
  );
}

function FloatingButtons() {
  const Btn = ({ Icon, label }) => (
    <button className="rounded-full bg-emerald-600 p-3 shadow-lg ring-1 ring-black/20 hover:bg-emerald-500" title={label}>
      <Icon className="h-5 w-5" />
    </button>
  );
  return (
    <div className="fixed bottom-24 right-4 z-20 flex flex-col gap-3">
      <Btn Icon={PhoneCall} label="WhatsApp (demo)" />
      <Btn Icon={Send} label="Telegram (demo)" />
    </div>
  );
}

// --- Auth Modal ---
function AuthModal({ onClose, onSubmit }) {
  const [email, setEmail] = useState("");
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4">
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} className="w-full max-w-sm rounded-2xl bg-neutral-900 p-5 ring-1 ring-white/10">
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold">Sign in (Demo)</div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 space-y-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-xl bg-white/5 px-3 py-2 outline-none ring-1 ring-white/10 focus:ring-emerald-500" />
          <button onClick={() => email && onSubmit(email)} className="w-full rounded-xl bg-emerald-600 py-2 font-semibold hover:bg-emerald-500">Continue</button>
          <p className="text-xs opacity-70">No passwords • This is a local demo.</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// --- Game Modal (slot + aviator-sim) ---
function GameModal({ game, user, onClose, onFinish, requireAuth }) {
  const [bet, setBet] = useState(50);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const play = async () => {
    if (!user) return requireAuth();
    if (user.balance < bet) return alert("Not enough coins");
    setBusy(true);
    await new Promise((r) => setTimeout(r, 600));

    // simple RNG: 60% lose, 35% small win, 5% big win
    const roll = Math.random();
    let delta = -bet;
    let outcome = "lose";
    if (roll > 0.95) { delta = bet * 8; outcome = "x8"; }
    else if (roll > 0.60) { delta = Math.floor(bet * (1 + Math.random() * 3)); outcome = "small"; }

    setResult({ outcome, delta });
    onFinish(delta, bet, game.id, outcome);
    setBusy(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4">
      <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="w-full max-w-lg rounded-2xl bg-neutral-900 p-5 ring-1 ring-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-2xl">{game.icon}</div>
            <div>
              <div className="text-lg font-bold">{game.name}</div>
              <div className="text-xs opacity-70">Free‑play demo • RNG toy</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-4 rounded-xl bg-white/5 p-4 text-center ring-1 ring-white/10">
          <div className="text-5xl select-none">🎰 🎲 ✨</div>
          <div className="mt-2 text-sm opacity-80">Bet coins and spin. Outcomes are random.</div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
            <div className="text-xs opacity-60">Bet</div>
            <input type="range" min={10} max={500} step={10} value={bet} onChange={(e) => setBet(parseInt(e.target.value))} className="w-full" />
            <div className="text-sm font-semibold">{bet} coins</div>
          </div>
          <button disabled={busy} onClick={play} className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold hover:bg-emerald-500 disabled:opacity-50">{busy ? "Spinning…" : "Spin"}</button>
        </div>

        {result && (
          <div className={`mt-4 rounded-xl p-3 text-center ring-1 ${result.delta>=0?"bg-emerald-500/15 ring-emerald-500/30":"bg-rose-500/15 ring-rose-500/30"}`}>
            <div className="text-sm opacity-80">Result</div>
            <div className="text-xl font-extrabold">{result.delta >= 0 ? `+${fmt(result.delta)}` : fmt(result.delta)} coins</div>
            <div className="text-xs opacity-70">Outcome: {result.outcome}</div>
          </div>
        )}

        <p className="mt-4 text-center text-xs opacity-60">This is a learning demo UI. No real money, no withdrawals, no payments.</p>
      </motion.div>
    </motion.div>
  );
}

function Toast({ to, onDone }) {
  useEffect(() => {
    if (!to) return;
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [to]);
  if (!to) return null;
  return (
    <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2">
      <div className="rounded-full bg-white/10 px-4 py-2 text-sm ring-1 ring-white/20 backdrop-blur">
        {to.msg}
      </div>
    </motion.div>
  );
}
