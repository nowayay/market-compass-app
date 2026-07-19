/**
 * Focused tests for the shared pipeline-stage logging helper: the exact safe
 * payload shape (stage/status/optional reasonCode, nothing else) and the
 * reason-code extraction that never leaks a raw error message.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { logPipelineStage, stageErrorReasonCode } from "../logging/pipelineStageLog.ts";

function captureConsoleInfo(): { calls: unknown[][]; restore: () => void } {
  const original = console.info;
  const calls: unknown[][] = [];
  console.info = (...args: unknown[]) => { calls.push(args); };
  return { calls, restore: () => { console.info = original; } };
}

test("logPipelineStage logs exactly {stage, status} when no reasonCode is given", () => {
  const capture = captureConsoleInfo();
  try {
    logPipelineStage("identification", "completed");
    const [, json] = capture.calls[0] as [string, string];
    assert.deepEqual(JSON.parse(json), { stage: "identification", status: "completed" });
  } finally {
    capture.restore();
  }
});

test("logPipelineStage includes reasonCode only when provided", () => {
  const capture = captureConsoleInfo();
  try {
    logPipelineStage("krs-verification", "error", "COMPANY_RESEARCH_PROVIDER_ERROR");
    const [, json] = capture.calls[0] as [string, string];
    assert.deepEqual(JSON.parse(json), {
      stage: "krs-verification",
      status: "error",
      reasonCode: "COMPANY_RESEARCH_PROVIDER_ERROR",
    });
  } finally {
    capture.restore();
  }
});

test("stageErrorReasonCode returns a typed error's own stable code", () => {
  assert.equal(stageErrorReasonCode({ code: "COMPANY_IDENTIFICATION_TIMEOUT" }), "COMPANY_IDENTIFICATION_TIMEOUT");
});

test("stageErrorReasonCode falls back to UNKNOWN_ERROR for an untyped error, never the message", () => {
  const reason = stageErrorReasonCode(new Error("some sensitive raw detail"));
  assert.equal(reason, "UNKNOWN_ERROR");
  assert.ok(!reason.includes("sensitive"));
});

test("stageErrorReasonCode never throws on odd inputs (null, string, number)", () => {
  assert.equal(stageErrorReasonCode(null), "UNKNOWN_ERROR");
  assert.equal(stageErrorReasonCode("boom"), "UNKNOWN_ERROR");
  assert.equal(stageErrorReasonCode(42), "UNKNOWN_ERROR");
});
