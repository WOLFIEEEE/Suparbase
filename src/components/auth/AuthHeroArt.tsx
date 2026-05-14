import { cn } from "@/lib/ui/cn";

interface Props {
  className?: string;
}

/**
 * Decorative SVG for the auth pages' brand pane. Three stacked admin
 * cards: abstracting the actual product UI: with hairline strokes,
 * an accent-coloured highlight bar on the front card, and a floating
 * chat bubble + sparkle. All colours come from the theme so the art
 * tracks light/dark mode for free.
 *
 * A subtle float animation runs unless the user has prefers-reduced-
 * motion enabled.
 */
export function AuthHeroArt({ className }: Props) {
  return (
    <div className={cn("relative", className)} aria-hidden>
      <svg
        viewBox="0 0 360 260"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        className="h-auto w-full max-w-[420px]"
      >
        <defs>
          <linearGradient id="cardFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--bg-raised))" stopOpacity="1" />
            <stop offset="100%" stopColor="rgb(var(--bg-sunken))" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="cardFillFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--bg-raised))" stopOpacity="1" />
            <stop offset="100%" stopColor="rgb(var(--bg-raised))" stopOpacity="0.92" />
          </linearGradient>
          <linearGradient id="bubbleFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.18" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.06" />
          </linearGradient>
          <pattern id="dots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgb(var(--fg))" fillOpacity="0.05" />
          </pattern>
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="rgb(var(--fg))" floodOpacity="0.06" />
          </filter>
        </defs>

        {/* Dotted backdrop, fades from center outward */}
        <rect width="360" height="260" fill="url(#dots)" />

        {/* Connection lines under the cards: hint at "data flowing" */}
        <g stroke="rgb(var(--line))" strokeWidth="1" strokeLinecap="round">
          <path d="M30 220 L 100 220 L 110 210" />
          <path d="M340 40 L 270 40 L 260 50" />
        </g>

        {/* Back card */}
        <g className="auth-art-card auth-art-card-back" filter="url(#softShadow)">
          <rect
            x="56"
            y="40"
            width="220"
            height="92"
            rx="10"
            fill="url(#cardFill)"
            stroke="rgb(var(--line))"
            strokeWidth="1"
          />
          {/* avatar dot */}
          <circle cx="76" cy="62" r="7" fill="rgb(var(--bg-sunken))" stroke="rgb(var(--line))" strokeWidth="1" />
          {/* header */}
          <rect x="90" y="58" width="80" height="6" rx="3" fill="rgb(var(--fg))" fillOpacity="0.16" />
          <rect x="90" y="68" width="46" height="4" rx="2" fill="rgb(var(--fg))" fillOpacity="0.08" />
          {/* row separators */}
          <line x1="64" y1="90" x2="268" y2="90" stroke="rgb(var(--line))" strokeWidth="0.5" />
          <line x1="64" y1="106" x2="268" y2="106" stroke="rgb(var(--line))" strokeWidth="0.5" />
          {/* mini bars */}
          <rect x="64" y="98" width="58" height="2.5" rx="1.25" fill="rgb(var(--fg))" fillOpacity="0.1" />
          <rect x="140" y="98" width="36" height="2.5" rx="1.25" fill="rgb(var(--fg))" fillOpacity="0.08" />
          <rect x="64" y="114" width="80" height="2.5" rx="1.25" fill="rgb(var(--fg))" fillOpacity="0.1" />
        </g>

        {/* Middle card */}
        <g className="auth-art-card auth-art-card-mid" filter="url(#softShadow)">
          <rect
            x="40"
            y="80"
            width="240"
            height="100"
            rx="10"
            fill="url(#cardFill)"
            stroke="rgb(var(--line))"
            strokeWidth="1"
          />
          <circle cx="60" cy="104" r="8" fill="rgb(var(--bg-sunken))" stroke="rgb(var(--line))" strokeWidth="1" />
          <rect x="76" y="100" width="96" height="6" rx="3" fill="rgb(var(--fg))" fillOpacity="0.24" />
          <rect x="76" y="110" width="58" height="4" rx="2" fill="rgb(var(--fg))" fillOpacity="0.12" />
          <line x1="48" y1="134" x2="272" y2="134" stroke="rgb(var(--line))" strokeWidth="0.5" />
          <line x1="48" y1="152" x2="272" y2="152" stroke="rgb(var(--line))" strokeWidth="0.5" />
          <rect x="48" y="142" width="74" height="3" rx="1.5" fill="rgb(var(--fg))" fillOpacity="0.16" />
          <rect x="140" y="142" width="48" height="3" rx="1.5" fill="rgb(var(--fg))" fillOpacity="0.1" />
          <rect x="48" y="160" width="92" height="3" rx="1.5" fill="rgb(var(--fg))" fillOpacity="0.16" />
          {/* status pill */}
          <rect x="220" y="100" width="40" height="10" rx="5" fill="rgb(var(--accent))" fillOpacity="0.18" />
          <circle cx="227" cy="105" r="2" fill="rgb(var(--accent))" />
        </g>

        {/* Front card: fully opaque, accent edge */}
        <g className="auth-art-card auth-art-card-front" filter="url(#softShadow)">
          <rect
            x="24"
            y="124"
            width="260"
            height="112"
            rx="12"
            fill="url(#cardFillFront)"
            stroke="rgb(var(--line-strong))"
            strokeWidth="1"
          />
          {/* accent edge */}
          <rect x="24" y="124" width="3" height="112" rx="1.5" fill="rgb(var(--accent))" />

          {/* avatar */}
          <circle cx="46" cy="150" r="9" fill="rgb(var(--accent))" fillOpacity="0.16" stroke="rgb(var(--accent))" strokeOpacity="0.45" strokeWidth="1" />
          {/* avatar initial */}
          <text
            x="46"
            y="153.5"
            textAnchor="middle"
            fontSize="9"
            fontWeight="600"
            fontFamily="var(--font-display, ui-sans-serif)"
            fill="rgb(var(--accent))"
          >
            A
          </text>

          {/* name + subtitle */}
          <rect x="64" y="146" width="100" height="7" rx="3.5" fill="rgb(var(--fg))" fillOpacity="0.5" />
          <rect x="64" y="158" width="64" height="5" rx="2.5" fill="rgb(var(--fg))" fillOpacity="0.2" />

          {/* status pill */}
          <rect x="226" y="146" width="46" height="12" rx="6" fill="rgb(var(--accent))" fillOpacity="0.2" stroke="rgb(var(--accent))" strokeOpacity="0.4" strokeWidth="0.5" />
          <circle cx="234" cy="152" r="2" fill="rgb(var(--accent))" />
          <rect x="240" y="150" width="24" height="4" rx="2" fill="rgb(var(--accent))" fillOpacity="0.85" />

          {/* row separator */}
          <line x1="36" y1="180" x2="272" y2="180" stroke="rgb(var(--line))" strokeWidth="0.5" />
          <line x1="36" y1="202" x2="272" y2="202" stroke="rgb(var(--line))" strokeWidth="0.5" />

          {/* data rows */}
          <g fontFamily="ui-monospace, monospace" fontSize="6.5" fill="rgb(var(--fg))" fillOpacity="0.5">
            <text x="36" y="194">email</text>
            <text x="36" y="216">last_seen</text>
          </g>
          <rect x="84" y="189" width="90" height="3" rx="1.5" fill="rgb(var(--fg))" fillOpacity="0.4" />
          <rect x="84" y="211" width="60" height="3" rx="1.5" fill="rgb(var(--fg))" fillOpacity="0.3" />
          <rect x="200" y="211" width="36" height="3" rx="1.5" fill="rgb(var(--fg))" fillOpacity="0.2" />
        </g>

        {/* Floating chat bubble: Ask AI */}
        <g className="auth-art-bubble">
          <rect
            x="244"
            y="14"
            width="92"
            height="36"
            rx="18"
            fill="url(#bubbleFill)"
            stroke="rgb(var(--accent))"
            strokeOpacity="0.5"
            strokeWidth="1"
          />
          {/* sparkle */}
          <path
            d="M258 32 l3 -3 l3 3 l-3 3 z"
            fill="rgb(var(--accent))"
            opacity="0.85"
          />
          <text
            x="270"
            y="36"
            fontSize="10"
            fontWeight="500"
            fontFamily="var(--font-display, ui-sans-serif)"
            fill="rgb(var(--accent))"
          >
            Ask AI
          </text>
        </g>

        {/* Plus dots near the back card */}
        <g className="auth-art-dots" fill="rgb(var(--accent))" opacity="0.6">
          <circle cx="304" cy="92" r="2" />
          <circle cx="316" cy="100" r="1.5" />
          <circle cx="298" cy="106" r="1.5" />
        </g>
      </svg>

      {/* Inline keyframes so we don't need a global rule. */}
      <style>{`
        @keyframes auth-float-1 { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @keyframes auth-float-2 { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
        @keyframes auth-float-3 { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
        @keyframes auth-bubble-pulse { 0%,100% { transform: translateY(0); opacity: 1 } 50% { transform: translateY(-3px); opacity: 0.85 } }
        @keyframes auth-dots-pulse { 0%,100% { opacity: 0.6 } 50% { opacity: 0.95 } }
        .auth-art-card-back   { animation: auth-float-1 7s ease-in-out infinite; transform-origin: center; }
        .auth-art-card-mid    { animation: auth-float-2 6s ease-in-out infinite; transform-origin: center; }
        .auth-art-card-front  { animation: auth-float-3 5s ease-in-out infinite; transform-origin: center; }
        .auth-art-bubble      { animation: auth-bubble-pulse 4s ease-in-out infinite; transform-origin: center; }
        .auth-art-dots        { animation: auth-dots-pulse 3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .auth-art-card-back, .auth-art-card-mid, .auth-art-card-front,
          .auth-art-bubble, .auth-art-dots { animation: none; }
        }
      `}</style>
    </div>
  );
}
