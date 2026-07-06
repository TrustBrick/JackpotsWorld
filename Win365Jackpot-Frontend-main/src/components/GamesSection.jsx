import React, { useState, memo } from 'react'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'

const games = [
  {
    id: 'baccarat', name: 'Baccarat', emoji: '🃏',
    desc: 'The premier game of Asia\'s elite. Simple, elegant, and high-stakes. Back the Player, Banker, or Tie with up to 1:8 odds.',
    rtp: '98.94%', minBet: '$500', maxBet: '$50 Lakhs',
    countries: ['🇲🇴','🇻🇳','🇵🇭'], tag: 'Most Popular in Asia', color: '#D4AF37',
  },
  {
    id: 'roulette', name: 'Roulette', emoji: '🎡',
    desc: 'Watch the wheel spin in thrilling anticipation. European single-zero for the best odds. Inside bets, outside bets — the choices are endless.',
    rtp: '97.30%', minBet: '$100', maxBet: '$5 Lakhs',
    countries: ['🇮🇳','🇱🇰','🇵🇭'], tag: 'Fan Favourite', color: '#E53935',
  },
  {
    id: 'poker', name: 'Texas Hold\'em', emoji: '🤠',
    desc: 'Skill meets fortune at our live poker tables. Bluff, bet, and outsmart opponents in the world\'s most popular card game.',
    rtp: '97.00%', minBet: '$1,000', maxBet: '$25 Lakhs',
    countries: ['🇻🇳','🇮🇳','🇱🇰'], tag: 'Tournament Ready', color: '#43A047',
  },
  {
    id: 'blackjack', name: 'Blackjack 21', emoji: '🂡',
    desc: 'Beat the dealer to 21. With optimal strategy, this game has the lowest house edge. Doubles, splits, insurance — master the art.',
    rtp: '99.50%', minBet: '$200', maxBet: '$10 Lakhs',
    countries: ['🇲🇴','🇱🇰','🇵🇭'], tag: 'Best Odds', color: '#1E88E5',
  },
  {
    id: 'slots', name: 'Jackpot Slots', emoji: '🎰',
    desc: 'Thousands of themes, millions in progressive jackpots. From classic 3-reels to cinematic video slots with bonus rounds.',
    rtp: '96.00%', minBet: '$10', maxBet: '$1 Lakh',
    countries: ['🇻🇳','🇲🇴','🇮🇳','🇱🇰','🇵🇭'], tag: '🎯 Jackpots World Exclusive', color: '#8E24AA',
  },
  {
    id: 'sicbo', name: 'Sic Bo / Dice', emoji: '🎲',
    desc: 'Ancient Chinese dice game with modern payouts. Predict dice combinations and win up to 150:1 on triple bets.',
    rtp: '97.20%', minBet: '$200', maxBet: '$2 Lakhs',
    countries: ['🇲🇴','🇻🇳'], tag: 'Asia Classic', color: '#F57C00',
  },
]

// ─── Roulette — CSS spin only, no framer-motion on wheel ─────────────────
const RouletteWheel = memo(() => (
  <div style={{
    width:'clamp(112px,18vw,192px)', height:'clamp(112px,18vw,192px)',
    borderRadius:'50%', border:'4px solid rgba(212,175,55,0.5)',
    position:'relative', display:'flex', alignItems:'center', justifyContent:'center',
    background:'conic-gradient(#1a0015 0deg 17deg,#2d0020 17deg 34deg,#1a0015 34deg 51deg,#2d0020 51deg 68deg,#1a0015 68deg 85deg,#2d0020 85deg 102deg,#1a0015 102deg 119deg,#2d0020 119deg 136deg,#1a0015 136deg 153deg,#2d0020 153deg 170deg,#1a0015 170deg 187deg,#2d0020 187deg 204deg,#1a0015 204deg 221deg,#2d0020 221deg 238deg,#1a0015 238deg 255deg,#2d0020 255deg 272deg,#1a0015 272deg 289deg,#2d0020 289deg 306deg,#1a0015 306deg 323deg,#2d0020 323deg 340deg,#1a0015 340deg 360deg)',
    animation:'spinRing 6s linear infinite',
    willChange:'transform',
    boxShadow:'0 0 30px rgba(212,175,55,0.25)',
  }}>
    <div style={{
      position:'absolute', inset:8, borderRadius:'50%',
      border:'1px solid rgba(212,175,55,0.2)'
    }} />
    <div style={{
      width:32, height:32, borderRadius:'50%',
      background:'#D4AF37', color:'#0A0005',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontWeight:'900', fontSize:12, zIndex:2,
    }}>0</div>
  </div>
))

