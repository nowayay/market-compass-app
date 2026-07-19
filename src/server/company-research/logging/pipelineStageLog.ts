/**
 * Shared, safe development-stage logging for the Company Research / Dashboard
 * pipeline. Lets a real failure be diagnosed by its stage + reason code
 * instead of guessed at from a generic public HTTP error.
 *
 * Log ONLY the stage, its outcome, and (optionally) a stable reason CODE —
 * NEVER a company name, KRS/NIP/REGON, URL, prompt, model response, raw
 * exception message, or any personal data.
 */

export type PipelineStage =
  | "identification"
  | "krs-verification"
  | "web-research"
  | "enrichment"
  | "expansion-analysis";

/**
 * "skipped" applies only to the `enrichment` stage, which may legitimately
 * not run at all (the profile already has usable business facts); the other,
 * required stages never log it. "retry" applies only to `expansion-analysis`,
 * logged once when its single automatic retry attempt is triggered by a
 * structural validation failure — always followed by a terminal
 * `completed`/`error` log for the stage.
 */
export type PipelineStageStatus = "completed" | "fallback" | "error" | "skipped" | "retry";

export function logPipelineStage(stage: PipelineStage, status: PipelineStageStatus, reasonCode?: string): void {
  const payload = reasonCode !== undefined ? { stage, status, reasonCode } : { stage, status };
  console.info("[company-research-stage]", JSON.stringify(payload));
}

/**
 * Maps a caught failure to a stable, safe-to-log reason code — the error's
 * own stable `.code` (every typed error in this codebase carries one) when
 * present, else a generic fallback. Never the raw error/message.
 */
export function stageErrorReasonCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return "UNKNOWN_ERROR";
}
