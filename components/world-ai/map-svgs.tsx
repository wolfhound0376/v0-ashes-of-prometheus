"use client"

import type { MapHotspot } from "@/lib/world-ai/campaigns"

interface MapSvgProps {
  hotspots: MapHotspot[]
  onHotspotHover: (hotspot: MapHotspot | null) => void
  className?: string
}

function Hotspot({ hotspot, onHover }: { hotspot: MapHotspot; onHover: (h: MapHotspot | null) => void }) {
  return (
    <g
      className="cursor-pointer group"
      onMouseEnter={() => onHover(hotspot)}
      onMouseLeave={() => onHover(null)}
    >
      <circle
        cx={hotspot.x}
        cy={hotspot.y}
        r={8}
        fill="#e0651a"
        className="transition-all duration-200 group-hover:fill-[#ffd97a] group-hover:r-[10] group-hover:drop-shadow-[0_0_8px_#ffd97a]"
      />
    </g>
  )
}

export function GreenestMap({ hotspots, onHotspotHover, className }: MapSvgProps) {
  return (
    <svg viewBox="0 0 700 500" className={className}>
      <defs>
        <radialGradient id="parch" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#3a3024"/>
          <stop offset="100%" stopColor="#1f1812"/>
        </radialGradient>
        <radialGradient id="firegrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff8530" stopOpacity="0.7"/>
          <stop offset="100%" stopColor="#e0651a" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="700" height="500" fill="url(#parch)"/>
      {/* River */}
      <path d="M 580 0 Q 540 150 555 280 Q 570 400 540 500" stroke="#3a5060" strokeWidth="22" fill="none" opacity="0.7"/>
      {/* Road */}
      <path d="M 0 230 L 250 230 L 360 290 L 480 350 L 540 380" stroke="#5a4a30" strokeWidth="6" fill="none" strokeDasharray="2 4" opacity="0.6"/>
      {/* The Keep */}
      <rect x="80" y="60" width="120" height="100" fill="#2a2520" stroke="#6a5a40" strokeWidth="2" rx="3"/>
      <text x="140" y="50" textAnchor="middle" fontFamily="serif" fontSize="11" fill="#d4b15a" letterSpacing="2">THE KEEP</text>
      {/* Mill */}
      <circle cx="510" cy="200" r="22" fill="url(#firegrad)"/>
      <polygon points="510,180 525,200 510,220 495,200" fill="#5a4030" stroke="#8a7050" strokeWidth="1.5"/>
      <text x="510" y="170" textAnchor="middle" fontFamily="serif" fontSize="10" fill="#e0651a">MILL</text>
      {/* Market Square */}
      <circle cx="360" cy="290" r="35" fill="url(#firegrad)" opacity="0.5"/>
      <rect x="340" y="270" width="40" height="40" fill="#3a3024" stroke="#6a5a40" strokeWidth="1.5"/>
      <text x="360" y="262" textAnchor="middle" fontFamily="serif" fontSize="10" fill="#d4b15a">MARKET</text>
      {/* Sanctuary */}
      <circle cx="280" cy="430" r="20" fill="url(#firegrad)" opacity="0.4"/>
      <polygon points="280,410 300,440 260,440" fill="#3a3024" stroke="#6a5a40" strokeWidth="1.5"/>
      <text x="280" y="478" textAnchor="middle" fontFamily="serif" fontSize="9" fill="#d4b15a">SANCTUARY</text>
      {/* Title */}
      <text x="350" y="30" textAnchor="middle" fontFamily="serif" fontSize="20" fill="#d4b15a" letterSpacing="6">GREENEST</text>
      {/* Hotspots */}
      <g className="hotspots-layer">
        {hotspots.map((hs, i) => (
          <Hotspot key={i} hotspot={hs} onHover={onHotspotHover} />
        ))}
      </g>
    </svg>
  )
}

