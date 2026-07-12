export default function CompassLogo({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ flexShrink: 0, display: 'block' }}>
      <path d="M36.57 10.48 A22 22 0 0 1 36.57 53.52" fill="none" stroke="#16A34A" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M27.43 53.52 A22 22 0 0 1 27.43 10.48" fill="none" stroke="#13294F" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M32 3 L28.6 9 L35.4 9 Z" fill="#13294F" />
      <path d="M61 32 L55 28.6 L55 35.4 Z" fill="#16A34A" />
      <path d="M32 61 L28.6 55 L35.4 55 Z" fill="#16A34A" />
      <path d="M3 32 L9 28.6 L9 35.4 Z" fill="#13294F" />
      <g transform="rotate(18 32 32)">
        <path d="M32 15 L26.5 32 L37.5 32 Z" fill="#16A34A" />
        <path d="M32 49 L26.5 32 L37.5 32 Z" fill="#13294F" />
      </g>
      <circle cx="32" cy="32" r="5.2" fill="#FFFFFF" />
      <circle cx="32" cy="32" r="3.2" fill="#16A34A" />
    </svg>
  );
}

export function CompassWordmark({ size = 19 }: { size?: number }) {
  return (
    <div style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', color: '#13294F' }}>
      Market<span style={{ color: '#16A34A' }}>Compass</span>
    </div>
  );
}
