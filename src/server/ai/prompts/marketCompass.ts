import "server-only";

/**
 * Server-only surface for the MarketCompassAI instructions. The actual prompt
 * text lives in `marketCompassText.ts` (no `server-only`, so it stays
 * unit-testable); this module simply re-exports it for the server services and
 * keeps the accidental-client-bundling guard in place at the import boundary
 * the services actually use.
 */
export {
  MARKET_COMPASS_INSTRUCTIONS,
  MARKET_COMPASS_INSTRUCTIONS_V1,
  MARKET_COMPASS_INSTRUCTIONS_V2,
  MARKET_COMPASS_INSTRUCTIONS_V3,
} from "./marketCompassText";
