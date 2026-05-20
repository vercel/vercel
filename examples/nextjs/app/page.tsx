import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, MessageSquare, QrCode, Bell, Search, Filter, ChevronRight, Star, Award, TrendingUp, Globe, Zap, Heart, Share2, ArrowLeft, Home, Briefcase, Sparkles, Building2, Mic, Radio, Trophy, Target, Check, Clock, ChevronDown, Play, Volume2 } from 'lucide-react';

export default function AGXPrototype() {
  const [activeScreen, setActiveScreen] = useState('home');
  const [showQR, setShowQR] = useState(false);

  const screens = [
    { id: 'home', label: 'Accueil', icon: Home },
    { id: 'agenda', label: 'Programme', icon: Calendar },
    { id: 'map', label: 'Carte', icon: MapPin },
    { id: 'network', label: 'Réseau', icon: Users },
    { id: 'exhibitor', label: 'Exposant', icon: Building2 },
    { id: 'profile', label: 'Profil', icon: QrCode },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #050e08 0%, #0a1a12 50%, #050e08 100%)',
      padding: '40px 20px',
      fontFamily: "'Space Grotesk', system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; }

        @keyframes pulse-gold {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(400%); }
        }
        @keyframes ripple {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        .shimmer-text {
          background: linear-gradient(90deg, #c9a84c 0%, #f0d080 50%, #c9a84c 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 3s linear infinite;
        }
        .glass {
          background: rgba(20, 40, 28, 0.4);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(201, 168, 76, 0.15);
        }
        .glass-strong {
          background: rgba(13, 30, 22, 0.85);
          backdrop-filter: blur(30px);
          -webkit-backdrop-filter: blur(30px);
          border: 1px solid rgba(201, 168, 76, 0.2);
        }
        .gold-border {
          position: relative;
        }
        .gold-border::before {
          content: '';
          position: absolute;
          inset: 0;
          padding: 1px;
          background: linear-gradient(135deg, rgba(201, 168, 76, 0.6), transparent, rgba(201, 168, 76, 0.3));
          border-radius: inherit;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        .phone-shadow {
          box-shadow:
            0 0 0 1px rgba(201, 168, 76, 0.1),
            0 0 60px rgba(201, 168, 76, 0.08),
            0 30px 60px -15px rgba(0, 0, 0, 0.6);
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* HEADER */}
      <div style={{ maxWidth: '1400px', margin: '0 auto 40px', textAlign: 'center' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.3em', color: '#c9a84c', marginBottom: '12px', fontFamily: 'Inter' }}>
          PROTOTYPE INTERACTIF · ÉDITION 2 (2029+)
        </div>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(36px, 5vw, 56px)',
          fontWeight: 900,
          color: '#fff',
          margin: '0 0 8px',
          letterSpacing: '-0.02em',
        }}>
          Africa <span className="shimmer-text">GreenTech</span> Expo
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '15px', fontStyle: 'italic', fontFamily: 'Inter' }}>
          Building Africa's Sustainable Future · L'app officielle de l'événement
        </p>
      </div>

      {/* MAIN CONTAINER */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
        gap: '40px',
        alignItems: 'start',
      }}>
        {/* NAVIGATION SIDEBAR */}
        <div className="glass-strong" style={{
          padding: '24px',
          borderRadius: '20px',
          position: 'sticky',
          top: '20px',
        }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', color: '#c9a84c', marginBottom: '16px', fontFamily: 'Inter' }}>
            ÉCRANS À EXPLORER
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {screens.map((screen) => {
              const Icon = screen.icon;
              const isActive = activeScreen === screen.id;
              return (
                <button
                  key={screen.id}
                  onClick={() => setActiveScreen(screen.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px 16px',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    background: isActive ? 'linear-gradient(135deg, #1a6b47, #2e9e6a)' : 'transparent',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                    fontWeight: isActive ? 600 : 400,
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    transition: 'all 0.3s ease',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Icon size={18} />
                  <span>{screen.label}</span>
                  {isActive && <ChevronRight size={16} style={{ marginLeft: 'auto' }} />}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(201, 168, 76, 0.08)', borderRadius: '12px', border: '1px solid rgba(201, 168, 76, 0.2)' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', color: '#c9a84c', marginBottom: '6px', fontFamily: 'Inter' }}>
              CONSEIL
            </div>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, margin: 0, fontFamily: 'Inter' }}>
              Cliquez sur chaque écran pour naviguer dans le prototype. Présentable en réunion ministérielle.
            </p>
          </div>
        </div>

        {/* PHONE MOCKUP */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
          <div style={{
            width: '380px',
            height: '780px',
            background: '#000',
            borderRadius: '48px',
            padding: '14px',
            position: 'relative',
          }} className="phone-shadow">
            {/* Notch */}
            <div style={{
              position: 'absolute',
              top: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '110px',
              height: '28px',
              background: '#000',
              borderRadius: '20px',
              zIndex: 100,
            }} />

            {/* Screen */}
            <div style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(180deg, #0a1a12 0%, #050e08 100%)',
              borderRadius: '36px',
              overflow: 'hidden',
              position: 'relative',
              fontFamily: "'Inter', sans-serif",
            }}>
              {/* Status bar */}
              <div style={{
                height: '44px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0 24px',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                position: 'relative',
                zIndex: 50,
              }}>
                <span>9:41</span>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    {[1,2,3,4].map(i => <div key={i} style={{ width: '3px', height: `${3 + i * 1.5}px`, background: '#fff', borderRadius: '1px' }} />)}
                  </div>
                  <svg width="15" height="11" viewBox="0 0 15 11" fill="none"><path d="M7.5 0C4.5 0 1.8 1.1 0 2.8L7.5 11L15 2.8C13.2 1.1 10.5 0 7.5 0Z" fill="#fff"/></svg>
                  <div style={{ width: '22px', height: '11px', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '2px', padding: '1px', position: 'relative' }}>
                    <div style={{ width: '80%', height: '100%', background: '#fff', borderRadius: '1px' }} />
                  </div>
                </div>
              </div>

              {/* Content rendering */}
              <div style={{ height: 'calc(100% - 44px)', overflowY: 'auto', position: 'relative' }} className="scrollbar-hide">
                {activeScreen === 'home' && <HomeScreen />}
                {activeScreen === 'agenda' && <AgendaScreen />}
                {activeScreen === 'map' && <MapScreen />}
                {activeScreen === 'network' && <NetworkScreen />}
                {activeScreen === 'exhibitor' && <ExhibitorScreen />}
                {activeScreen === 'profile' && <ProfileScreen showQR={showQR} setShowQR={setShowQR} />}
              </div>

              {/* Bottom Tab Bar */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '80px',
                background: 'rgba(5, 14, 8, 0.95)',
                backdropFilter: 'blur(20px)',
                borderTop: '1px solid rgba(201, 168, 76, 0.15)',
                display: 'flex',
                justifyContent: 'space-around',
                alignItems: 'center',
                padding: '0 8px 20px',
              }}>
                {[
                  { id: 'home', icon: Home },
                  { id: 'agenda', icon: Calendar },
                  { id: 'map', icon: MapPin },
                  { id: 'network', icon: Users },
                  { id: 'profile', icon: QrCode },
                ].map(({ id, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveScreen(id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      color: activeScreen === id ? '#c9a84c' : 'rgba(255,255,255,0.4)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.3s',
                    }}
                  >
                    <Icon size={20} strokeWidth={activeScreen === id ? 2.5 : 1.8} />
                    {activeScreen === id && <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#c9a84c' }} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* INFO FOOTER */}
      <div style={{ maxWidth: '1400px', margin: '60px auto 0', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontFamily: 'Inter' }}>
        <p style={{ margin: '0 0 8px' }}>Prototype présentable aux ministères · Vision Édition 2 (2029+)</p>
        <p style={{ margin: 0, fontStyle: 'italic' }}>agexpo.africa · Édition 1 livrée via plateforme tierce (Brella / Swapcard)</p>
      </div>
    </div>
  );
}

/* =================================================
   ÉCRAN 1 — HOME
================================================= */
function HomeScreen() {
  return (
    <div style={{ padding: '0 0 100px', color: '#fff' }}>
      {/* Hero header */}
      <div style={{ padding: '16px 24px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          top: '-50px',
          right: '-50px',
          width: '200px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(201, 168, 76, 0.15), transparent 70%)',
          borderRadius: '50%',
        }} />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#c9a84c', fontWeight: 600, letterSpacing: '0.1em', marginBottom: '2px' }}>BIENVENUE</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: 700 }}>Tenon B.</div>
            </div>
            <div style={{ position: 'relative' }}>
              <Bell size={22} color="rgba(255,255,255,0.8)" />
              <div style={{ position: 'absolute', top: -2, right: -2, width: '8px', height: '8px', background: '#c9a84c', borderRadius: '50%', animation: 'pulse-gold 2s infinite' }} />
            </div>
          </div>

          {/* Countdown card */}
          <div className="glass gold-border" style={{ padding: '20px', borderRadius: '20px', marginBottom: '16px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontSize: '10px', color: '#c9a84c', fontWeight: 700, letterSpacing: '0.2em', marginBottom: '8px' }}>L'ÉVÉNEMENT COMMENCE DANS</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {[{n: '23', l: 'JOURS'}, {n: '14', l: 'HEURES'}, {n: '32', l: 'MIN'}].map((t, i) => (
                <div key={i} style={{ flex: 1, padding: '12px 0', background: 'rgba(201, 168, 76, 0.08)', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 700, color: '#c9a84c', lineHeight: 1 }}>{t.n}</div>
                  <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.1em', marginTop: '4px' }}>{t.l}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={12} />
              <span>13-15 Octobre 2027 · Abidjan</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ padding: '0 24px', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {[
            { icon: QrCode, label: 'Mon QR Code', color: '#c9a84c' },
            { icon: Calendar, label: 'Mon agenda', color: '#2e9e6a' },
            { icon: MapPin, label: 'Carte 3D', color: '#1b72a8' },
            { icon: Sparkles, label: 'AGX AI', color: '#8e4d9c' },
          ].map((a, i) => {
            const Icon = a.icon;
            return (
              <div key={i} className="glass" style={{ padding: '14px', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `${a.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={18} color={a.color} />
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>{a.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live now */}
      <div style={{ padding: '0 24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', animation: 'pulse-gold 1.5s infinite' }} />
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em' }}>EN DIRECT</div>
          </div>
          <button style={{ background: 'none', border: 'none', color: '#c9a84c', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Voir tout →</button>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #1a6b47 0%, #0d3d2b 100%)',
          padding: '20px',
          borderRadius: '18px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.4)', padding: '4px 10px', borderRadius: '12px' }}>
            <div style={{ width: '6px', height: '6px', background: '#ef4444', borderRadius: '50%' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em' }}>1.2K</span>
          </div>
          <div style={{ fontSize: '11px', color: '#c9a84c', fontWeight: 600, marginBottom: '6px', letterSpacing: '0.1em' }}>SCÈNE PRINCIPALE</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '18px', fontWeight: 700, lineHeight: 1.2, marginBottom: '10px' }}>Keynote : L'Afrique au cœur du marché carbone mondial</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Play size={12} fill="#fff" /> Regarder en direct
          </div>
        </div>
      </div>

      {/* Featured speakers */}
      <div style={{ padding: '0 24px', marginBottom: '24px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', fontFamily: "'Playfair Display', serif", fontStyle: 'italic' }}>Speakers à ne pas manquer</div>
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto' }} className="scrollbar-hide">
          {[
            { initials: 'AK', name: 'Aïssatou Kane', role: 'CEO Climat Africa', bg: 'linear-gradient(135deg, #c9a84c, #f0d080)' },
            { initials: 'JN', name: 'Jamal Niang', role: 'Dir. BAD Climat', bg: 'linear-gradient(135deg, #1b72a8, #2e9e6a)' },
            { initials: 'SO', name: 'Sarah Okonkwo', role: 'Fondatrice GreenLab', bg: 'linear-gradient(135deg, #8e4d9c, #b85042)' },
          ].map((s, i) => (
            <div key={i} style={{ minWidth: '140px', textAlign: 'center' }}>
              <div style={{
                width: '80px',
                height: '80px',
                margin: '0 auto 8px',
                borderRadius: '50%',
                background: s.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 700,
                fontFamily: "'Playfair Display', serif",
                border: '2px solid rgba(201, 168, 76, 0.3)',
              }}>{s.initials}</div>
              <div style={{ fontSize: '12px', fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>{s.role}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Smart suggestions */}
      <div style={{ padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
          <Sparkles size={14} color="#c9a84c" />
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#c9a84c' }}>SUGGESTIONS AGX AI</div>
        </div>
        <div className="glass" style={{ padding: '16px', borderRadius: '14px', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>Match networking</div>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>3 investisseurs cherchent votre secteur</div>
          <div style={{ fontSize: '11px', color: '#c9a84c' }}>Voir les profils suggérés →</div>
        </div>
      </div>
    </div>
  );
}

/* =================================================
   ÉCRAN 2 — AGENDA
================================================= */
function AgendaScreen() {
  const [selectedDay, setSelectedDay] = useState(1);
  const sessions = [
    { time: '09:00', duration: '60 min', title: "Cérémonie d'ouverture officielle", location: 'Scène Principale', speaker: 'Ministre de l\'Environnement CI', type: 'KEYNOTE', tagColor: '#c9a84c', live: true },
    { time: '10:30', duration: '90 min', title: 'L\'Afrique, hub mondial de la GreenTech', location: 'Scène A', speaker: '5 panélistes internationaux', type: 'PANEL', tagColor: '#1b72a8', registered: true },
    { time: '12:00', duration: '60 min', title: 'Pitch Session — 10 startups GreenTech', location: 'Investor Lounge', speaker: 'Jury VC international', type: 'PITCH', tagColor: '#8e4d9c' },
    { time: '14:00', duration: '120 min', title: 'Hackathon : kick-off des défis', location: 'Innovation Arena', speaker: '50 équipes participantes', type: 'HACK', tagColor: '#2e9e6a' },
    { time: '17:00', duration: '45 min', title: 'Investor Roundtable : 200M€ pour le climat africain', location: 'Investor Lounge', speaker: 'BAD, AFD, PNUD', type: 'EXCLUSIF', tagColor: '#b85042' },
  ];

  return (
    <div style={{ padding: '0 0 100px', color: '#fff' }}>
      <div style={{ padding: '16px 24px 0', position: 'sticky', top: 0, background: 'linear-gradient(180deg, #0a1a12 0%, rgba(10, 26, 18, 0.95) 80%, transparent 100%)', zIndex: 10, paddingBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#c9a84c', fontWeight: 700, letterSpacing: '0.2em', marginBottom: '2px' }}>PROGRAMME</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '24px', fontWeight: 700 }}>Mon agenda</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(201, 168, 76, 0.1)', border: '1px solid rgba(201, 168, 76, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Search size={16} color="#c9a84c" />
            </button>
            <button style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(201, 168, 76, 0.1)', border: '1px solid rgba(201, 168, 76, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Filter size={16} color="#c9a84c" />
            </button>
          </div>
        </div>

        {/* Day selector */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { d: 1, date: '13 OCT', label: 'JOUR 1' },
            { d: 2, date: '14 OCT', label: 'JOUR 2' },
            { d: 3, date: '15 OCT', label: 'JOUR 3' },
          ].map((day) => (
            <button
              key={day.d}
              onClick={() => setSelectedDay(day.d)}
              style={{
                flex: 1,
                padding: '14px 0',
                borderRadius: '14px',
                border: 'none',
                cursor: 'pointer',
                background: selectedDay === day.d ? 'linear-gradient(135deg, #1a6b47, #2e9e6a)' : 'rgba(255,255,255,0.04)',
                color: '#fff',
                fontFamily: 'Inter',
                transition: 'all 0.3s',
              }}
            >
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', opacity: 0.7, marginBottom: '4px' }}>{day.label}</div>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>{day.date}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 24px', marginTop: '8px' }}>
        {sessions.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', position: 'relative' }}>
            {/* Timeline */}
            <div style={{ width: '50px', flexShrink: 0, paddingTop: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'JetBrains Mono' }}>{s.time}</div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontFamily: 'JetBrains Mono', marginTop: '2px' }}>{s.duration}</div>
            </div>

            {/* Card */}
            <div className="glass" style={{ flex: 1, padding: '16px', borderRadius: '16px', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: s.tagColor, background: `${s.tagColor}22`, padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.1em' }}>{s.type}</span>
                {s.live && <span style={{ fontSize: '9px', fontWeight: 700, color: '#ef4444', background: 'rgba(239, 68, 68, 0.15)', padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '5px', height: '5px', background: '#ef4444', borderRadius: '50%' }} />LIVE</span>}
                {s.registered && <Check size={12} color="#2e9e6a" />}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, lineHeight: 1.3, marginBottom: '8px' }}>{s.title}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <MapPin size={11} /><span>{s.location}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Mic size={11} /><span>{s.speaker}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =================================================
   ÉCRAN 3 — MAP
================================================= */
function MapScreen() {
  return (
    <div style={{ padding: '0 0 100px', color: '#fff' }}>
      <div style={{ padding: '16px 24px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#c9a84c', fontWeight: 700, letterSpacing: '0.2em', marginBottom: '2px' }}>NAVIGATION</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '24px', fontWeight: 700 }}>Carte interactive</div>
          </div>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(201, 168, 76, 0.1)', border: '1px solid rgba(201, 168, 76, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={16} color="#c9a84c" />
          </div>
        </div>

        {/* Search bar */}
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '14px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Search size={16} color="rgba(255,255,255,0.5)" />
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Rechercher un exposant, stand, zone...</span>
        </div>

        {/* Map view */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(13, 61, 43, 0.4), rgba(26, 107, 71, 0.2))',
          borderRadius: '20px',
          padding: '24px',
          position: 'relative',
          overflow: 'hidden',
          minHeight: '260px',
          border: '1px solid rgba(201, 168, 76, 0.15)',
        }}>
          {/* Grid pattern */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(rgba(201, 168, 76, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(201, 168, 76, 0.05) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }} />

          {/* Zones */}
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div style={{ padding: '14px 10px', background: 'rgba(201, 168, 76, 0.15)', borderRadius: '12px', border: '1px solid rgba(201, 168, 76, 0.3)', textAlign: 'center', position: 'relative' }}>
              <div style={{ fontSize: '9px', color: '#c9a84c', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '4px' }}>HALL A</div>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>Startup Village</div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>120 startups</div>
              <div style={{ position: 'absolute', top: '6px', right: '6px', width: '6px', height: '6px', background: '#2e9e6a', borderRadius: '50%' }} />
            </div>
            <div style={{ padding: '14px 10px', background: 'rgba(27, 114, 168, 0.15)', borderRadius: '12px', border: '1px solid rgba(27, 114, 168, 0.3)', textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#1b72a8', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '4px' }}>HALL B</div>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>Pavillons Asie</div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>CN · IN · JP · KR</div>
            </div>
          </div>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div style={{ padding: '14px 10px', background: 'rgba(142, 77, 156, 0.15)', borderRadius: '12px', border: '1px solid rgba(142, 77, 156, 0.3)', textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#8e4d9c', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '4px' }}>HALL C</div>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>Investor Lounge</div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>VIP only</div>
            </div>
            <div style={{ padding: '14px 10px', background: 'rgba(46, 158, 106, 0.15)', borderRadius: '12px', border: '1px solid rgba(46, 158, 106, 0.3)', textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#2e9e6a', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '4px' }}>HALL D</div>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>GreenTech Arena</div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>Scène principale</div>
            </div>
          </div>
          <div style={{ position: 'relative', padding: '14px 10px', background: 'rgba(184, 80, 66, 0.15)', borderRadius: '12px', border: '1px solid rgba(184, 80, 66, 0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: '#b85042', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '4px' }}>ESPACE COMMUN</div>
            <div style={{ fontSize: '11px', fontWeight: 600 }}>Food & Networking · AGX Lounge</div>
          </div>

          {/* User location */}
          <div style={{ position: 'absolute', bottom: '50%', left: '30%', transform: 'translate(-50%, 50%)' }}>
            <div style={{ position: 'absolute', inset: 0, animation: 'ripple 2s infinite', borderRadius: '50%', background: 'rgba(201, 168, 76, 0.4)' }} />
            <div style={{ position: 'relative', width: '14px', height: '14px', background: '#c9a84c', borderRadius: '50%', border: '2px solid #fff' }} />
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', marginBottom: '20px' }}>
          {[
            { v: '320', l: 'Exposants' },
            { v: '5K', l: 'Visiteurs' },
            { v: '4', l: 'Pavillons Asie' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c' }}>{s.v}</div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.1em', marginTop: '2px' }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Featured stand */}
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#c9a84c', marginBottom: '10px' }}>STANDS RECOMMANDÉS</div>
        {[
          { hall: 'A-12', name: 'GreenLab Côte d\'Ivoire', sector: 'Énergie solaire', visited: true },
          { hall: 'B-04', name: 'Beijing CleanTech', sector: 'Recyclage industriel' },
          { hall: 'D-22', name: 'EcoCircular Africa', sector: 'Économie circulaire' },
        ].map((s, i) => (
          <div key={i} className="glass" style={{ padding: '14px', borderRadius: '12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ minWidth: '40px', height: '40px', borderRadius: '10px', background: 'rgba(201, 168, 76, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#c9a84c' }}>{s.hall}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>{s.sector}</div>
            </div>
            {s.visited && <Check size={14} color="#2e9e6a" />}
            <ChevronRight size={14} color="rgba(255,255,255,0.4)" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* =================================================
   ÉCRAN 4 — NETWORK / MATCHMAKING
================================================= */
function NetworkScreen() {
  const matches = [
    { name: 'Dr. Aïssa Touré', role: 'Directrice Innovation', company: 'BAD - Banque Africaine de Développement', match: 96, sector: 'Financement climat', initials: 'AT', bg: 'linear-gradient(135deg, #c9a84c, #f0d080)', tags: ['Investisseur', 'Climat'] },
    { name: 'Marcus Chen', role: 'Head of Partnerships', company: 'CAEPI - China Environment', match: 92, sector: 'Recyclage', initials: 'MC', bg: 'linear-gradient(135deg, #1b72a8, #2e9e6a)', tags: ['Exposant', 'Asie'] },
    { name: 'Sarah Diallo', role: 'CEO & Fondatrice', company: 'EcoWaste Senegal', match: 89, sector: 'Gestion déchets', initials: 'SD', bg: 'linear-gradient(135deg, #8e4d9c, #b85042)', tags: ['Startup', 'Afrique de l\'Ouest'] },
  ];

  return (
    <div style={{ padding: '0 0 100px', color: '#fff' }}>
      <div style={{ padding: '16px 24px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#c9a84c', fontWeight: 700, letterSpacing: '0.2em', marginBottom: '2px' }}>NETWORKING IA</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '24px', fontWeight: 700 }}>Mes matchs</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(201, 168, 76, 0.1)', border: '1px solid rgba(201, 168, 76, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <MessageSquare size={16} color="#c9a84c" />
              <div style={{ position: 'absolute', top: 6, right: 6, width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%' }} />
            </div>
          </div>
        </div>

        {/* AI suggestion banner */}
        <div className="glass gold-border" style={{ padding: '16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #c9a84c, #f0d080)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles size={18} color="#0d3d2b" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#c9a84c', letterSpacing: '0.1em', marginBottom: '2px' }}>AGX AI</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.4 }}>15 profils correspondent à vos centres d'intérêt</div>
          </div>
        </div>

        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#c9a84c', marginBottom: '12px' }}>SUGGESTIONS PRIORITAIRES</div>

        {matches.map((m, i) => (
          <div key={i} className="glass" style={{ padding: '16px', borderRadius: '16px', marginBottom: '12px', position: 'relative' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700, fontFamily: "'Playfair Display', serif" }}>{m.initials}</div>
                <div style={{ position: 'absolute', bottom: -4, right: -4, background: '#0d3d2b', border: '2px solid #c9a84c', borderRadius: '12px', padding: '2px 6px', fontSize: '9px', fontWeight: 700, color: '#c9a84c' }}>{m.match}%</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>{m.name}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '2px' }}>{m.role}</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{m.company}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
              {m.tags.map((t, j) => (
                <span key={j} style={{ fontSize: '9px', fontWeight: 600, color: '#c9a84c', background: 'rgba(201, 168, 76, 0.12)', padding: '4px 10px', borderRadius: '6px', letterSpacing: '0.05em' }}>{t}</span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button style={{ padding: '10px', background: 'linear-gradient(135deg, #c9a84c, #b8973c)', color: '#0d3d2b', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Calendar size={14} /> RDV
              </button>
              <button style={{ padding: '10px', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', fontWeight: 600, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <MessageSquare size={14} /> Message
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =================================================
   ÉCRAN 5 — EXHIBITOR PROFILE
================================================= */
function ExhibitorScreen() {
  return (
    <div style={{ padding: '0 0 100px', color: '#fff' }}>
      {/* Hero */}
      <div style={{ position: 'relative', height: '180px', background: 'linear-gradient(135deg, #0d3d2b 0%, #1a6b47 50%, #2e9e6a 100%)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 70% 30%, rgba(201, 168, 76, 0.2), transparent 60%)' }} />
        <div style={{ position: 'absolute', top: '14px', left: '20px', right: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ArrowLeft size={16} color="#fff" />
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Heart size={16} color="#fff" />
            </button>
            <button style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Share2 size={16} color="#fff" />
            </button>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', right: '20px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#c9a84c', letterSpacing: '0.2em', marginBottom: '4px' }}>EXPOSANT PREMIUM</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: 700, lineHeight: 1.1 }}>EcoCircular Africa</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>Stand D-22 · Hall GreenTech Arena</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 24px' }}>
        {/* Quick info */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {[
            { icon: Building2, l: 'Côte d\'Ivoire' },
            { icon: TrendingUp, l: '12M€ levés' },
            { icon: Award, l: 'Top 10' },
          ].map((q, i) => {
            const Icon = q.icon;
            return (
              <div key={i} className="glass" style={{ flex: 1, padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                <Icon size={16} color="#c9a84c" style={{ margin: '0 auto 6px', display: 'block' }} />
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{q.l}</div>
              </div>
            );
          })}
        </div>

        {/* About */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#c9a84c', marginBottom: '8px' }}>À PROPOS</div>
          <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(255,255,255,0.8)', margin: 0 }}>
            EcoCircular Africa transforme les déchets industriels en matériaux de construction durables. Opérationnel dans 8 pays africains avec 240 emplois créés.
          </p>
        </div>

        {/* Sectors */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#c9a84c', marginBottom: '10px' }}>SECTEURS D'EXPERTISE</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['Économie circulaire', 'Recyclage', 'BTP durable', 'Climat'].map((t, i) => (
              <span key={i} style={{ fontSize: '10px', fontWeight: 600, color: '#c9a84c', background: 'rgba(201, 168, 76, 0.12)', padding: '6px 12px', borderRadius: '8px' }}>{t}</span>
            ))}
          </div>
        </div>

        {/* Resources */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#c9a84c', marginBottom: '10px' }}>RESSOURCES</div>
          {[
            { icon: Building2, label: 'Brochure entreprise 2027', size: 'PDF · 4.2 MB' },
            { icon: Play, label: 'Vidéo de présentation', size: '03:24 min' },
            { icon: Globe, label: 'Site web officiel', size: 'ecocircular.africa' },
          ].map((r, i) => {
            const Icon = r.icon;
            return (
              <div key={i} className="glass" style={{ padding: '12px 14px', borderRadius: '12px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(201, 168, 76, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color="#c9a84c" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>{r.label}</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{r.size}</div>
                </div>
                <ChevronRight size={14} color="rgba(255,255,255,0.4)" />
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <button style={{
          width: '100%',
          padding: '16px',
          background: 'linear-gradient(135deg, #c9a84c, #b8973c)',
          color: '#0d3d2b',
          border: 'none',
          borderRadius: '14px',
          fontWeight: 700,
          fontSize: '14px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '10px',
        }}>
          <Calendar size={16} />
          Prendre rendez-vous au stand
        </button>
      </div>
    </div>
  );
}

/* =================================================
   ÉCRAN 6 — PROFILE / QR CODE
================================================= */
function ProfileScreen({ showQR, setShowQR }) {
  return (
    <div style={{ padding: '0 0 100px', color: '#fff', position: 'relative' }}>
      {/* QR Modal */}
      {showQR && (
        <div onClick={() => setShowQR(false)} style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(20px)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
        }}>
          <div style={{ fontSize: '11px', color: '#c9a84c', fontWeight: 700, letterSpacing: '0.2em', marginBottom: '24px' }}>VOTRE BADGE D'ACCÈS</div>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '24px', position: 'relative', marginBottom: '24px' }}>
            {/* QR code visual */}
            <div style={{ width: '200px', height: '200px', position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gridTemplateRows: 'repeat(15, 1fr)', gap: '2px' }}>
              {Array.from({ length: 225 }).map((_, i) => {
                const isCorner = (
                  (i % 15 < 3 && Math.floor(i / 15) < 3) ||
                  (i % 15 > 11 && Math.floor(i / 15) < 3) ||
                  (i % 15 < 3 && Math.floor(i / 15) > 11)
                );
                const fill = isCorner ? 1 : Math.random() > 0.5 ? 1 : 0;
                return (
                  <div key={i} style={{ background: fill ? '#0d3d2b' : '#fff', borderRadius: '1px' }} />
                );
              })}
              {/* Scanning line */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)', animation: 'scan 2s infinite' }} />
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700 }}>Tenon B. Coulibaly</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>Commissaire Général · Pass VIP</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '12px', fontFamily: 'JetBrains Mono' }}>ID : AGX-2027-001</div>
          </div>
          <button onClick={() => setShowQR(false)} style={{ marginTop: '24px', padding: '10px 24px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '20px', color: '#fff', cursor: 'pointer', fontSize: '12px' }}>Fermer</button>
        </div>
      )}

      <div style={{ padding: '20px 24px' }}>
        {/* User card */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <div style={{ width: '88px', height: '88px', borderRadius: '50%', background: 'linear-gradient(135deg, #c9a84c, #f0d080)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 700, color: '#0d3d2b', fontFamily: "'Playfair Display', serif" }}>TC</div>
            <div style={{ position: 'absolute', bottom: 0, right: 0, background: '#c9a84c', borderRadius: '12px', padding: '3px 8px', fontSize: '9px', fontWeight: 700, color: '#0d3d2b', letterSpacing: '0.1em' }}>VIP</div>
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Tenon B. Coulibaly</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Commissaire Général · AGX 2027</div>
        </div>

        {/* QR button */}
        <button onClick={() => setShowQR(true)} className="gold-border" style={{
          width: '100%',
          padding: '16px',
          background: 'linear-gradient(135deg, rgba(201, 168, 76, 0.15), rgba(201, 168, 76, 0.05))',
          border: 'none',
          borderRadius: '16px',
          color: '#c9a84c',
          fontWeight: 700,
          fontSize: '14px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          marginBottom: '20px',
        }}>
          <QrCode size={18} />
          Afficher mon QR Code
        </button>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '24px' }}>
          {[
            { v: '42', l: 'Contacts', icon: Users },
            { v: '18', l: 'Sessions', icon: Calendar },
            { v: '8', l: 'Badges', icon: Trophy },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="glass" style={{ padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                <Icon size={14} color="#c9a84c" style={{ margin: '0 auto 6px', display: 'block' }} />
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700 }}>{s.v}</div>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.1em', marginTop: '2px' }}>{s.l}</div>
              </div>
            );
          })}
        </div>

        {/* Badges */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#c9a84c' }}>MES BADGES</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>8 / 24</div>
          </div>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px' }} className="scrollbar-hide">
            {[
              { icon: Trophy, label: 'Networker', earned: true },
              { icon: Target, label: '10 RDV', earned: true },
              { icon: Award, label: 'Early Bird', earned: true },
              { icon: Star, label: 'Top 10', earned: false },
              { icon: Zap, label: 'Speed', earned: false },
            ].map((b, i) => {
              const Icon = b.icon;
              return (
                <div key={i} style={{
                  minWidth: '70px',
                  height: '90px',
                  background: b.earned ? 'linear-gradient(135deg, rgba(201, 168, 76, 0.15), rgba(201, 168, 76, 0.05))' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${b.earned ? 'rgba(201, 168, 76, 0.3)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  opacity: b.earned ? 1 : 0.4,
                }}>
                  <Icon size={20} color={b.earned ? '#c9a84c' : 'rgba(255,255,255,0.3)'} />
                  <div style={{ fontSize: '9px', fontWeight: 600, color: b.earned ? '#c9a84c' : 'rgba(255,255,255,0.4)' }}>{b.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Settings */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#c9a84c', marginBottom: '10px' }}>PARAMÈTRES</div>
          {[
            { icon: Bell, l: 'Notifications' },
            { icon: Globe, l: 'Langue · Français' },
            { icon: Briefcase, l: 'Préférences business' },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="glass" style={{ padding: '14px', borderRadius: '12px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Icon size={16} color="rgba(255,255,255,0.7)" />
                <div style={{ flex: 1, fontSize: '12px' }}>{s.l}</div>
                <ChevronRight size={14} color="rgba(255,255,255,0.4)" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
