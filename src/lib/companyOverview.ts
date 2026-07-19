import type { DashboardCompanyInfo } from "../types";

/** One labeled fact rendered in a metadata/registry row. */
export interface CompanyOverviewItem {
  label: string;
  value: string;
  isLink?: boolean;
}

export interface CompanyOverview {
  description?: string;
  /** Industry, founded year, official website — omitted when absent. */
  metadata: CompanyOverviewItem[];
  /** KRS, NIP, REGON — omitted when absent. */
  registry: CompanyOverviewItem[];
}

/**
 * Derives the optional company-overview sections shown in the dashboard's top
 * card, from the flat `DashboardCompanyInfo` the API returns. Pure and
 * side-effect free: every item list contains ONLY the fields that are
 * actually present — no placeholder entries for missing data.
 */
export function deriveCompanyOverview(company: DashboardCompanyInfo): CompanyOverview {
  const metadata: CompanyOverviewItem[] = [];
  if (company.industry) metadata.push({ label: "Branża", value: company.industry });
  if (company.foundedYear) metadata.push({ label: "Rok założenia", value: String(company.foundedYear) });
  if (company.website) metadata.push({ label: "Strona internetowa", value: company.website, isLink: true });

  const registry: CompanyOverviewItem[] = [];
  if (company.krs) registry.push({ label: "KRS", value: company.krs });
  if (company.nip) registry.push({ label: "NIP", value: company.nip });
  if (company.regon) registry.push({ label: "REGON", value: company.regon });

  return { description: company.description, metadata, registry };
}
