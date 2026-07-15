import { z } from "zod";

/**
 * Request validation for POST /api/company-research.
 *
 * Only structural validation lives here. KRS normalization (to exactly 10
 * digits) is a separate concern in `resolution/normalizeQuery` so a malformed
 * KRS can be reported with the specific INVALID_KRS code rather than a generic
 * INVALID_REQUEST. This module imports only `zod`, keeping it unit-testable.
 */

const currentYear = new Date().getFullYear();

/** A permissive KRS shape; exact 10-digit normalization happens downstream. */
const rawKrsSchema = z
  .string()
  .trim()
  .max(32)
  .regex(/^[0-9\s-]+$/, "KRS may contain only digits, spaces or dashes");

const querySchema = z
  .strictObject({
    name: z.string().trim().min(1, "name must not be empty").max(200),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "countryCode must be a 2-letter code")
      .default("PL"),
    foundedYear: z
      .number()
      .int()
      .min(1800, "foundedYear is unrealistically early")
      .max(currentYear + 1, "foundedYear is in the future")
      .optional(),
    krs: rawKrsSchema.optional(),
  })
  .describe("The company research query.");

export const companyResearchRequestSchema = z
  .strictObject({
    query: querySchema,
    selectedCandidateId: z.string().trim().min(1).max(128).nullish(),
  })
  .describe("A company research request.");

/** The validated (pre-KRS-normalization) request. */
export type CompanyResearchRequest = z.infer<typeof companyResearchRequestSchema>;
export type CompanyResearchRequestQuery = z.infer<typeof querySchema>;
