/**
 * Public contracts for the MarketCompass Dashboard response.
 *
 * This is the shape `/api/company-research` returns once identification has
 * resolved to a single company: KRS-verified legal facts enriched (when
 * available) by the internal web-research pipeline, plus a single AI-generated
 * expansion analysis (SWOT + a 5-country ranking).
 *
 * Shared by server and browser code: pure types only, no runtime dependencies,
 * no `server-only`, no secrets. Carries no natural-person data — MarketCompass
 * never stores, transmits or returns data about natural persons.
 */
import type { CompanyCandidate, CompanyResearchQuery, ResearchSource } from "./companyResearch";

/** The company-as-entity facts shown on the dashboard. */
export interface DashboardCompanyInfo {
  legalName: string;
  krs?: string;
  nip?: string;
  regon?: string;
  /** User-supplied identification hint, echoed back — never a verified registry fact. */
  foundedYear?: number;
  /** Origin-only official website URL (scheme + host), when confirmed. */
  website?: string;
  industry?: string;
  description?: string;
  productsServices: string[];
  customerSegments: string[];
  operatingMarkets: string[];
}

export interface ExpansionSwot {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

/** One ranked expansion-target country. */
export interface RankedCountry {
  /** ISO 3166-1 alpha-2 code, uppercase. */
  countryCode: string;
  countryName: string;
  /** 0-100. */
  score: number;
  summary: string;
  opportunities: string[];
  risks: string[];
}

export interface ExpansionAnalysis {
  swot: ExpansionSwot;
  /** Exactly 5 distinct countries, sorted by score descending. */
  rankedCountries: RankedCountry[];
}

export interface DashboardCompletedResponse {
  status: "completed";
  requestId: string;
  query: CompanyResearchQuery;
  company: DashboardCompanyInfo;
  expansion: ExpansionAnalysis;
  sources: ResearchSource[];
}

export interface DashboardNeedsConfirmationResponse {
  status: "needs_confirmation";
  requestId: string;
  query: CompanyResearchQuery;
  candidates: CompanyCandidate[];
}

export interface DashboardNotFoundResponse {
  status: "not_found";
  requestId: string;
  query: CompanyResearchQuery;
  message: string;
}

export type CompanyDashboardResponse =
  | DashboardCompletedResponse
  | DashboardNeedsConfirmationResponse
  | DashboardNotFoundResponse;
