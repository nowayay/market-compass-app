import { z } from "zod";
import { iso2ToIso3 } from "../data/iso2to3.ts";
import type { CompanyDashboardResponse } from "./companyDashboard";

/**
 * Runtime schema for the public Company Dashboard response union.
 *
 * Shared by the server (final validation before returning) and the browser
 * client (validation before use / before trusting a localStorage-restored
 * value). Every object is strict, so an unexpected field fails validation.
 */

const identifiersLikeSchema = z.strictObject({
  krs: z.string().optional(),
  nip: z.string().optional(),
  regon: z.string().optional(),
});

const candidateSchema = z.strictObject({
  candidateId: z.string(),
  legalName: z.string(),
  displayName: z.string().optional(),
  identifiers: identifiersLikeSchema,
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

const querySchema = z.strictObject({
  name: z.string(),
  countryCode: z.string(),
  foundedYear: z.number().optional(),
  krs: z.string().optional(),
});

const dashboardCompanyInfoSchema = z.strictObject({
  legalName: z.string(),
  krs: z.string().optional(),
  nip: z.string().optional(),
  regon: z.string().optional(),
  foundedYear: z.number().optional(),
  website: z.string().optional(),
  industry: z.string().optional(),
  description: z.string().optional(),
  productsServices: z.array(z.string()),
  customerSegments: z.array(z.string()),
  operatingMarkets: z.array(z.string()),
});

const swotSchema = z.strictObject({
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  opportunities: z.array(z.string()),
  threats: z.array(z.string()),
});

const rankedCountrySchema = z.strictObject({
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/, "countryCode must be a 2-letter uppercase code")
    .refine((code) => iso2ToIso3(code) !== null, "countryCode must be a supported ISO 3166-1 alpha-2 code"),
  countryName: z.string(),
  score: z.number().min(0).max(100),
  summary: z.string(),
  opportunities: z.array(z.string()),
  risks: z.array(z.string()),
});

const expansionAnalysisSchema = z.strictObject({
  swot: swotSchema,
  rankedCountries: z.array(rankedCountrySchema),
});

const completedSchema = z.strictObject({
  status: z.literal("completed"),
  requestId: z.string(),
  query: querySchema,
  company: dashboardCompanyInfoSchema,
  expansion: expansionAnalysisSchema,
  sources: z.array(sourceSchema),
});

const needsConfirmationSchema = z.strictObject({
  status: z.literal("needs_confirmation"),
  requestId: z.string(),
  query: querySchema,
  candidates: z.array(candidateSchema),
});

const notFoundSchema = z.strictObject({
  status: z.literal("not_found"),
  requestId: z.string(),
  query: querySchema,
  message: z.string(),
});

export const companyDashboardResponseSchema = z.discriminatedUnion("status", [
  completedSchema,
  needsConfirmationSchema,
  notFoundSchema,
]);

// Compile-time guarantee that the schema output matches the public contract.
type SchemaOutput = z.infer<typeof companyDashboardResponseSchema>;
type _AssertResponse = SchemaOutput extends CompanyDashboardResponse ? true : never;
type _AssertResponseBack = CompanyDashboardResponse extends SchemaOutput ? true : never;
const _a: _AssertResponse = true;
const _b: _AssertResponseBack = true;
void _a;
void _b;
