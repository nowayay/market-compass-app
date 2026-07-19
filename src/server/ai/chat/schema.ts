import "server-only";
import { z } from "zod";

/** Maximum number of messages accepted in a single conversation payload. */
const MAX_MESSAGES = 20;
/** Maximum characters allowed in a single (trimmed) message. */
const MAX_MESSAGE_CHARS = 4000;
/** Maximum combined characters across all (trimmed) messages. */
const MAX_TOTAL_CHARS = 20000;
/** Maximum characters for the optional bounded dashboard context. */
const MAX_COMPANY_CONTEXT_CHARS = 4000;

/**
 * A single chat turn. Only `user` and `assistant` roles are accepted — the
 * `system`, `developer`, `tool` and `function` roles are rejected by the enum,
 * since server-authored instructions must never come from the client.
 * `.strict()` rejects any unknown property on a message object.
 */
const messageSchema = z
  .strictObject({
    role: z.enum(["user", "assistant"]),
    content: z
      .string()
      .trim()
      .min(1, "Message content must not be empty.")
      .max(MAX_MESSAGE_CHARS, `Message content must not exceed ${MAX_MESSAGE_CHARS} characters.`),
  })
  .describe("A single chat message.");

/**
 * The validated chat request: a non-empty, bounded conversation history whose
 * final turn must come from the user. `.strict()` rejects unknown top-level
 * properties. Cross-field rules (total length, final role) are enforced with
 * schema-level refinements so they apply to the request as a whole.
 */
export const chatRequestSchema = z
  .strictObject({
    messages: z
      .array(messageSchema)
      .min(1, "At least one message is required.")
      .max(MAX_MESSAGES, `No more than ${MAX_MESSAGES} messages are allowed.`),
    /**
     * Optional, bounded, UNTRUSTED reference context: a small JSON summary of
     * the user's own current MarketCompass dashboard (company profile +
     * expansion analysis), supplied by the browser only when a dashboard
     * exists. It is never treated as trusted server instructions — see
     * `streamChatResponse.ts`.
     */
    companyContext: z
      .string()
      .trim()
      .max(MAX_COMPANY_CONTEXT_CHARS, `companyContext must not exceed ${MAX_COMPANY_CONTEXT_CHARS} characters.`)
      .optional(),
  })
  .refine(
    (data) => data.messages.reduce((total, message) => total + message.content.length, 0) <= MAX_TOTAL_CHARS,
    { message: `Total content length must not exceed ${MAX_TOTAL_CHARS} characters.`, path: ["messages"] },
  )
  .refine((data) => data.messages[data.messages.length - 1]?.role === "user", {
    message: "The final message must come from the user.",
    path: ["messages"],
  });

/** A single validated chat message (post-trim). */
export type ChatMessage = z.infer<typeof messageSchema>;

/** A fully validated chat request. */
export type ChatRequest = z.infer<typeof chatRequestSchema>;
