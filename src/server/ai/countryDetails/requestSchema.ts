import { z } from "zod";

/**
 * Validated request body for POST /api/company-research/country-details. All
 * fields are bounded; the browser sends only company-as-entity facts already
 * shown on the dashboard plus the opened country. `.strict()` rejects any
 * unknown property (defense-in-depth against a smuggled raw KRS payload).
 */

const shortText = z.string().trim().max(2000);
const listOfShort = z.array(z.string().trim().min(1).max(500)).max(50);

export const countryDetailsRequestSchema = z.strictObject({
  company: z.strictObject({
    legalName: z.string().trim().min(1).max(500),
    industry: shortText.optional(),
    description: shortText.optional(),
    productsServices: listOfShort.default([]),
    customerSegments: listOfShort.default([]),
    operatingMarkets: listOfShort.default([]),
  }),
  country: z.strictObject({
    countryCode: z.string().trim().length(2).toUpperCase(),
    countryName: z.string().trim().min(1).max(120),
    score: z.number().min(0).max(100),
  }),
});

export type CountryDetailsRequest = z.infer<typeof countryDetailsRequestSchema>;
