/**
 * The abstract company-identification provider contract. Concrete providers
 * (e.g. OpenAI web search) implement this and must return only runtime-validated
 * discovered candidates and real (tool-attested) sources, free of natural-person
 * data.
 *
 * The interface lives in `./types` so pure, testable modules can reference it
 * without importing any concrete (server-only) provider.
 */
export type {
  CompanyIdentificationProvider,
  DiscoveredCompanyCandidate,
  DiscoveryResult,
  IdentificationQuery,
} from "./types";
export type { SafeDiscoveredSource } from "./webSourceSecurity";
