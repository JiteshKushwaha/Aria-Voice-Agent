import type { Phase } from "@/hooks/useVoiceAgent";

/**
 * Flat, faceless illustration of the support specialist at her desk, in the
 * editorial vector style of the references. Animation is pure CSS keyed off
 * the phase class: head sway and sound arcs while speaking, a thought bubble
 * while thinking, a soft glow on the headset mic while listening.
 */
export function AgentPortrait({ phase }: { phase: Phase }) {
  return (
    <svg className={`portrait is-${phase}`} viewBox="0 0 360 280" role="img" aria-label="Aria, Aura client care">
      <circle cx="186" cy="146" r="122" fill="#EEE5D8" />
      <rect x="58" y="60" width="64" height="44" rx="6" fill="#F7F2EA" stroke="#D9CDBD" />
      <line x1="68" y1="74" x2="104" y2="74" stroke="#CBBBA6" strokeWidth="3" strokeLinecap="round" />
      <line x1="68" y1="84" x2="96" y2="84" stroke="#CBBBA6" strokeWidth="3" strokeLinecap="round" />

      {/* plant */}
      <rect x="282" y="186" width="26" height="30" rx="4" fill="#C9B79F" />
      <ellipse cx="288" cy="170" rx="7" ry="20" fill="#5E8A78" transform="rotate(-18 288 170)" />
      <ellipse cx="300" cy="166" rx="7" ry="22" fill="#4C7766" transform="rotate(14 300 166)" />

      {/* chair */}
      <rect x="206" y="128" width="64" height="92" rx="20" fill="#3B3430" />

      {/* torso */}
      <path d="M150 220 C150 176 164 152 192 152 C222 152 238 176 238 220 Z" fill="#B9694A" />
      <rect x="185" y="128" width="14" height="28" rx="6" fill="#DDA683" />

      {/* head */}
      <g className="p-head">
        <ellipse cx="192" cy="110" rx="24" ry="28" fill="#E2B08C" />
        <path d="M168 108 C166 80 186 70 202 74 C220 78 222 98 216 118 C214 100 206 92 192 92 C180 92 172 98 168 108 Z" fill="#2A211C" />
        <path d="M214 96 C226 104 226 128 214 140 C218 124 218 110 214 96 Z" fill="#2A211C" />
        <circle cx="216" cy="82" r="12" fill="#2A211C" />
        <path d="M168 104 C168 76 214 72 218 102" fill="none" stroke="#1E1916" strokeWidth="4" strokeLinecap="round" />
        <rect x="161" y="102" width="10" height="16" rx="5" fill="#1E1916" />
        <path d="M166 118 C168 128 172 134 180 136" fill="none" stroke="#1E1916" strokeWidth="3" strokeLinecap="round" />
        <circle className="p-mic" cx="181" cy="136" r="3.5" fill="#C8473B" />
        <circle className="p-listen" cx="181" cy="136" r="9" fill="none" stroke="#3E7C6B" strokeWidth="2" />
      </g>

      {/* sound arcs */}
      <g className="p-waves" fill="none" stroke="#6B4A6E" strokeWidth="2.5" strokeLinecap="round">
        <path d="M166 128 Q160 136 166 144" />
        <path d="M158 122 Q148 136 158 150" />
        <path d="M150 116 Q136 136 150 156" />
      </g>

      {/* thought bubble */}
      <g className="p-bubble">
        <rect x="230" y="40" width="58" height="30" rx="15" fill="#FFFFFF" stroke="#D9CDBD" />
        <circle cx="236" cy="78" r="4" fill="#FFFFFF" stroke="#D9CDBD" />
        <circle className="d1" cx="246" cy="55" r="3.5" fill="#B7853A" />
        <circle className="d2" cx="259" cy="55" r="3.5" fill="#B7853A" />
        <circle className="d3" cx="272" cy="55" r="3.5" fill="#B7853A" />
      </g>

      {/* laptop + arm */}
      <polygon points="96,212 84,154 144,154 158,212" fill="#CFC3B4" />
      <circle cx="120" cy="182" r="5" fill="#F7F2EA" />
      <rect x="92" y="210" width="98" height="7" rx="3" fill="#A99A88" />
      <path d="M176 166 C164 182 158 196 150 206" fill="none" stroke="#B9694A" strokeWidth="15" strokeLinecap="round" />
      <circle cx="150" cy="207" r="6" fill="#E2B08C" />
      {/* desk */}
      <rect x="40" y="217" width="284" height="8" rx="4" fill="#2B2622" />
      <rect x="62" y="225" width="6" height="40" fill="#2B2622" />
      <rect x="296" y="225" width="6" height="40" fill="#2B2622" />
    </svg>
  );
}