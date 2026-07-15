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

const sourceSchema = z.strictObject({
  id: z.string(),
  provider: z.enum(["krs", "company_website", "annual_report", "web"]),
  type: z.enum([
    "official_registry",
    "first_party",
    "financial_filing",
    "government",
    "news",
    "other",
  ]),
  title: z.string(),
  url: z.string().optional(),
  domain: z.string().optional(),
  retrievedAt: z.string(),
  publishedAt: z.string().optional(),
  authority: z.enum(["primary", "secondary"]),
  supports: z.array(z.string()),
});

const qualitySchema = z.strictObject({
  identityConfidence: z.strictObject({
    level: z.enum(["high", "medium", "low"]),
    score: z.number(),
  }),
  completenessScore: z.number(),
  missingFields: z.array(z.string()),
  conflicts: z.array(z.string()),
  warnings: z.array(z.string()),
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
