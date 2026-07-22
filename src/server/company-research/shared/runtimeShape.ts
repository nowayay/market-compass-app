/**
 * Tiny, dependency-light runtime-shape primitives shared by the internal result
 * validators (domain-resolution, business-research, profile-assembly,
 * web-research). Pure and generic — NO business logic, NO stage-specific rules.
 * Each owning-stage module composes these into its own strict shape validator;
 * this module only supplies the low-level, repeatedly-needed checks so they are
 * not re-implemented per stage.
 *
 * Prototype-safety policy (explicit): a "plain object" here means an ordinary
 * object literal — `Object.getPrototypeOf(value) === Object.prototype`.
 * Null-prototype objects (`Object.create(null)`) are DELIBERATELY NOT
 * supported/accepted: nothing this repository builds or JSON-parses ever
 * produces one, so accepting them would only widen the attack surface with no
 * legitimate use. Class instances and objects created with a custom prototype
 * are rejected outright by this same check.
 *
 * Own-property policy: every field read a schema performs goes through
 * `assertExactOwnShape`, which returns a `Map` (never a plain object) of the
 * value's OWN properties only. A `Map` lookup can never resolve a property via
 * the prototype chain, so it stays correct even under GLOBAL prototype
 * pollution (e.g. `Object.prototype.foo = "leak"`), where a bare `value.foo`
 * property read would otherwise silently resolve to the polluted value for any
 * object that does not itself own a `foo` property. Exact-key rejection uses
 * `Reflect.ownKeys` (not `Object.keys`/`Object.entries`), so an unexpected
 * SYMBOL key or a non-enumerable own string key — both invisible to
 * `Object.keys` — is caught too.
 */
import { z } from "zod";
import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";

/**
 * True only for a plain object whose prototype is EXACTLY `Object.prototype`.
 * Rejects arrays, `null`, class instances, `Object.create(customProto)` and
 * `Object.create(null)` (see the module policy above). This check alone does
 * NOT defend against prototype pollution of `Object.prototype` itself — that
 * is why every field read in this module goes through `assertExactOwnShape`'s
 * `Map`, never a bare property access.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

/** True for a non-empty string. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** True for `undefined` or a non-empty string (an absent-or-string optional field). */
export function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length > 0);
}

/**
 * Returns `value` narrowed to a non-empty string, or throws via `fail`.
 *
 * A plain `if (!isNonEmptyString(value)) fail(message);` does NOT reliably
 * narrow `value` afterward when `fail` is a `const`-bound arrow function typed
 * `(message: string) => never` (TypeScript's unreachable-code narrowing after a
 * never-returning call is only robust for `function` declarations, not arrow
 * expressions) — this ternary form narrows via the type predicate directly and
 * sidesteps that gap entirely.
 */
export function requireNonEmptyString(value: unknown, fail: (message: string) => never, message: string): string {
  return isNonEmptyString(value) ? value : fail(message);
}

/** Same as `requireNonEmptyString`, but for an optional (absent-or-string) field. */
export function requireOptionalString(
  value: unknown,
  fail: (message: string) => never,
  message: string,
): string | undefined {
  return isOptionalString(value) ? value : fail(message);
}

/**
 * The exact ISO-datetime runtime rule the public contract uses for timestamps
 * (`z.iso.datetime()`), reused so every timestamp crossing an internal result
 * boundary matches the same contract semantics.
 */
const ISO_DATETIME = z.iso.datetime();

/** True only for a canonical ISO datetime string per the contract rule. */
export function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && ISO_DATETIME.safeParse(value).success;
}

/**
 * Returns the own keys of `value` (via `Reflect.ownKeys`, so non-enumerable own
 * string keys and symbol keys are included — `Object.keys` would silently
 * ignore both) that fall outside `allowed`. A symbol key is ALWAYS unexpected
 * (no contract validated here ever uses one), regardless of `allowed`.
 */
export function unexpectedOwnKeys(value: object, allowed: readonly string[]): PropertyKey[] {
  const allowedSet = new Set<string>(allowed);
  return Reflect.ownKeys(value).filter((key) => typeof key === "symbol" || !allowedSet.has(key));
}

/**
 * Validates that `value` is a plain object (see `isPlainObject`) whose own keys
 * are EXACTLY `allowed` — no extra, no symbol, no non-enumerable-unknown key —
 * then returns a `Map` of its own values for `allowed` keys that are
 * genuinely OWN properties (checked with `Object.hasOwn`, never inherited).
 * A field absent from the returned map means it was NOT an own property on
 * `value`, exactly as if the field were absent — an inherited/prototype-
 * polluted value can never surface through the returned map. Every schema in
 * this repository reads fields ONLY through the returned map, never through a
 * bare property access on the original `value`.
 */