export function RegionMap({ hotspots, onHotspotHover, className }: MapSvgProps) {
  return (
    <svg viewBox="0 0 700 500" className={className}>
      <defs>
        <radialGradient id="parch2" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#3a3024"/>
          <stop offset="100%" stopColor="#1f1812"/>
        </radialGradient>
      </defs>
      <rect width="700" height="500" fill="url(#parch2)"/>
      {/* Sea */}
      <path d="M 0 0 L 0 500 L 80 500 Q 100 400 80 300 Q 60 200 100 100 Q 80 50 0 0 Z" fill="#1a2a3a" opacity="0.7"/>
      <text x="40" y="260" fontFamily="serif" fontSize="12" fill="#5a7a8a" transform="rotate(-90 40 260)" letterSpacing="3">SEA OF SWORDS</text>
      {/* Baldur's Gate */}
      <rect x="120" y="120" width="20" height="20" fill="#3a3024" stroke="#d4b15a" strokeWidth="1.5"/>
      <text x="155" y="125" fontFamily="serif" fontSize="12" fill="#d4b15a">Baldur&apos;s Gate</text>
      {/* Elturel */}
      <rect x="220" y="190" width="18" height="18" fill="#3a3024" stroke="#d4b15a" strokeWidth="1.5"/>
      <text x="245" y="195" fontFamily="serif" fontSize="11" fill="#d4b15a">Elturel</text>
      {/* Greenest */}
      <rect x="370" y="290" width="18" height="18" fill="#3a2018" stroke="#e0651a" strokeWidth="2"/>
      <circle cx="379" cy="299" r="20" fill="#e0651a" opacity="0.25"/>
      <text x="396" y="296" fontFamily="serif" fontSize="11" fill="#e0651a" fontWeight="700">Greenest</text>
      {/* Cult Camp */}
      <polygon points="265,400 285,420 245,420" fill="#3a2018" stroke="#aa3030" strokeWidth="1.5"/>
      <text x="220" y="440" fontFamily="serif" fontSize="10" fill="#aa3030">Cult Camp</text>
      {/* Title */}
      <text x="350" y="40" textAnchor="middle" fontFamily="serif" fontSize="20" fill="#d4b15a" letterSpacing="6">SWORD COAST</text>
      {/* Hotspots */}
      <g className="hotspots-layer">
        {hotspots.map((hs, i) => (
          <Hotspot key={i} hotspot={hs} onHover={onHotspotHover} />
        ))}
      </g>
    </svg>
  )
}

export function KeepMap({ hotspots, onHotspotHover, className }: MapSvgProps) {
  return (
    <svg viewBox="0 0 600 500" className={className}>
      <defs>
        <pattern id="stone" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#2a2520"/>
          <path d="M 0 12 L 24 12 M 12 0 L 12 24" stroke="#3a3024" strokeWidth="0.5"/>
        </pattern>
      </defs>
      <rect width="600" height="500" fill="#1f1812"/>
      <rect x="80" y="60" width="440" height="380" fill="url(#stone)" stroke="#6a5a40" strokeWidth="3" rx="8"/>
      {/* Courtyard */}
      <rect x="320" y="200" width="160" height="120" fill="#3a3024" stroke="#6a5a40" strokeWidth="2"/>
      <text x="400" y="265" textAnchor="middle" fontFamily="serif" fontSize="11" fill="#d4b15a">COURTYARD</text>
      {/* Governor's Hall */}
      <rect x="120" y="180" width="160" height="120" fill="#3a3024" stroke="#d4b15a" strokeWidth="2"/>
      <text x="200" y="225" textAnchor="middle" fontFamily="serif" fontSize="11" fill="#d4b15a">GOVERNOR&apos;S</text>
      <text x="200" y="240" textAnchor="middle" fontFamily="serif" fontSize="11" fill="#d4b15a">HALL</text>
      {/* Battlements */}
      <text x="300" y="100" textAnchor="middle" fontFamily="serif" fontSize="10" fill="#8a8070" letterSpacing="3">BATTLEMENTS</text>
      {/* Cellar */}
      <rect x="220" y="370" width="160" height="60" fill="#15130f" stroke="#6a5a40" strokeWidth="2" strokeDasharray="3 3"/>
      <text x="300" y="400" textAnchor="middle" fontFamily="serif" fontSize="11" fill="#d4b15a">CELLAR</text>
      {/* Title */}
      <text x="300" y="35" textAnchor="middle" fontFamily="serif" fontSize="18" fill="#d4b15a" letterSpacing="5">THE KEEP</text>
      {/* Hotspots */}
      <g className="hotspots-layer">
        {hotspots.map((hs, i) => (
          <Hotspot key={i} hotspot={hs} onHover={onHotspotHover} />
        ))}
      </g>
    </svg>
  )
}

