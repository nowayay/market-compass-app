import type { CountryDetails } from "../../../contracts/countryDetails.ts";

/**
 * The bounded, allowlisted input for one country deep-dive. Carries ONLY the
 * company-as-entity facts already shown on the dashboard plus the opened
 * country — never a raw KRS payload and never natural-person data.
 */
export interface CountryDetailsInput {
  company: {
    legalName: string;
    industry?: string;
    description?: string;
    productsServices: string[];
    customerSegments: string[];
    operatingMarkets: string[];
  };
  country: {
    countryCode: string;
    countryName: string;
    /** The 0-100 expansion score already computed by the main analysis. */
    score: number;
  };
}

export interface CountryDetailsProvider {
  readonly name: string;
  generate(input: CountryDetailsInput, options?: { signal?: AbortSignal }): Promise<CountryDetails>;
}
