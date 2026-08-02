"use client";

import { useEffect, useRef } from "react";

/** Elements inside a dialog panel that can hold keyboard focus. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Visible, focusable descendants in DOM order. `getClientRects()` is the
 * reliable visibility test here — `offsetParent` is null for the fixed-position
 * overlays this hook is used on.
 */
function focusableWithin(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

/**
 * Shared modal behavior for every overlay in the app: Escape closes, Tab is
 * trapped inside the panel, focus moves in on open and returns to whatever
 * opened the dialog on close, and the page behind stops scrolling meanwhile.
 *
 * The keydown listener is bound to the panel rather than to `document`, so
 * stacked overlays (a country drawer opened from the full-map modal) behave
 * correctly: focus is trapped in the innermost panel, so only that panel sees
 * the Escape key and only it closes.
 *
 * Returns the ref to attach to the dialog panel; the panel must also carry
 * `tabIndex={-1}` so it can receive focus when it holds no controls of its own.
 */
export function useDialog(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Held in a ref so the effect never re-runs — and never re-steals focus —
  // merely because the parent re-rendered with a new closure.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the panel's first control, falling back to the panel itself so
    // focus never stays behind the scrim on a panel with no controls.
    const initial = focusableWithin(panel)[0] ?? panel;
    initial.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableWithin(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Wrap at both ends. Focus resting on the panel itself counts as being
      // at the start, so Shift+Tab from there goes to the last control.
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      // Restores whatever the *outer* overlay had set when dialogs are stacked.
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return panelRef;
}
