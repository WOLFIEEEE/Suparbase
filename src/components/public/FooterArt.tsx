import { cn } from "@/lib/ui/cn";

/**
 * Panoramic SVG that sits above the footer manifesto. Five abstracted
 * admin "card chips" spread across the width, connected by flowing
 * dashed lines that animate from left to right, suggesting data moving
 * through Suparbase. Edges fade via a linear-gradient mask so the
 * composition feels embedded in the page rather than framed.
 *
 * Colour comes from CSS variables so the art tracks light/dark mode.
 */
export function FooterArt({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("relative h-32 w-full sm:h-36 md:h-44", className)}
      style={{
        maskImage:
          "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
      }}
    >
      <svg
        viewBox="0 0 1200 180"
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
        fill="none"
      >
        <defs>
          <linearGradient id="footerCardFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--bg-raised))" stopOpacity="1" />
            <stop offset="100%" stopColor="rgb(var(--bg-sunken))" stopOpacity="1" />
          </linearGradient>
          <pattern id="footerDots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="rgb(var(--fg))" fillOpacity="0.05" />
          </pattern>
          <filter id="footerCardShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="rgb(var(--fg))" floodOpacity="0.06" />
          </filter>
        </defs>

        <rect width="1200" height="180" fill="url(#footerDots)" />

        {/* Flow lines connecting the cards. Dashed strokes that animate
            left-to-right to suggest data movement. */}
        <g stroke="rgb(var(--accent))" strokeOpacity="0.4" strokeWidth="1.25" strokeLinecap="round">
          <path
            d="M 100 110 C 180 80, 220 90, 280 100"
            strokeDasharray="6 8"
            className="footer-flow-1"
          />
          <path
            d="M 380 100 C 440 60, 480 70, 540 90"
            strokeDasharray="6 8"
            className="footer-flow-2"
          />
          <path
            d="M 640 90 C 700 60, 740 80, 800 110"
            strokeDasharray="6 8"
            className="footer-flow-3"
          />
          <path
            d="M 900 110 C 960 80, 1000 90, 1060 100"
            strokeDasharray="6 8"
            className="footer-flow-4"
          />
        </g>

        {/* Five card chips */}
        <Chip x={28} y={48} accent />
        <Chip x={296} y={56} />
        <Chip x={552} y={48} accent />
        <Chip x={808} y={56} />
        <Chip x={1068} y={48} accent />

        {/* Floating accent dots between chips. Pulse animated. */}
        <g fill="rgb(var(--accent))" fillOpacity="0.7">
          <circle cx="200" cy="100" r="2.5" className="footer-dot footer-dot-a" />
          <circle cx="460" cy="80" r="2" className="footer-dot footer-dot-b" />
          <circle cx="720" cy="80" r="2.5" className="footer-dot footer-dot-c" />
          <circle cx="980" cy="100" r="2" className="footer-dot footer-dot-d" />
        </g>

        {/* Marginal: a couple of very faint "schema" lines top and bottom */}
        <g stroke="rgb(var(--line))" strokeWidth="0.5">
          <line x1="0" y1="20" x2="1200" y2="20" strokeDasharray="2 6" />
          <line x1="0" y1="160" x2="1200" y2="160" strokeDasharray="2 6" />
        </g>
      </svg>

      <style>{`
        @keyframes footer-flow {
          to { stroke-dashoffset: -28; }
        }
        @keyframes footer-pulse {
          0%, 100% { transform: translateY(0); opacity: 0.7; }
          50%      { transform: translateY(-2px); opacity: 1; }
        }
        .footer-flow-1 { animation: footer-flow 2.6s linear infinite; }
        .footer-flow-2 { animation: footer-flow 3.2s linear infinite; }
        .footer-flow-3 { animation: footer-flow 2.9s linear infinite; }
        .footer-flow-4 { animation: footer-flow 3.4s linear infinite; }
        .footer-dot { transform-box: fill-box; transform-origin: center; }
        .footer-dot-a { animation: footer-pulse 3.1s ease-in-out infinite; }
        .footer-dot-b { animation: footer-pulse 2.6s ease-in-out infinite; }
        .footer-dot-c { animation: footer-pulse 3.4s ease-in-out infinite; }
        .footer-dot-d { animation: footer-pulse 2.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .footer-flow-1, .footer-flow-2, .footer-flow-3, .footer-flow-4,
          .footer-dot, .footer-dot-a, .footer-dot-b, .footer-dot-c, .footer-dot-d {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

interface ChipProps {
  x: number;
  y: number;
  accent?: boolean;
}

function Chip({ x, y, accent }: ChipProps) {
  return (
    <g transform={`translate(${x}, ${y})`} filter="url(#footerCardShadow)">
      <rect
        width="76"
        height="56"
        rx="8"
        fill="url(#footerCardFill)"
        stroke={accent ? "rgb(var(--line-strong))" : "rgb(var(--line))"}
        strokeWidth="1"
      />
      {/* Accent edge on featured chips */}
      {accent && <rect x="0" y="0" width="2.5" height="56" rx="1.25" fill="rgb(var(--accent))" />}
      {/* Avatar dot */}
      <circle cx="14" cy="14" r="4" fill={accent ? "rgb(var(--accent))" : "rgb(var(--bg-sunken))"} fillOpacity={accent ? "0.35" : "1"} stroke="rgb(var(--line))" strokeWidth="0.75" />
      {/* Header line */}
      <rect x="24" y="11" width="36" height="3.5" rx="1.75" fill="rgb(var(--fg))" fillOpacity="0.22" />
      <rect x="24" y="18" width="20" height="2.5" rx="1.25" fill="rgb(var(--fg))" fillOpacity="0.12" />
      {/* Two short data rows */}
      <line x1="8" y1="28" x2="68" y2="28" stroke="rgb(var(--line))" strokeWidth="0.5" />
      <rect x="8" y="32" width="28" height="2" rx="1" fill="rgb(var(--fg))" fillOpacity="0.16" />
      <rect x="8" y="40" width="40" height="2" rx="1" fill="rgb(var(--fg))" fillOpacity="0.12" />
      {/* Status pill */}
      {accent && (
        <>
          <rect x="50" y="38" width="20" height="6" rx="3" fill="rgb(var(--accent))" fillOpacity="0.2" />
          <circle cx="55" cy="41" r="1.2" fill="rgb(var(--accent))" />
        </>
      )}
    </g>
  );
}
