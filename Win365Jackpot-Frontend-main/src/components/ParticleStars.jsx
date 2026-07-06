import React, { useMemo } from 'react'

export default function ParticleStars() {
  const stars = useMemo(() => {
    return Array.from({ length: 80 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      dur: `${2 + Math.random() * 4}s`,
      delay: `${-Math.random() * 4}s`,
      size: Math.random() > 0.8 ? 3 : 2,
    }))
  }, [])

  return (
    <div className="stars">
      {stars.map(s => (
        <div
          key={s.id}
          className="star"
          style={{
            left: s.left,
            top: s.top,
            '--dur': s.dur,
            '--delay': s.delay,
            width: s.size,
            height: s.size,
          }}
        />
      ))}
    </div>
  )
}
