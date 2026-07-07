/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
  heading: ['Space Grotesk', 'sans-serif'],
  body: ['Space Grotesk', 'sans-serif'],
  sans: ['Space Grotesk', 'sans-serif'],
},
      colors: {
        gold: { DEFAULT:'#D4AF37', light:'#F5D060', dark:'#9A7D20' },
        casino: { dark:'#0A0005', mid:'#150010', card:'#1A0015', border:'#3D1A30' },
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'spin-slow': 'spin 8s linear infinite',
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
        'card-flip': 'cardFlip 0.6s ease-in-out',
        'slide-up': 'slideUp 0.8s ease-out',
        'bounce-slow': 'bounce 3s infinite',
      },
      keyframes: {
        float: { '0%,100%': {transform:'translateY(0)'}, '50%': {transform:'translateY(-15px)'} },
        glow: { from: {textShadow:'0 0 10px #D4AF37,0 0 20px #D4AF37'}, to: {textShadow:'0 0 20px #F5D060,0 0 40px #F5D060,0 0 60px #D4AF37'} },
        pulseGold: { '0%,100%': {boxShadow:'0 0 10px #D4AF37'}, '50%': {boxShadow:'0 0 30px #F5D060,0 0 50px #D4AF37'} },
        shimmer: { '0%': {backgroundPosition:'-200% center'}, '100%': {backgroundPosition:'200% center'} },
        cardFlip: { '0%': {transform:'rotateY(0)'}, '100%': {transform:'rotateY(360deg)'} },
        slideUp: { from: {opacity:'0',transform:'translateY(40px)'}, to: {opacity:'1',transform:'translateY(0)'} },
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #9A7D20, #D4AF37, #F5D060, #D4AF37, #9A7D20)',
        'casino-radial': 'radial-gradient(ellipse at center, #250020 0%, #0A0005 70%)',
        'card-shine': 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%)',
      },
    },
  },
  plugins: [],
}
