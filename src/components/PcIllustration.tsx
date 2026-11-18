/** Decorative illustration (not a photo of real stock): a PC tower with copper traces that draw in once. */
export function PcIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 440" className={className} role="img" aria-label="Illustration of a gaming PC tower with a glass side panel" fill="none">
      <rect x="64" y="20" width="232" height="400" rx="16" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <rect x="80" y="36" width="200" height="368" rx="8" fill="var(--bg)" stroke="var(--line-soft)" strokeWidth="1.5" />
      {/* CPU cooler */}
      <circle cx="170" cy="104" r="40" fill="var(--raised)" stroke="var(--copper)" strokeWidth="2" />
      <circle cx="170" cy="104" r="26" stroke="var(--line)" strokeWidth="1.5" />
      <circle cx="170" cy="104" r="6" fill="var(--copper)" />
      <path d="M170 78v12M170 118v12M144 104h12M184 104h12" stroke="var(--line)" strokeWidth="1.5" />
      {/* RAM */}
      {[236, 246, 256, 266].map((x) => (
        <rect key={x} x={x} y="62" width="6" height="86" rx="1.5" fill="var(--raised)" stroke="var(--copper)" strokeWidth="1" />
      ))}
      {/* GPU */}
      <rect x="96" y="214" width="168" height="56" rx="6" fill="var(--raised)" stroke="var(--line)" strokeWidth="2" />
      <circle cx="142" cy="242" r="20" stroke="var(--copper)" strokeWidth="1.8" />
      <circle cx="142" cy="242" r="4" fill="var(--copper)" />
      <circle cx="218" cy="242" r="20" stroke="var(--copper)" strokeWidth="1.8" />
      <circle cx="218" cy="242" r="4" fill="var(--copper)" />
      {/* PSU shroud */}
      <rect x="96" y="340" width="168" height="52" rx="4" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <path d="M108 358h60M108 370h40" stroke="var(--line)" strokeWidth="2" strokeLinecap="round" />
      {/* Copper traces */}
      <g className="trace-draw" stroke="var(--copper)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
        <path d="M130 130 L130 190 L96 190 L96 214" />
        <path d="M210 124 L232 124 L232 196 L264 196 L264 214" />
        <path d="M186 140 L186 176 L150 176 L150 214" />
        <path d="M240 150 L240 170 L220 170 L220 214" />
        <path d="M180 270 L180 340" />
        <path d="M96 296 L96 340" />
        <path d="M264 296 L264 340" />
      </g>
      <g fill="var(--copper)">
        <circle cx="96" cy="214" r="3" />
        <circle cx="264" cy="214" r="3" />
        <circle cx="150" cy="214" r="3" />
        <circle cx="220" cy="214" r="3" />
        <circle cx="180" cy="340" r="3" />
      </g>
      <path d="M96 420v6M264 420v6" stroke="var(--line)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
