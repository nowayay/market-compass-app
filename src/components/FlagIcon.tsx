import type { CSSProperties } from "react";

// Country `id`s are ISO 3166-1 alpha-2 except 'uk', which flagcdn expects as 'gb'.
const ISO2_OVERRIDES: Record<string, string> = { uk: 'gb' };

export default function FlagIcon({
  countryId,
  size = 16,
  style,
}: {
  countryId: string;
  size?: number;
  style?: CSSProperties;
}) {
  const code = ISO2_OVERRIDES[countryId] || countryId;
  const height = Math.round(size * 0.75);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed-size flag sprite from flagcdn.com, not an optimizable local/content image
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      alt=""
      width={size}
      height={height}
      style={{ display: 'inline-block', borderRadius: 2, objectFit: 'cover', verticalAlign: 'middle', flexShrink: 0, ...style }}
    />
  );
}
