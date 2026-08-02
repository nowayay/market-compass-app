import type { CompanyCandidate } from "./contracts/companyResearch";
import type { DashboardCompletedResponse, RankedCountry } from "./contracts/companyDashboard";

export type {
  CompanyDashboardResponse,
  DashboardCompanyInfo,
  DashboardCompletedResponse,
  ExpansionAnalysis,
  ExpansionSwot,
  RankedCountry,
} from "./contracts/companyDashboard";
export type { CompanyCandidate } from "./contracts/companyResearch";

/** The app's top-level screens. */
export type Screen = "form" | "confirm" | "loading" | "dashboard" | "profiles";

/** Raw (string) values bound to the search form's inputs. */
export interface FormValues {
  name: string;
  foundedYear: string;
  krs: string;
}

export function emptyFormValues(): FormValues {
  return { name: "", foundedYear: "", krs: "" };
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /**
   * True when this assistant reply was cut short (hit the model's output-token
   * budget, or was interrupted after useful text arrived). The UI keeps the
   * partial text and shows a neutral "Odpowiedź została skrócona" note.
   */
  truncated?: boolean;
}

/** A raw world-atlas country outline (SVG path + its ISO alpha-3 id). */
export interface WorldFeature {
  iso3: string;
  d: string;
}

/**
 * Whether the world-atlas outlines have loaded. `error` is a real state, not a
 * variant of loading: the outlines come from a third-party CDN, and a failed
 * fetch must offer a retry rather than spin forever.
 */
export type MapStatus = "loading" | "ready" | "error";

/** A world-atlas outline decorated for rendering (fill color, click target). */
export interface MapCountryFeature {
  iso3: string;
  d: string;
  fill: string;
  cursor: string;
  /** The matched ranked country's code, or null when this outline is unranked. */
  countryCode: string | null;
  /** The matched country's display name, for the outline's accessible label. */
  countryName: string | null;
}

/**
 * A ranked country decorated with display-ready tier/color values.
 *
 * `tierInk` and `mapFill` are the same tier in two weights — see `tierOf` in
 * lib/derive. Use `tierInk` wherever the tier is read as a glyph (score
 * numbers, tier labels, the score ring's arc) and `mapFill` only for large
 * areas of color. They are not interchangeable: the fills do not reach text
 * contrast, and the inks are too dark to read as a traffic light across a map.
 */
export interface DecoratedCountry extends RankedCountry {
  rank: number;
  tierLabel: string;
  tierInk: string;
  tierBg: string;
  mapFill: string;
}

/**
 * The exact company-search query that produced the currently shown search
 * result / candidate list, frozen at submit time. A candidate confirmation
 * always reuses this verbatim — it is never re-derived from (or compared
 * against) whatever the form fields happen to hold at click time.
 */
export interface SearchQuery {
  name: string;
  foundedYear?: number;
  krs?: string;
}

/** One saved company profile: a completed dashboard plus its own persistence bookkeeping. */
export interface CompanyProfileEntry {
  /** Stable dedup key — the company's KRS when known, else a request-id fallback. */
  id: string;
  /** ISO timestamp of when this profile was last added/updated. */
  savedAt: string;
  dashboard: DashboardCompletedResponse;
}

export interface AppState {
  screen: Screen;
  form: FormValues;
  formError: string | null;
  apiError: string | null;
  searchQuery: SearchQuery | null;
  candidates: CompanyCandidate[];
  dashboard: DashboardCompletedResponse | null;
  selectedCountryCode: string | null;
  showAllRanking: boolean;
  mapFull: boolean;
  mapStatus: MapStatus;
  worldFeatures: WorldFeature[];
  chatOpen: boolean;
  chatMessages: ChatMessage[];
  chatInput: string;
  chatGenerating: boolean;
  chatError: string | null;
  profiles: CompanyProfileEntry[];
  profileMenuOpenId: string | null;
  profileToDeleteId: string | null;
}
