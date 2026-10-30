"use client";
import { useI18n } from "@/components/language-provider";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

type Request = { id: string; fingerprint: string };
type Draft = {
  version: number;
  stage: string;
  fields: Record<string, string>;
  request: Request | null;
};

function fields(form: HTMLFormElement) {
  return Object.fromEntries(
    Array.from(
      form.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input[name],select[name],textarea[name]"),
    ).map((input) => [
      input.name,
      input instanceof HTMLInputElement && input.type === "checkbox"
        ? input.checked
          ? "on"
          : ""
        : input.value,
    ]),
  );
}
function restore(form: HTMLFormElement, values: Record<string, string>) {
  for (const input of form.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("input[name],select[name],textarea[name]")) {
    if (!Object.hasOwn(values, input.name)) continue;
    if (input instanceof HTMLInputElement && input.type === "checkbox")
      input.checked = values[input.name] === "on";
    else input.value = values[input.name];
  }
  form.dispatchEvent(new Event("input", { bubbles: true }));
}

export function useWorkflowDraft({
  form: formRef,
  request: requestRef,
  enabled,
  officerId,
  applicationId,
  version,
  stage,
}: {
  form: RefObject<HTMLFormElement | null>;
  request: RefObject<Request | null>;
  enabled: boolean;
  officerId: string;
  applicationId: string;
  version: number;
  stage: string;
}) {
  const { t } = useI18n();
  const translationRef = useRef(t);
  useEffect(() => {
    translationRef.current = t;
  }, [t]);

  const key = `sevasathi:draft:${officerId}:${applicationId}`;
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState<Draft | null>(null);
  const dirty = useRef(false);
  const baseline = useRef("");
  const protectedRef = useRef(false);
  const persist = useCallback(() => {
    if (!formRef.current || !enabled) return;
    const current = fields(formRef.current);
    dirty.current = JSON.stringify(current) !== baseline.current;
    try {
      if (dirty.current || requestRef.current)
        sessionStorage.setItem(
          key,
          JSON.stringify({
            version,
            stage,
            fields: current,
            request: requestRef.current,
          }),
        );
      else sessionStorage.removeItem(key);
      protectedRef.current = true;
      setMessage(
        dirty.current
          ? "Edits protected in this tab. Use Save to persist them to the database."
          : "",
      );
    } catch {
      protectedRef.current = false;
      setMessage("Recovery storage is unavailable. Save before leaving.");
    }
  }, [formRef, requestRef, enabled, key, version, stage]);
  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {}
    dirty.current = false;
    setRecovery(null);
    setMessage("");
    if (formRef.current)
      baseline.current = JSON.stringify(fields(formRef.current));
  }, [key, formRef]);

  useEffect(() => {
    const element = formRef.current;
    if (!enabled || !element) return;
    let active = true;
    baseline.current = JSON.stringify(fields(element));
    dirty.current = false;
    // Defer recovery until the uncontrolled form has mounted after navigation.
    queueMicrotask(() => {
      if (!active) return;
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw || raw.length > 600000) return;
        const draft = JSON.parse(raw) as Draft;
        if (
          draft.stage !== stage ||
          !Number.isSafeInteger(draft.version) ||
          !draft.fields ||
          typeof draft.fields !== "object" ||
          Object.values(draft.fields).some((value) => typeof value !== "string")
        )
          return;
        if (JSON.stringify(draft.fields) === baseline.current) {
          sessionStorage.removeItem(key);
          return;
        }
        if (draft.version !== version) {
          setRecovery(draft);
          setMessage(
            "Server data changed. Review before restoring the older draft.",
          );
          return;
        }
        requestRef.current =
          draft.request?.id && draft.request.fingerprint ? draft.request : null;
        restore(element, draft.fields);
        dirty.current = true;
        setMessage(
          "Unsaved draft recovered. Use Save to persist it to the database.",
        );
      } catch {
        setMessage("Draft recovery is unavailable; save before leaving.");
      }
    });
    element.addEventListener("input", persist);
    element.addEventListener("change", persist);
    const leaving = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    const navigating = (event: MouseEvent) => {
      if (!dirty.current || !(event.target instanceof Element)) return;
      const anchor = event.target.closest("a");
      if (!anchor || !anchor.href || anchor.target === "_blank") return;
      const target = new URL(anchor.href);
      if (
        target.pathname === location.pathname &&
        target.search === location.search
      )
        return;
      try {
        if (protectedRef.current && sessionStorage.getItem(key)) return;
      } catch {}
      if (
        !window.confirm(
          translationRef.current(
            "Unsaved changes cannot be recovered. Leave anyway?",
          ),
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", navigating, true);
    return () => {
      active = false;
      element.removeEventListener("input", persist);
      element.removeEventListener("change", persist);
      window.removeEventListener("beforeunload", leaving);
      document.removeEventListener("click", navigating, true);
    };
  }, [enabled, formRef, key, persist, requestRef, stage, version]);

  const restoreOlder = () => {
    if (recovery && formRef.current) {
      restore(formRef.current, recovery.fields);
      requestRef.current = null;
      setRecovery(null);
      persist();
    }
  };
  const discard = () => {
    if (dirty.current && !window.confirm(t("Discard unsaved draft?"))) return;
    if (formRef.current) formRef.current.reset();
    clear();
    formRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return { message, recovery, persist, clear, restoreOlder, discard };
}
