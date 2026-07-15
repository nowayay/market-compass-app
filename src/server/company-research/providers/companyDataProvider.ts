/**
 * The abstract company-data provider contract. Concrete providers (e.g. the
 * official KRS API) implement this and must return only sanitized domain data.
 *
 * The interface itself lives in `../types` so that pure, testable modules can
 * reference it without importing any concrete (server-only) provider.
 */
export type { CompanyDataProvider } from "../types";
