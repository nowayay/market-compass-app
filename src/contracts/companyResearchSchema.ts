import { z } from "zod";
import type { CompanyResearchResponse } from "./companyResearch";

/**
 * Runtime schema for the public Company Research response union.
 *
 * Shared by the server (final validation before returning) and the browser
 * client (validation before use). It contains only `zod` — no server-only code
 * — so it is safe to import into the client bundle. Every object is strict, so
 * an unexpected field (e.g. a leaked personal-data property injected anywhere in
 * the payload) fails validation and the response is rejected.
 */

const identifiersSchema = z.strictObject({
  krs: z.string().optional(),
  nip: z.string().optional(),
  regon: z.string().optional(),
});

const identitySchema = z.strictObject({
  legalName: z.string(),
  displayName: z.string().optional(),
  aliases: z.array(z.string()),
  countryCode: z.string(),
  identifiers: identifiersSchema,
  legalForm: z.string().optional(),
  legalStatus: z.string().optional(),
  registrationDate: z.string().optional(),
  foundedYear: z.number().optional(),
});

const locationSchema = z.strictObject({
  city: z.string().optional(),
  region: z.string().optional(),
  countryCode: z.string(),
});

const websiteSchema = z.strictObject({
  url: z.string().optional(),
  domain: z.string().optional(),
  verified: z.boolean(),
});

const industrySchema = z.strictObject({
  primaryCode: z.string().optional(),
  secondaryCodes: z.array(z.string()),
  labels: z.array(z.string()),
  description: z.string().optional(),
});

const businessSchema = z.strictObject({
  description: z.string().optional(),
  productsServices: z.array(z.string()),
  customerSegments: z.array(z.string()),
  operatingMarkets: z.array(z.string()),
});

const companyProfileSchema = z.strictObject({
  identity: identitySchema,
  location: locationSchema,
  website: websiteSchema,
  industry: industrySchema,
  business: businessSchema,
});

const candidateSchema = z.strictObject({
  candidateId: z.string(),
  legalName: z.string(),
  displayName: z.string().optional(),
  identifiers: identifiersSchema,
  legalForm: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  countryCode: z.string(),
  foundedYear: z.number().optional(),
  registrationDate: z.string().optional(),
  website: z.string().optional(),
  confidence: z.number(),
  matchReasons: z.array(z.string()),
  sourceIds: z.array(z.string()),
});

/**
 * An origin-only http(s) URL (scheme + host, no path/query/fragment). The public
 * contract must never carry an exact page URL, so we reject anything that is not
 * exactly its own origin. `new URL(...).origin` is available in both the server
 * (final guard) and the browser (client validator).
 */
const originOnlyUrl = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return false;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    // `origin` drops path/query/fragment; equality means the input was origin-only.
    return value === parsed.origin;
  }, "url must be origin-only (scheme + host, no path/query/fragment)");

const sourceSchema = z.strictObject({
  id: z.string().min(1).max(200),
  provider: z.enum(["krs", "openai_web_search"]),
  type: z.enum([
    "official_registry",
    "official_company_website",
    "official_company_document",
    "government",
    "discovery_source",
  ]),
  authority: z.enum(["primary", "authoritative_secondary", "secondary"]),
  url: z.union([originOnlyUrl, z.null()]),
  domain: z.union([z.string().min(1).max(255), z.null()]),
  retrievedAt: z.string(),
  publishedAt: z.union([z.string(), z.null()]),
});

const factEvidenceSchema = z.strictObject({
  id: z.string().min(1).max(200),
  target: z.strictObject({
    path: z.string().min(1).max(200),
    itemId: z.union([z.string().min(1).max(200), z.null()]),
  }),
  sourceIds: z
    .array(z.string().min(1).max(200))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, "sourceIds must be unique"),
  support: z.enum(["direct", "corroborating"]),
  derivation: z.enum(["registry", "extracted", "normalized", "synthesized", "derived"]),
  confidence: z.number().min(0).max(1),
  verifiedAt: z.iso.datetime(),
});

const evidenceSchema = z.strictObject({
  facts: z.array(factEvidenceSchema),
});

const conflictSchema = z.strictObject({
  code: z.string().min(1).max(100),
  targetPath: z.string().min(1).max(200),
  sourceIds: z.array(z.string().min(1).max(200)),
  resolution: z.enum(["krs_preferred", "official_source_preferred", "unresolved"]),
});

const warningSchema = z.strictObject({
  code: z.string().min(1).max(100),
  targetPath: z.union([z.string().min(1).max(200), z.null()]),
});

const qualitySchema = z.strictObject({
  identityConfidence: z.strictObject({
    level: z.enum(["high", "medium", "low"]),
    score: z.number(),
  }),
  completenessScore: z.number(),
  missingFields: z.array(z.string()),
  conflicts: z.array(conflictSchema),
  warnings: z.array(warningSchema),
  lastVerifiedAt: z.string().optional(),
});

const expansionInputsSchema = z.strictObject({
  currentMarkets: z.array(z.string()),
  productCategories: z.array(z.string()),
  customerType: z.enum(["b2b", "b2c", "b2b2c", "mixed", "unknown"]),
  salesChannels: z.array(z.string()),
  internationalExperience: z.array(z.string()),
  digitalPresence: z.array(z.string()),
  scaleSignals: z.array(z.string()),
  regulatoryConstraints: z.array(z.string()),
  operationalConstraints: z.array(z.string()),
  missingCriticalInputs: z.array(z.string()),
});

const querySchema = z.strictObject({
  name: z.string(),
  countryCode: z.string(),
  foundedYear: z.number().optional(),
  krs: z.string().optional(),
});

const metaSchema = z.strictObject({
  researchedAt: z.string(),
  version: z.string(),
});

const completedSchema = z.strictObject({
  status: z.literal("completed"),
  requestId: z.string(),
  query: querySchema,
  company: companyProfileSchema,
  expansionInputs: expansionInputsSchema,
  sources: z.array(sourceSchema),
  evidence: evidenceSchema,
  quality: qualitySchema,
  meta: metaSchema,
});

const needsConfirmationSchema = z.strictObject({
  status: z.literal("needs_confirmation"),
  requestId: z.string(),
  query: querySchema,
  candidates: z.array(candidateSchema),
  sources: z.array(sourceSchema),
});

const notFoundSchema = z.strictObject({
  status: z.literal("not_found"),
  requestId: z.string(),
  query: querySchema,
  message: z.string(),
});

const unsupportedEntitySchema = z.strictObject({
  status: z.literal("unsupported_entity_type"),
  requestId: z.string(),
  query: querySchema,
  reason: z.literal("natural_person_business"),
  message: z.string(),
});

export const companyResearchResponseSchema = z.discriminatedUnion("status", [
  completedSchema,
  needsConfirmationSchema,
  notFoundSchema,
  unsupportedEntitySchema,
]);

// Compile-time guarantee that the schema output matches the public contract.
type SchemaOutput = z.infer<typeof companyResearchResponseSchema>;
type _AssertResponse = SchemaOutput extends CompanyResearchResponse ? true : never;
type _AssertResponseBack = CompanyResearchResponse extends SchemaOutput ? true : never;
const _a: _AssertResponse = true;
const _b: _AssertResponseBack = true;
void _a;
void _b;
