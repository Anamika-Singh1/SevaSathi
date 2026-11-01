"use client";
import { useI18n } from "@/components/language-provider";

import { translateMessage, languageTag } from "@/lib/i18n";
import { demoRecordText, locationLabel, officerLabel } from "@/lib/i18n/records";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  LockKeyhole,
  RotateCcw,
  Save,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  submitWorkflow,
  type WorkflowResult,
} from "@/app/(workspace)/applications/[id]/actions";
import {
  canWork,
  assignedActorId,
  STAGES,
  RECEIPT_STATUS,
  VERIFICATION_CHECKS,
  REVIEW_CHECKS,
  VERIFICATION_STATUS,
  stageLabel,
  type WorkflowAction,
} from "@/lib/workflow";
import { useWorkflowDraft } from "@/lib/workflow-draft";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { formatDate, formatCurrency } from "@/lib/utils";
import type {
  ApplicationWorklist,
  ApplicationWorkflow,
  ChecklistItem,
} from "@/types/domain";

type Officer = { id: string; full_name: string; role: Role };
const control =
  "min-h-11 w-full min-w-0 rounded-lg border border-input bg-white px-3 py-2 text-base leading-8 disabled:bg-muted";
const textArea = `${control} min-h-28 leading-8`;

export function WorkflowPanel({
  application,
  workflow,
  checklist,
  officers,
  officer,
  today,
}: {
  application: ApplicationWorklist;
  workflow: ApplicationWorkflow;
  checklist: ChecklistItem[];
  officers: Officer[];
  officer: { id: string; role: Role };
  today: string;
}) {
  const { t, locale } = useI18n();

  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<{ id: string; fingerprint: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [confirmation, setConfirmation] = useState<WorkflowAction | null>(null);
  const [validation, setValidation] = useState<FormData | null>(null);
  const [reasonError, setReasonError] = useState(false);
  const editable = canWork(application, workflow, officer);
  const closed = ["APPROVED", "REJECTED"].includes(application.status);
  const draft = useWorkflowDraft({
    form,
    request,
    enabled: editable,
    officerId: officer.id,
    applicationId: application.id,
    version: workflow.version,
    stage: application.status,
  });
  const stage = STAGES[application.status as keyof typeof STAGES];
  const owner = officers.find(
    (person) => person.id === assignedActorId(application, workflow),
  );
  const bools = (value: unknown) =>
    value && typeof value === "object"
      ? (value as Record<string, boolean>)
      : {};
  const labelForAction = (action: WorkflowAction) =>
    ({
      SAVE: t("Save progress"),
      ADVANCE: t("Advance"),
      RETURN: t("Return for clarification"),
      RESUME: t("Resume"),
      APPROVE: t("Approve"),
      REJECT: t("Reject"),
    })[action];

  function requirements(data?: FormData) {
    const text = (name: string, fallback: string) =>
      data ? String(data.get(name) ?? "") : fallback;
    const checked = (name: string, fallback: boolean) =>
      data ? data.get(name) === "on" : fallback;
    const missing: string[] = [];
    if (application.status === "SUBMITTED") {
      for (const item of checklist)
        if (
          item.required &&
          text(`status:${item.key}`, item.receipt_status) !== "RECEIVED"
        )
          missing.push(
            t("{item}: receipt required", {
              item: locale === "kn" ? item.label_kn : item.label_en,
            }),
          );
      if (text("screening_notes", workflow.screening_notes).trim().length < 5)
        missing.push(t("Screening notes: at least 5 characters"));
      for (const [name, value, label] of [
        [
          "field_officer_id",
          application.assigned_field_officer_id,
          "Field officer",
        ],
        ["caseworker_id", workflow.caseworker_id, "Caseworker"],
        [
          "approving_officer_id",
          workflow.approving_officer_id,
          "Approving officer",
        ],
      ])
        if (!text(name!, value ?? ""))
          missing.push(
            t("{role}: select an officer", {
              role: t(
                label as "Field officer" | "Caseworker" | "Approving officer",
              ),
            }),
          );
    } else if (application.status === "FIELD_VERIFICATION") {
      if (!workflow.screened_at)
        missing.push(t("Prior screening missing; return for clarification."));
      if (!text("visit_date", workflow.visit_date ?? ""))
        missing.push(t("Visit date required"));
      if (
        text("field_observations", workflow.field_observations).trim().length <
        5
      )
        missing.push(t("Observations: at least 5 characters"));
      if (
        text("verification_status", workflow.verification_status) !== "VERIFIED"
      )
        missing.push(t("Select Verified before submission"));
      if (
        text("follow_up_questions", workflow.follow_up_questions).trim() &&
        !checked("follow_up_resolved", workflow.follow_up_resolved)
      )
        missing.push(t("Resolve follow-up questions"));
      for (const [key, label] of Object.entries(VERIFICATION_CHECKS))
        if (!checked(key, bools(workflow.verification_checks)[key] === true))
          missing.push(t(label));
    } else if (application.status === "UNDER_REVIEW") {
      if (!workflow.field_submitted_at)
        missing.push(t("A submitted field report is required"));
      if (text("caseworker_notes", workflow.caseworker_notes).trim().length < 5)
        missing.push(t("Review notes: at least 5 characters"));
      if (
        text("review_issues", workflow.review_issues).trim() &&
        !checked("review_issues_resolved", workflow.review_issues_resolved)
      )
        missing.push(t("Resolve recorded issues"));
      for (const [key, label] of Object.entries(REVIEW_CHECKS))
        if (!checked(key, bools(workflow.review_checks)[key] === true))
          missing.push(t(label));
    } else if (
      !closed &&
      (!workflow.screened_at ||
        !workflow.field_submitted_at ||
        !workflow.review_submitted_at)
    )
      missing.push(
        t("Prior manual sign-offs missing. Return the case for clarification."),
      );
    return missing;
  }

  function send(action: WorkflowAction, confirmed = false) {
    if (!form.current || pending) return;
    const data = new FormData(form.current);
    const text = (name: string) => String(data.get(name) ?? "");
    const reason = text("reason").trim();
    if (["RETURN", "RESUME", "REJECT"].includes(action) && reason.length < 5) {
      setReasonError(true);
      setResult({
        ok: false,
        message: t("Enter a reason or resolution of at least 5 characters."),
      });
      form.current
        .querySelector<HTMLTextAreaElement>('[name="reason"]')
        ?.focus();
      return;
    }
    setReasonError(false);
    if (application.status === "PENDING_APPROVAL" && !confirmed) {
      setConfirmation(action);
      dialog.current?.showModal();
      return;
    }
    const common = { reason, confirmed };
    const payload =
      application.status === "SUBMITTED"
        ? {
            ...common,
            screening_notes: text("screening_notes"),
            checklist: checklist.map((item) => ({
              key: item.key,
              status: text(`status:${item.key}`),
              note: text(`note:${item.key}`),
            })),
            field_officer_id: text("field_officer_id"),
            caseworker_id: text("caseworker_id"),
            approving_officer_id: text("approving_officer_id"),
          }
        : application.status === "FIELD_VERIFICATION"
          ? {
              ...common,
              visit_date: text("visit_date"),
              field_observations: text("field_observations"),
              verification_status: text("verification_status"),
              follow_up_questions: text("follow_up_questions"),
              follow_up_resolved: data.get("follow_up_resolved") === "on",
              verification_checks: Object.fromEntries(
                Object.keys(VERIFICATION_CHECKS).map((key) => [
                  key,
                  data.get(key) === "on",
                ]),
              ),
            }
          : application.status === "UNDER_REVIEW"
            ? {
                ...common,
                caseworker_notes: text("caseworker_notes"),
                review_issues: text("review_issues"),
                review_issues_resolved:
                  data.get("review_issues_resolved") === "on",
                review_checks: Object.fromEntries(
                  Object.keys(REVIEW_CHECKS).map((key) => [
                    key,
                    data.get(key) === "on",
                  ]),
                ),
              }
            : common;
    const fingerprint = JSON.stringify({
      action,
      payload,
      version: workflow.version,
    });
    if (request.current?.fingerprint !== fingerprint)
      request.current = { id: crypto.randomUUID(), fingerprint };
    const requestId = request.current.id;
    draft.persist();
    setResult(null);
    startTransition(async () => {
      try {
        const response = await submitWorkflow({
          applicationId: application.id,
          action,
          version: workflow.version,
          requestId,
          payload,
        });
        setResult(response);
        if (response.ok) {
          setValidation(null);
          draft.clear();
          request.current = null;
          dialog.current?.close();
          setConfirmation(null);
        }
      } catch {
        setResult({
          ok: false,
          retryable: true,
          message: t(
            "Connection failed. Your entries are retained. Retry safely.",
          ),
        });
      }
    });
  }

  return (
    <Card id="workflow-actions" className="mb-7 scroll-mt-6 border-primary/25 xl:mb-0" data-testid="workflow-panel">
      <CardHeader>
        <p className="text-xs font-semibold tracking-wide text-primary">
          {closed
            ? t("Completed")
            : t("Step {step} of 4", {
                step: Object.keys(STAGES).indexOf(application.status) + 1,
              })}
        </p>
        <h2 className="text-lg leading-8 font-semibold">
          {closed ? t("Final decision") : stage[locale]}
        </h2>
        <ol
          aria-label={t("Workflow stage")}
          className="grid grid-cols-2 gap-2 pt-3 2xl:grid-cols-4"
        >
          {Object.entries(STAGES).map(([status, entry], index) => {
            const done =
              index === 0
                ? !!workflow.screened_at
                : index === 1
                  ? !!workflow.field_submitted_at
                  : index === 2
                    ? !!workflow.review_submitted_at
                    : closed;
            const current = status === application.status;
            return (
              <li
                key={status}
                aria-current={current ? "step" : undefined}
                className={`rounded-lg border p-3 text-xs leading-6 ${status === application.status ? "border-primary/30 bg-accent text-primary" : "border-border text-muted-foreground"}`}
              >
                <span className="mb-1 block font-semibold">
                  <span aria-hidden="true">
                    {done && !current ? "✓" : `${index + 1}.`}
                  </span>{" "}
                  {entry[locale]}
                </span>
                <span className="block text-xs leading-7">
                  {t(
                    current
                      ? "Current step"
                      : done
                        ? "Completed step"
                        : closed ? "Not recorded" : "Upcoming step",
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </CardHeader>
      <CardContent>
        {workflow.clarification_pending && (
          <div
            className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-8 text-amber-950"
            role="status"
          >
            <p className="font-semibold">{t("Clarification required")}</p>
            <p className="mt-2 whitespace-pre-wrap">{workflow.return_reason}</p>
            <p className="mt-2">
              {t("Return to:")}{" "}
              {stageLabel(
                workflow.return_to_stage ?? application.status,
                locale,
              )}
              .<br />
              {t("Resume to:")} {stageLabel(workflow.resume_status!, locale)}.
            </p>
          </div>
        )}
        {closed ? (
          <div className="space-y-3 text-sm leading-8">
            <p className="flex items-center gap-2 font-semibold">
              <LockKeyhole className="size-4" />
              {t("Final decision locked.")}
            </p>
            <p>
              {t("Decided by:")}{" "}
              {officerLabel(officers.find((person) => person.id === workflow.decided_by)
                ?.full_name ?? t("Legacy record"), locale)}
            </p>
            <p>
              {t("Decision time:")}{" "}
              {workflow.decided_at
                ? new Intl.DateTimeFormat(languageTag(locale), {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(workflow.decided_at))
                : application.processed_at
                  ? formatDate(application.processed_at, locale)
                  : t("Not recorded in legacy data")}
            </p>
            {workflow.decision_reason && (
              <p className="whitespace-pre-wrap">
                {t("Reason:")}
                {workflow.decision_reason}
              </p>
            )}
          </div>
        ) : !editable ? (
          <p className="text-sm leading-8 text-muted-foreground">
            {t("Assigned officer:")}{" "}
            <strong className="text-foreground">
              {owner ? officerLabel(owner.full_name, locale) : t("Not assigned")}
            </strong>{" "}
            · {ROLE_LABELS[stage.role][locale]}.{" "}
            {t("Only the assigned officer can act at this stage.")}
          </p>
        ) : (
          <div>
            {draft.message && (
              <div
                role="status"
                className="mb-5 rounded-lg border border-sky-200 bg-sky-50 p-4 text-xs leading-7 text-sky-950"
                data-testid="draft-recovery"
              >
                <p>{translateMessage(draft.message, locale)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {draft.recovery && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={draft.restoreOlder}
                    >
                      {t("Restore draft")}
                    </Button>
                  )}
                  <Button type="button" variant="ghost" onClick={draft.discard}>
                    {t("Discard draft")}
                  </Button>
                </div>
              </div>
            )}
            <form
              noValidate
              ref={form}
              key={`${application.id}-${workflow.version}`}
              onInput={(event) =>
                setValidation(new FormData(event.currentTarget))
              }
              onSubmit={(event) => {
                event.preventDefault();
                if (application.status !== "PENDING_APPROVAL") send("SAVE");
              }}
            >
              <div
                className="mb-5 rounded-lg border border-border bg-muted/40 p-4"
                data-testid="validation-summary"
                id="workflow-validation"
              >
                <h3 className="text-sm leading-7 font-semibold">
                  {t("Validation summary")}
                </h3>
                {requirements(validation ?? undefined).length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-7 text-muted-foreground">
                    {requirements(validation ?? undefined).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs leading-7 text-teal-900">
                    {t("Entries are ready for server validation.")}
                  </p>
                )}
                <p className="mt-2 text-xs leading-7 text-muted-foreground">
                  {t("You can save incomplete progress as a draft.")}
                </p>
              </div>
              <fieldset disabled={pending} className="min-w-0 space-y-5">
                {application.status === "SUBMITTED" && (
                  <>
                    <p className="text-xs leading-7 text-muted-foreground">
                      {t(
                        "Record document receipt here. This does not upload or verify a file.",
                      )}
                    </p>
                    {checklist.map((item) => (
                      <div
                        key={item.key}
                        className="space-y-3 rounded-lg border border-border p-4"
                      >
                        <label
                          htmlFor={`receipt-${item.key}`}
                          className="block text-sm leading-7 font-medium"
                        >
                          {locale === "kn" ? item.label_kn : item.label_en}
                          {item.required && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t("Required")}
                            </span>
                          )}
                        </label>
                        <select
                          id={`receipt-${item.key}`}
                          name={`status:${item.key}`}
                          defaultValue={item.receipt_status}
                          className={control}
                        >
                          {Object.entries(RECEIPT_STATUS).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {t(label)}
                              </option>
                            ),
                          )}
                        </select>
                        <label className="block text-xs leading-6 text-muted-foreground">
                          {t("Document note")}
                          <input
                            name={`note:${item.key}`}
                            defaultValue={item.note}
                            maxLength={1000}
                            className={`${control} mt-2`}
                          />
                        </label>
                      </div>
                    ))}
                    <label className="block text-sm font-medium">
                      {t("Screening notes")}
                      <textarea
                        name="screening_notes"
                        defaultValue={workflow.screening_notes}
                        maxLength={4000}
                        className={`${textArea} mt-2`}
                      />
                    </label>
                    <div className="grid gap-4 md:grid-cols-3">
                      {(
                        [
                          [
                            "field_officer_id",
                            "FIELD_OFFICER",
                            application.assigned_field_officer_id,
                          ],
                          [
                            "caseworker_id",
                            "CASEWORKER",
                            workflow.caseworker_id,
                          ],
                          [
                            "approving_officer_id",
                            "APPROVING_OFFICER",
                            workflow.approving_officer_id,
                          ],
                        ] as const
                      ).map(([name, role, value]) => (
                        <label
                          key={name}
                          className="block min-w-0 text-sm font-medium"
                        >
                          {ROLE_LABELS[role][locale]}
                          <select
                            name={name}
                            defaultValue={value ?? ""}
                            className={`${control} mt-2`}
                          >
                            <option value="">{t("Select")}</option>
                            {officers
                              .filter((person) => person.role === role)
                              .map((person) => (
                                <option key={person.id} value={person.id}>
                                  {officerLabel(person.full_name, locale)}
                                </option>
                              ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </>
                )}
                {application.status === "FIELD_VERIFICATION" && (
                  <>
                    <div className="rounded-lg bg-muted p-4 text-sm leading-8">
                      <p className="font-medium">{t("Fictional location")}</p>
                      <p>
                        {demoRecordText(application.applicant_name, locale, application.is_demo)} · {locationLabel(application.village, locale)} ·{" "}
                        {locationLabel(application.taluk, locale)} · {locationLabel(application.district, locale)}
                      </p>
                      <a
                        href="#documents"
                        className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
                      >
                        {t("View relevant documents")}
                      </a>
                    </div>
                    <label className="block text-sm font-medium">
                      {t("Visit date")}
                      <input
                        type="date"
                        name="visit_date"
                        defaultValue={workflow.visit_date ?? ""}
                        min={new Date(
                          new Date(application.submitted_at).getTime() +
                            19800000,
                        )
                          .toISOString()
                          .slice(0, 10)}
                        max={today}
                        className={`${control} mt-2`}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      {t("Verification status")}
                      <select
                        name="verification_status"
                        defaultValue={workflow.verification_status}
                        className={`${control} mt-2`}
                      >
                        {Object.entries(VERIFICATION_STATUS).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {t(label)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      {t("Field observations")}
                      <textarea
                        name="field_observations"
                        defaultValue={workflow.field_observations}
                        maxLength={4000}
                        className={`${textArea} mt-2`}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      {t("Follow-up questions")}
                      <textarea
                        name="follow_up_questions"
                        defaultValue={workflow.follow_up_questions}
                        maxLength={4000}
                        className={`${textArea} mt-2`}
                      />
                    </label>
                    <label className="flex min-h-12 items-start gap-3 rounded-lg border border-border p-3 text-sm leading-7">
                      <input
                        name="follow_up_resolved"
                        type="checkbox"
                        defaultChecked={workflow.follow_up_resolved}
                        className="mt-1 size-5 shrink-0 accent-primary"
                      />
                      {t("Follow-up questions resolved")}
                    </label>
                    <div className="space-y-2">
                      {Object.entries(VERIFICATION_CHECKS).map(
                        ([key, label]) => (
                          <label
                            key={key}
                            className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm leading-7"
                          >
                            <input
                              type="checkbox"
                              name={key}
                              defaultChecked={
                                bools(workflow.verification_checks)[key] ===
                                true
                              }
                              className="mt-1 size-5 shrink-0 accent-primary"
                            />
                            {t(label)}
                          </label>
                        ),
                      )}
                    </div>
                  </>
                )}
                {application.status === "UNDER_REVIEW" && (
                  <>
                    <p className="text-sm leading-8 text-muted-foreground">
                      {t(
                        "Review the application, document checklist and submitted field report below.",
                      )}
                    </p>
                    <label className="block text-sm font-medium">
                      {t("Caseworker notes")}
                      <textarea
                        name="caseworker_notes"
                        defaultValue={workflow.caseworker_notes}
                        maxLength={4000}
                        className={`${textArea} mt-2`}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      {t("Issues requiring resolution")}
                      <textarea
                        name="review_issues"
                        defaultValue={workflow.review_issues}
                        maxLength={4000}
                        className={`${textArea} mt-2`}
                      />
                    </label>
                    <label className="flex min-h-12 items-start gap-3 rounded-lg border border-border p-3 text-sm leading-7">
                      <input
                        name="review_issues_resolved"
                        type="checkbox"
                        defaultChecked={workflow.review_issues_resolved}
                        className="mt-1 size-5 shrink-0 accent-primary"
                      />
                      {t("Recorded issues resolved")}
                    </label>
                    <div className="space-y-2">
                      {Object.entries(REVIEW_CHECKS).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm leading-7"
                        >
                          <input
                            type="checkbox"
                            name={key}
                            defaultChecked={
                              bools(workflow.review_checks)[key] === true
                            }
                            className="mt-1 size-5 shrink-0 accent-primary"
                          />
                          {t(label)}
                        </label>
                      ))}
                    </div>
                  </>
                )}
                {application.status === "PENDING_APPROVAL" && (
                  <div>
                    <dl className="mb-4 grid gap-4 rounded-lg border border-border p-4 text-sm leading-8 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {t("Applicant")}
                        </dt>
                        <dd>
                          {demoRecordText(application.applicant_name, locale, application.is_demo)} · {locationLabel(application.village, locale)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {t("Declared income")}
                        </dt>
                        <dd>
                          {formatCurrency(application.annual_income, locale)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {t("Document receipts")}
                        </dt>
                        <dd>
                          {
                            checklist.filter(
                              (item) => item.receipt_status === "RECEIVED",
                            ).length
                          }{" "}
                          / {checklist.length}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {t("Field report")}
                        </dt>
                        <dd>
                          {t(
                            VERIFICATION_STATUS[
                              workflow.verification_status as keyof typeof VERIFICATION_STATUS
                            ],
                          )}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-muted-foreground">
                          {t("Saved review notes")}
                        </dt>
                        <dd className="whitespace-pre-wrap">
                          {workflow.caseworker_notes || t("Not recorded")}
                        </dd>
                      </div>
                    </dl>
                    <p className="text-sm leading-8 text-muted-foreground">
                      {t(
                        "Review the consolidated case below. The decision will be timestamped and locked.",
                      )}
                    </p>
                  </div>
                )}
                <label className="block text-sm font-medium">
                  {workflow.clarification_pending
                    ? t("Resolution")
                    : t("Reason")}
                  <textarea
                    name="reason"
                    maxLength={4000}
                    aria-invalid={reasonError}
                    aria-describedby="workflow-reason-help"
                    className={`${textArea} mt-2`}
                  />
                  <span
                    id="workflow-reason-help"
                    className={`mt-2 block text-xs leading-7 font-normal ${reasonError ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {t(
                      "Required for return, rejection and resume; at least 5 characters.",
                    )}
                  </span>
                </label>
                <div className="flex flex-wrap gap-3 border-t border-border pt-5">
                  {application.status !== "PENDING_APPROVAL" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => send("SAVE")}
                    >
                      <Save />
                      {application.status === "FIELD_VERIFICATION"
                        ? t("Save draft")
                        : application.status === "UNDER_REVIEW"
                          ? t("Save review")
                          : t("Save progress")}
                    </Button>
                  )}
                  {workflow.clarification_pending ? (
                    <Button type="button" onClick={() => send("RESUME")}>
                      <RotateCcw />
                      {t("Resume")}
                    </Button>
                  ) : application.status === "PENDING_APPROVAL" ? (
                    <>
                      <Button type="button" onClick={() => send("APPROVE")}>
                        <Check />
                        {t("Approve")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-rose-200 text-rose-900 hover:bg-rose-50"
                        onClick={() => send("REJECT")}
                      >
                        {t("Reject")}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" onClick={() => send("ADVANCE")}>
                      <ArrowRight />
                      {application.status === "SUBMITTED"
                        ? t("Send to field")
                        : application.status === "FIELD_VERIFICATION"
                          ? t("Submit field report")
                          : t("Forward to decision")}
                    </Button>
                  )}
                  {(!workflow.clarification_pending ||
                    application.status !== "SUBMITTED") && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-11 whitespace-normal text-left leading-7"
                      onClick={() => send("RETURN")}
                    >
                      <RotateCcw />
                      {t("Return for clarification")}
                    </Button>
                  )}
                </div>
              </fieldset>
              {pending && (
                <p role="status" className="mt-4 text-sm text-primary">
                  {t("Saving…")}
                </p>
              )}
            </form>
          </div>
        )}
        {result && (
          <div
            role={result.ok ? "status" : "alert"}
            className={`mt-5 rounded-lg border p-4 text-sm leading-8 ${result.ok ? "border-teal-200 bg-teal-50 text-teal-950" : "border-rose-200 bg-rose-50 text-rose-950"}`}
          >
            <p>{translateMessage(result.message, locale)}</p>
            {!result.ok && (
              <button
                type="button"
                className="mt-2 min-h-11 text-sm font-medium underline underline-offset-4"
                onClick={() => router.refresh()}
              >
                {t("Reload latest case")}
              </button>
            )}
          </div>
        )}
      </CardContent>
      <dialog
        ref={dialog}
        onCancel={() => setConfirmation(null)}
        className="m-auto max-h-[calc(100svh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-white p-5 text-foreground shadow-xl backdrop:bg-slate-950/40 sm:p-6"
        aria-labelledby="workflow-confirm-title"
      >
        <AlertCircle className="mb-3 size-6 text-primary" />
        <h2
          id="workflow-confirm-title"
          className="text-lg leading-8 font-semibold"
        >
          {t("Confirm decision")}
        </h2>
        <p className="mt-4 text-sm leading-8">
          {application.reference_number} · {demoRecordText(application.applicant_name, locale, application.is_demo)}
        </p>
        <p className="mt-2 text-sm leading-8">
          {confirmation && labelForAction(confirmation)}
        </p>
        <p className="mt-2 text-sm leading-8 text-muted-foreground">
          {t(confirmation === "RETURN" ? "The application will return for clarification. Its history will be retained." : "Approval or rejection locks this case.")}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              dialog.current?.close();
              setConfirmation(null);
            }}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="button"
            disabled={pending}
            variant={confirmation === "REJECT" ? "destructive" : "default"}
            onClick={() => confirmation && send(confirmation, true)}
          >
            {pending ? t("Saving…") : t("Confirm")}
          </Button>
        </div>
        {result && !result.ok && (
          <p role="alert" className="mt-4 text-sm leading-8 text-rose-900">
            {translateMessage(result.message, locale)}
          </p>
        )}
      </dialog>
    </Card>
  );
}
