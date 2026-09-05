export default function App() {
  return (
    <div className="size-full flex items-center justify-center" style={{ background: "#f7f4ea" }}>
      <svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="180" y2="180" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0f4039" />
            <stop offset="100%" stopColor="#123b35" />
          </linearGradient>
        </defs>

        {/* Tile */}
        <rect width="180" height="180" rx="40" fill="url(#bg)" />

        {/* Cream glow — top left warmth */}
        <circle cx="20" cy="20" r="60" fill="#f7f4ea" fillOpacity="0.07" />

        {/* Clipboard body — cream fill */}
        <rect x="44" y="60" width="92" height="98" rx="10" fill="#f7f4ea" fillOpacity="0.15" stroke="#f7f4ea" strokeWidth="4.5" strokeOpacity="0.65" />

        {/* Clip — solid cream */}
        <rect x="71" y="48" width="38" height="20" rx="9" fill="#f7f4ea" fillOpacity="0.95" />
        <rect x="82" y="43" width="16" height="11" rx="5.5" fill="#f7f4ea" fillOpacity="0.55" />

        {/* Task lines — cream */}
        <line x1="60" y1="91" x2="120" y2="91" stroke="#f7f4ea" strokeWidth="3.5" strokeLinecap="round" strokeOpacity="0.35" />
        <line x1="60" y1="107" x2="104" y2="107" stroke="#f7f4ea" strokeWidth="3.5" strokeLinecap="round" strokeOpacity="0.22" />

        {/* Coral checkmark */}
        <polyline
          points="59,124 76,143 121,101"
          stroke="#ff725c"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
