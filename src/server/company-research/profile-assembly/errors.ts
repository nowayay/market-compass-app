/**
 * INTERNAL typed errors for the Company Profile Assembly stage.
 *
 * Assembly is NOT wired into the public Company Research API, so its error codes
 * are deliberately kept OUT of the public `CompanyResearchErrorCode` union and do
 * NOT extend the public `CompanyResearchError` base — an assembly error can never
 * travel through the public error mapping.
 *
 * These are raised ONLY for logically-impossible internal states (a broken
 * contract between the KRS mapper / domain resolution / business research and this
 * stage) or a final privacy-guard violation — never for an ordinary outcome. A
 * message/cause may hold internal detail but must NEVER contain a company name,
 * domain, fact, source URL, rejected value or any personal data.
 *
 * No `server-only` import: the module lives in the server tree but stays loadable
 * by the Node test runner (mirroring the sibling module error files).
 */

/** Stable INTERNAL error codes for profile assembly (not a public contract). */
export type CompanyProfileAssemblyErrorCode =
  | "COMPANY_PROFILE_ASSEMBLY_INVARIANT"
  | "COMPANY_PROFILE_ASSEMBLY_PRIVACY_VIOLATION";

/** Internal base for all profile-assembly errors. NOT a `CompanyResearchError`. */
export abstract class ProfileAssemblyErrorBase extends Error {
  abstract readonly code: CompanyProfileAssemblyErrorCode;
  readonly publicMessage: string;
  readonly cause?: unknown;

  constructor(message: string, publicMessage: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.publicMessage = publicMessage;
    this.cause = cause;
  }
}

/** A broken internal invariant (an impossible KRS / resolution / business state). */
export class ProfileAssemblyInvariantError extends ProfileAssemblyErrorBase {
  readonly code: CompanyProfileAssemblyErrorCode = "COMPANY_PROFILE_ASSEMBLY_INVARIANT";
  constructor(message: string, cause?: unknown) {
    super(
      `Profile assembly invariant violated: ${message}`,
      "Wystąpił wewnętrzny błąd składania profilu firmy.",
      cause,
    );
  }
}

/** The final assembled result failed the personal-data guard (fail-closed). */
export class ProfileAssemblyPrivacyError extends ProfileAssemblyErrorBase {
  readonly code: CompanyProfileAssemblyErrorCode = "COMPANY_PROFILE_ASSEMBLY_PRIVACY_VIOLATION";
  constructor(message = "Assembled profile failed the personal-data guard", cause?: unknown) {
    super(message, "Składanie profilu firmy zostało przerwane ze względów prywatności.", cause);
  }
}