export function PraxisMap({ hotspots, onHotspotHover, className }: MapSvgProps) {
  // Generate random stars
  const stars = Array.from({ length: 50 }, (_, i) => ({
    x: Math.random() * 600,
    y: Math.random() * 500,
    r: Math.random() * 1.2 + 0.3,
    opacity: Math.random() * 0.7 + 0.2
  }))

  return (
    <svg viewBox="0 0 600 500" className={className}>
      <defs>
        <linearGradient id="hull" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2a3038"/>
          <stop offset="100%" stopColor="#15181c"/>
        </linearGradient>
      </defs>
      <rect width="600" height="500" fill="#000"/>
      {/* Stars */}
      {stars.map((star, i) => (
        <circle key={i} cx={star.x} cy={star.y} r={star.r} fill="#fff" opacity={star.opacity}/>
      ))}
      {/* Docking Spine */}
      <rect x="60" y="200" width="80" height="40" fill="url(#hull)" stroke="#5acdd4" strokeWidth="1.5"/>
      <text x="100" y="190" textAnchor="middle" fontFamily="serif" fontSize="9" fill="#5acdd4">DOCK</text>
      <rect x="140" y="210" width="40" height="20" fill="url(#hull)" stroke="#3a5060" strokeWidth="1"/>
      {/* Command Deck */}
      <ellipse cx="200" cy="180" rx="40" ry="30" fill="url(#hull)" stroke="#5acdd4" strokeWidth="1.5"/>
      <text x="200" y="155" textAnchor="middle" fontFamily="serif" fontSize="9" fill="#5acdd4">COMMAND</text>
      {/* Habitation Ring */}
      <rect x="270" y="180" width="100" height="80" fill="url(#hull)" stroke="#5acdd4" strokeWidth="1.5" rx="4"/>
      <text x="320" y="170" textAnchor="middle" fontFamily="serif" fontSize="9" fill="#5acdd4">HABITATION</text>
      {/* Hydroponics */}
      <rect x="400" y="240" width="80" height="80" fill="url(#hull)" stroke="#5acdd4" strokeWidth="1.5"/>
      <text x="440" y="230" textAnchor="middle" fontFamily="serif" fontSize="9" fill="#5acdd4">HYDRO</text>
      {/* Cryo Bay */}
      <rect x="290" y="330" width="120" height="60" fill="url(#hull)" stroke="#5acdd4" strokeWidth="1.5"/>
      <text x="350" y="325" textAnchor="middle" fontFamily="serif" fontSize="9" fill="#5acdd4">CRYO BAY · 240</text>
      {/* Engineering */}
      <rect x="170" y="350" width="100" height="60" fill="url(#hull)" stroke="#5acdd4" strokeWidth="1.5"/>
      <text x="220" y="345" textAnchor="middle" fontFamily="serif" fontSize="9" fill="#5acdd4">ENGINEERING</text>
      {/* Cargo Hold 7 */}
      <rect x="460" y="370" width="100" height="60" fill="#1a0a0a" stroke="#aa3030" strokeWidth="2" strokeDasharray="4 2"/>
      <text x="510" y="365" textAnchor="middle" fontFamily="serif" fontSize="9" fill="#aa3030">CARGO 7</text>
      <text x="510" y="405" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="#aa3030">SEALED</text>
      {/* Title */}
      <text x="300" y="40" textAnchor="middle" fontFamily="serif" fontSize="16" fill="#5acdd4" letterSpacing="6">PRAXIS-9</text>
      {/* Hotspots */}
      <g className="hotspots-layer">
        {hotspots.map((hs, i) => (
          <Hotspot key={i} hotspot={hs} onHover={onHotspotHover} />
        ))}
      </g>
    </svg>
  )
}
