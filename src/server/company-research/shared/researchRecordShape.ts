/**
 * Strict runtime-shape validation for the two provenance record types shared by
 * multiple internal stages (`ResearchSource`, `FactEvidence` — both reused
 * verbatim from the public `contracts/companyResearch.ts`, never duplicated as a
 * new type). Neither type has a single "owning" internal stage — business
 * research and profile assembly both produce/consume them — so their generic
 * structural validator lives here rather than being duplicated in each stage.
 *
 * This validates STRUCTURE only (exact own keys, enum membership, origin-only
 * urls, ISO timestamps, non-empty/unique ids, dense arrays) — never business
 * semantics such as "on the confirmed target domain" (that stays with the
 * owning stage, which already has dedicated validators, e.g.
 * `profile-assembly/invariants.ts`'s `assertValidBusinessSource`).
 *
 * Every returned record is a FRESH object literal built field-by-field from an
 * `assertExactOwnShape` map — never the original (possibly prototype-tainted)
 * input — so an inherited/prototype-polluted value can never survive into the
 * returned value, let alone the caller's eventual clone.
 */
import {
  assertDenseArray,
  assertExactOwnShape,
  assertNonEmptyStringArray,
  isIsoDateTime,
  isNonEmptyString,
  isOriginOnlyUrl,
  originHostname,
} from "./runtimeShape.ts";
import type { FactEvidence, ResearchSource } from "../../../contracts/companyResearch.ts";

const SOURCE_PROVIDERS = new Set(["krs", "openai_web_search"]);
const SOURCE_TYPES = new Set([
  "official_registry",
  "official_company_website",
  "official_company_document",
  "government",
  "discovery_source",
]);
const SOURCE_AUTHORITIES = new Set(["primary", "authoritative_secondary", "secondary"]);
const SOURCE_KEYS = ["id", "provider", "type", "authority", "url", "domain", "retrievedAt", "publishedAt"];

const EVIDENCE_SUPPORTS = new Set(["direct", "corroborating"]);
const EVIDENCE_DERIVATIONS = new Set(["registry", "extracted", "normalized", "synthesized", "derived"]);
const EVIDENCE_KEYS = ["id", "target", "sourceIds", "support", "derivation", "confidence", "verifiedAt"];
const EVIDENCE_TARGET_KEYS = ["path", "itemId"];

/**
 * Validates the COMPLETE runtime shape of one `ResearchSource`: exact OWN keys
 * (an unexpected field such as a smuggled `sourceSnippet`/`title`/`pageContent`
 * — or the same field only INHERITED via a custom/polluted prototype — is
 * rejected, never silently read through), enum membership, an origin-only
 * `url` (or `null`), a `domain` that agrees with `url`'s hostname, and
 * canonical ISO timestamps. `fail` is the caller's typed-error factory (never
 * this module's concern — different stages throw different typed errors for
 * the same shape violation). Returns a FRESH `ResearchSource`.
 */
export function assertValidResearchSourceShape(value: unknown, fail: (message: string) => never): ResearchSource {
  const s = assertExactOwnShape(value, SOURCE_KEYS, fail, "source");

  const id = s.get("id");
  if (!isNonEmptyString(id)) fail("source id is not a non-empty string");
  const provider = s.get("provider");
  if (typeof provider !== "string" || !SOURCE_PROVIDERS.has(provider)) fail("source provider is invalid");
  const type = s.get("type");
  if (typeof type !== "string" || !SOURCE_TYPES.has(type)) fail("source type is invalid");
  const authority = s.get("authority");
  if (typeof authority !== "string" || !SOURCE_AUTHORITIES.has(authority)) fail("source authority is invalid");

  const url = s.get("url");
  if (url !== null && !isOriginOnlyUrl(url)) fail("source url is neither null nor origin-only");
  const domain = s.get("domain");
  if (domain !== null && !isNonEmptyString(domain)) fail("source domain is neither null nor a non-empty string");
  if ((url === null) !== (domain === null)) fail("source url/domain nullability disagree");
  if (url !== null && domain !== originHostname(url as string)) {
    fail("source domain does not match its url hostname");
  }

  const retrievedAt = s.get("retrievedAt");
  if (!isIsoDateTime(retrievedAt)) fail("source retrievedAt is not a canonical ISO datetime");
  const publishedAt = s.get("publishedAt");
  if (publishedAt !== null && !isIsoDateTime(publishedAt)) {
    fail("source publishedAt is neither null nor a canonical ISO datetime");
  }

  return {
    id,
    provider: provider as ResearchSource["provider"],
    type: type as ResearchSource["type"],
    authority: authority as ResearchSource["authority"],
    url: url as string | null,
    domain: domain as string | null,
    retrievedAt,
    publishedAt: publishedAt as string | null,
  };
}

