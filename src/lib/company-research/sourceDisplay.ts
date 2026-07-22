import type { ResearchSource } from "@/src/contracts/companyResearch";

/**
 * Display-ready fields for one source in the dashboard "Źródła" section. Pure
 * and browser-safe (imports only shared contract types), so the mapping is
 * unit-testable without a DOM. Carries only a safe label, the origin-only host
 * and the origin-only URL — never a path, query string or any personal data.
 */
export interface SourceDisplay {
  label: string;
  domain: string | null;
  url: string | null;
}

const PROVIDER_LABEL: Record<ResearchSource["provider"], string> = {
  krs: "Krajowy Rejestr Sądowy",
  openai_web_search: "Wyszukiwanie internetowe (AI)",
};

/** Maps a source to its display label, origin host and origin URL. */
export function describeSource(source: ResearchSource): SourceDisplay {
  const label =
    source.type === "official_company_website"
      ? "Strona firmowa"
      : PROVIDER_LABEL[source.provider];
  return { label, domain: source.domain, url: source.url };
}