// ─── Game Row — no animation on individual rows (too many framer instances) ─
const GameRow = memo(({ game, isActive, onClick }) => (
  <div
    onClick={onClick}
    className="casino-card p-4 cursor-pointer transition-all duration-200"
    style={{
      borderColor: isActive ? '#D4AF37' : undefined,
      boxShadow: isActive ? `0 0 18px ${game.color}28` : undefined,
      transform: isActive ? 'translateX(4px)' : undefined,
    }}
  >
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
        style={{ background:`${game.color}22`, border:`1px solid ${game.color}44` }}>
        {game.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className=" font-boldr font-bold text-white">{game.name}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-body font-light tracking-wider"
            style={{ background:`${game.color}22`, color:game.color, border:`1px solid ${game.color}44` }}>
            {game.tag}
          </span>
        </div>
        <div className="flex gap-4 mt-1 text-xs font-body font-light text-white/50">
          <span>RTP: <span className="text-green-400">{game.rtp}</span></span>
          <span>Min: <span className="text-gold/70">{game.minBet}</span></span>
        </div>
      </div>
      <div className="flex gap-1">
        {game.countries.slice(0, 3).map((f, j) => <span key={j} className="text-base">{f}</span>)}
      </div>
    </div>

    {/* Description — CSS transition instead of AnimatePresence */}
    <div style={{
      overflow:'hidden',
      maxHeight: isActive ? 80 : 0,
      opacity: isActive ? 1 : 0,
      transition:'max-height 0.3s ease, opacity 0.3s ease',
    }}>
      <p className="font-body font-light text-sm text-white/60 mt-3 pl-16 leading-relaxed">{game.desc}</p>
    </div>
  </div>
))

export default function GamesSection() {
  const [activeGame, setActiveGame] = useState(0)
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true })

  return (
    <section id="games" className="relative py-24 px-4 dice-pattern" ref={ref}>
      <div className="absolute inset-0 bg-gradient-to-b from-casino-dark via-casino-mid to-casino-dark pointer-events-none" />

      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity:0, y:24 }}
          animate={inView ? { opacity:1, y:0 } : {}}
          transition={{ duration:0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-block border border-gold/30 rounded-full px-5 py-1.5 text-xs font-body font-light tracking-widest uppercase text-gold/70 mb-4">
            🎮 Games We Offer
          </div>
          <h2 className=" font-bold text-4xl md:text-5xl font-black gold-text mb-4">
            WORLD-CLASS CASINO GAMES
          </h2>
          <p className="font-body font-light text-lg text-white/60 max-w-xl mx-auto">
            From high-stakes baccarat to spinning jackpot slots — every game is a new thrill.
          </p>
        </motion.div>

        {/* Roulette + Game List */}
        <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
          {/* Left: Roulette visual */}
          <motion.div
            initial={{ opacity:0, x:-30 }}
            animate={inView ? { opacity:1, x:0 } : {}}
            transition={{ duration:0.7, delay:0.15 }}
            className="flex flex-col items-center justify-center gap-6"
          >
            <RouletteWheel />
            <div className="flex gap-6">
              {['🎲','🎴','🃏','🎰'].map((em, i) => (
                <span key={i} className="text-3xl" style={{
                  display:'inline-block',
                  animation:`scrollBounce ${2 + i * 0.5}s ${i * 0.4}s ease-in-out infinite`,
                }}>{em}</span>
              ))}
            </div>
            <div className="text-center">
  <div style={{ fontSize: 'clamp(1rem,4vw,1.3rem)', fontWeight: 900, color: '#D4AF37', lineHeight: 1.2 }}>
    You Play. We Handle Everything.
  </div>
  <div className="font-body font-light" style={{ fontSize: 'clamp(0.72rem,2.8vw,0.85rem)', color: 'rgba(255,255,255,0.45)', marginTop: 6, lineHeight: 1.5 }}>
    Flights · Hotels · Transfers · Casino Entry — all arranged for you
  </div>
</div>
          </motion.div>

          {/* Right: Game list — no per-item motion, just fade container */}
          <motion.div
            initial={{ opacity:0, x:30 }}
            animate={inView ? { opacity:1, x:0 } : {}}
            transition={{ duration:0.7, delay:0.2 }}
            className="space-y-3"
          >
            {games.map((game, i) => (
              <GameRow
                key={game.id}
                game={game}
                isActive={activeGame === i}
                onClick={() => setActiveGame(i)}
              />
            ))}
          </motion.div>
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity:0, y:24 }}
          animate={inView ? { opacity:1, y:0 } : {}}
          transition={{ duration:0.6, delay:0.4 }}
          className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl mx-auto"
        >
          {[
            { icon:'🎮', val:'50+',    label:'Live Games'       },
            { icon:'🏆', val:'$3Mn+',label:'Monthly Jackpots' },
            { icon:'🎯', val:'99.5%',  label:'Best RTP Offered' },
          ].map((s, i) => (
            <div key={i} className="casino-card p-5 flex flex-col items-center justify-center text-center neon-border">
              <div className="text-3xl mb-2">{s.icon}</div>
              <div className=" font-bold text-2xl gold-text font-black">{s.val}</div>
              <div className="font-body font-light text-xs text-white/50 tracking-wider uppercase mt-1">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}