/** Validates the complete runtime shape of a DENSE ARRAY of `ResearchSource`. */
export function assertValidResearchSourceArrayShape(
  value: unknown,
  fail: (message: string) => never,
): ResearchSource[] {
  return assertDenseArray(value, (item) => assertValidResearchSourceShape(item, fail), fail, "sources");
}

/**
 * Validates the COMPLETE runtime shape of one `FactEvidence`: exact OWN keys, a
 * strict `target` sub-object (own keys too), a DENSE, non-empty AND unique
 * `sourceIds` array, enum membership, a `confidence` in `[0, 1]`, and a
 * canonical ISO `verifiedAt`. Returns a FRESH `FactEvidence`.
 */
export function assertValidFactEvidenceShape(value: unknown, fail: (message: string) => never): FactEvidence {
  const e = assertExactOwnShape(value, EVIDENCE_KEYS, fail, "evidence");

  const id = e.get("id");
  if (!isNonEmptyString(id)) fail("evidence id is not a non-empty string");

  const targetMap = assertExactOwnShape(e.get("target"), EVIDENCE_TARGET_KEYS, fail, "evidence target");
  const path = targetMap.get("path");
  if (!isNonEmptyString(path)) fail("evidence target path is not a non-empty string");
  const itemId = targetMap.get("itemId");
  if (itemId !== null && !isNonEmptyString(itemId)) {
    fail("evidence target itemId is neither null nor a non-empty string");
  }

  const sourceIds = assertNonEmptyStringArray(e.get("sourceIds"), fail, "evidence sourceIds");
  if (sourceIds.length === 0) fail("evidence sourceIds is empty");
  if (new Set(sourceIds).size !== sourceIds.length) fail("evidence sourceIds contains a duplicate");

  const support = e.get("support");
  if (typeof support !== "string" || !EVIDENCE_SUPPORTS.has(support)) fail("evidence support is invalid");
  const derivation = e.get("derivation");
  if (typeof derivation !== "string" || !EVIDENCE_DERIVATIONS.has(derivation)) {
    fail("evidence derivation is invalid");
  }
  const confidence = e.get("confidence");
  if (typeof confidence !== "number" || !(confidence >= 0 && confidence <= 1)) {
    fail("evidence confidence is not a number in [0, 1]");
  }
  const verifiedAt = e.get("verifiedAt");
  if (!isIsoDateTime(verifiedAt)) fail("evidence verifiedAt is not a canonical ISO datetime");

  return {
    id,
    target: { path, itemId: itemId as string | null },
    sourceIds,
    support: support as FactEvidence["support"],
    derivation: derivation as FactEvidence["derivation"],
    confidence,
    verifiedAt,
  };
}

/** Validates the complete runtime shape of a DENSE ARRAY of `FactEvidence`. */
export function assertValidFactEvidenceArrayShape(
  value: unknown,
  fail: (message: string) => never,
): FactEvidence[] {
  return assertDenseArray(value, (item) => assertValidFactEvidenceShape(item, fail), fail, "evidence");
}
