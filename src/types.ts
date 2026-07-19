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

/** The app's top-level screens. No multi-profile management in this MVP. */
export type Screen = "form" | "confirm" | "loading" | "dashboard";

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
}

/** A raw world-atlas country outline (SVG path + its ISO alpha-3 id). */
export interface WorldFeature {
  iso3: string;
  d: string;
}

/** A world-atlas outline decorated for rendering (fill color, click target). */
export interface MapCountryFeature {
  iso3: string;
  d: string;
  fill: string;
  cursor: string;
  /** The matched ranked country's code, or null when this outline is unranked. */
  countryCode: string | null;
}

/** A ranked country decorated with display-ready tier/color values. */
export interface DecoratedCountry extends RankedCountry {
  rank: number;
  tierLabel: string;
  tierColor: string;
  tierBg: string;
  mapFill: string;
}

export interface AppState {
  screen: Screen;
  form: FormValues;
  formError: string | null;
  apiError: string | null;
  candidates: CompanyCandidate[];
  dashboard: DashboardCompletedResponse | null;
  selectedCountryCode: string | null;
  showAllRanking: boolean;
  mapFull: boolean;
  mapReady: boolean;
  worldFeatures: WorldFeature[];
  chatOpen: boolean;
  chatMessages: ChatMessage[];
  chatInput: string;
  chatGenerating: boolean;
  chatError: string | null;
}