export function assertExactOwnShape(
  value: unknown,
  allowed: readonly string[],
  fail: (message: string) => never,
  context: string,
): Map<string, unknown> {
  if (!isPlainObject(value)) fail(`${context} is not a plain object`);
  const extra = unexpectedOwnKeys(value, allowed);
  if (extra.length > 0) fail(`${context} has an unexpected field`);
  const out = new Map<string, unknown>();
  for (const key of allowed) {
    if (Object.hasOwn(value, key)) out.set(key, (value as Record<string, unknown>)[key]);
  }
  return out;
}

/**
 * Validates that `value` is a DENSE array — every index `0..length-1` is an OWN
 * property (a sparse array has a "hole" at some index, which
 * `Array.prototype.every`/`map`/`filter`/`forEach` silently SKIP rather than
 * visit, letting an unvalidated hole slip through as if it were absent) — with
 * no unexpected own key (a non-index own property, or ANY symbol key) beyond
 * `length`. Returns a FRESH array built by applying `validateItem` to each
 * element in order, so the result can never alias the input and a hole can
 * never survive as `undefined` inside a "validated" array.
 */
export function assertDenseArray<T>(
  value: unknown,
  validateItem: (item: unknown, index: number) => T,
  fail: (message: string) => never,
  context: string,
): T[] {
  if (!Array.isArray(value)) fail(`${context} is not an array`);
  const length = value.length;

  // Reject any own key beyond the numeric indices 0..length-1 (a non-index own
  // property, e.g. an injected `arr.evil = "x"`, or ANY symbol key). `length`
  // itself is always an own property of every array and is always allowed.
  const allowedIndexKeys: string[] = [];
  for (let i = 0; i < length; i++) allowedIndexKeys.push(String(i));
  const extra = unexpectedOwnKeys(value, allowedIndexKeys);
  if (extra.some((k) => k !== "length")) {
    fail(`${context} contains an unexpected own property or symbol key`);
  }

  // Reject a sparse array: `Reflect.ownKeys` above only flags an EXTRA index —
  // a MISSING one (a hole) must be caught by explicitly checking every index is
  // an own property (`Array.prototype.every`/`map` would silently skip it).
  const out: T[] = [];
  for (let i = 0; i < length; i++) {
    if (!Object.hasOwn(value, i)) fail(`${context} is a sparse array (missing an element)`);
    out.push(validateItem((value as unknown[])[i], i));
  }
  return out;
}

/** A dense array of non-empty strings, rejecting sparse arrays and non-string items. */
export function assertNonEmptyStringArray(
  value: unknown,
  fail: (message: string) => never,
  context: string,
): string[] {
  return assertDenseArray(
    value,
    (item) => {
      if (!isNonEmptyString(item)) fail(`${context} contains a value that is not a non-empty string`);
      return item;
    },
    fail,
    context,
  );
}

/**
 * True only when `value` is a string that is ALREADY reduced to a bare
 * `scheme://host` origin: it parses, uses an allowed http(s) scheme, carries no
 * credentials, and has no path (other than `/`), query or fragment. Reuses the
 * same origin-safety primitive every stage already uses to build/validate its own
 * sources — this does not re-implement URL parsing.
 */
export function isOriginOnlyUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const safe = safeOriginFromUrl(value);
  return safe !== null && safe.origin === value;
}

/** The hostname of an already-validated origin-only URL, or null if invalid. */
export function originHostname(value: string): string | null {
  const safe = safeOriginFromUrl(value);
  return safe !== null && safe.origin === value ? safe.hostname : null;
}

/**
 * True only when `actual` is EXACTLY the canonical, deduplicated, ordered
 * subsequence of `order` implied by its own elements — i.e. `actual` has no
 * duplicate, no value outside the closed `order` enum, and is already in the
 * SAME relative order `order` defines. Reused to validate a nested (candidate- or
 * confirmation-level) reason/conflict array against its module's own `*_ORDER`
 * constant, mirroring the pattern the top-level `orderXReasons` helpers already
 * enforce by construction. `actual` must already be a dense array (pass it
 * through `assertDenseArray` first) — a hole would surface as `undefined`,
 * which can never match a closed-enum value and is correctly rejected.
 */
export function isCanonicalOrderedSubset<T>(actual: readonly T[], order: readonly T[]): boolean {
  const set = new Set(actual);
  if (set.size !== actual.length) return false; // duplicate
  const canonical = order.filter((code) => set.has(code));
  if (canonical.length !== actual.length) return false; // value outside the closed enum
  for (let i = 0; i < canonical.length; i++) {
    if (canonical[i] !== actual[i]) return false;
  }
  return true;
}

/**
 * Element-wise strict-equality array comparison. Uses an explicit indexed loop
 * (never `.every`/`.some`/`.map`, which silently SKIP holes in a sparse array)
 * so a hole can never compare equal to anything by being skipped — reading a
 * hole via `a[i]` yields `undefined`, which is compared like any other value.
 * Never uses JSON serialization.
 */
export function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
