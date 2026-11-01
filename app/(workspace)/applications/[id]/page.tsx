import { getI18n } from "@/lib/i18n/server";
import { eventLabel, priorityReason, certificateLabel, locationLabel, officerLabel, documentLabel, demoRecordText } from "@/lib/i18n/records";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, CircleCheck, ClipboardList } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { PriorityGuide } from "@/components/priority-guide";
import { WorkflowPanel } from "@/components/workflow-panel";
import { WorkflowHistory } from "@/components/workflow-history";
import { AiAssistantPanel } from "@/components/ai-assistant-panel";
import { RecordedTextReadingView } from "@/components/recorded-text-reading-view";
import { readingFields } from "@/lib/ai/reading-view";
import { canUseAi, featureForRole } from "@/lib/ai/contracts";
import { requireOfficer } from "@/lib/auth";
import {
  RECEIPT_STATUS,
  VERIFICATION_CHECKS,
  REVIEW_CHECKS,
  VERIFICATION_STATUS,
  assignedActorId,
} from "@/lib/workflow";
import { getApplication } from "@/services/applications";
import { formatDate, formatCurrency } from "@/lib/utils";

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { t, locale } = await getI18n();

  const record = await getApplication((await params).id);
  if (!record) notFound();
  const query = await searchParams;
  const {
    application,
    documents,
    notes,
    events,
    assignedOfficer,
    workflow,
    checklist,
    officers,
  } = record;
  const { profile } = await requireOfficer();
  const responsibleId = assignedActorId(application, workflow) ?? workflow.decided_by;
  const responsible = officers.find(person => person.id === responsibleId);
  const caseFacts: { label: string; value: string; attention?: boolean }[] = [
    { label: t("Declared annual income"), value: formatCurrency(application.annual_income, locale) },
    { label: t("Target date"), value: formatDate(application.effective_target_date, locale), attention: application.is_overdue },
    { label: t("Responsible officer"), value: responsible ? officerLabel(responsible.full_name, locale) : t(application.is_pending ? "Not assigned" : "Not recorded") },
  ];
  const checks = (value: unknown) =>
    value && typeof value === "object"
      ? (value as Record<string, boolean>)
      : {};
  const fields = [
    [t("Applicant"), demoRecordText(application.applicant_name, locale, application.is_demo)],
    [t("Application status"), t(application.processing_status === "APPROVED" ? "Approved" : application.processing_status === "REJECTED" ? "Rejected" : "Pending")],
    [t("Certificate type"), certificateLabel(application.certificate_type, locale)],
    [t("Village"), locationLabel(application.village, locale)],
    [t("District"), locationLabel(application.district, locale)],
    [t("Taluk"), locationLabel(application.taluk, locale)],
    [
      t("Declared annual income"),
      formatCurrency(application.annual_income, locale),
    ],
    [t("Purpose"), demoRecordText(application.purpose, locale, application.is_demo)],
    [
      t("Assigned field officer"),
      assignedOfficer ? officerLabel(assignedOfficer.full_name, locale) : t("Not assigned"),
    ],
  ];
  const dates = [
    [t("Submitted"), formatDate(application.submitted_at, locale)],
    [t("Stage entered"), formatDate(application.stage_entered_at, locale)],
    [t("Target date"), formatDate(application.effective_target_date, locale)],
    [t("Last updated"), formatDate(application.updated_at, locale)],
    [
      t("Days pending"),
      t(
        application.is_pending
          ? "{count} days"
          : "{count} days (total before completion)",
        { count: application.days_pending },
      ),
    ],
    [
      t("Stage waiting"),
      t("{count} days", { count: application.stage_waiting_days }),
    ],
    ...(application.processed_at
      ? [[t("Processed"), formatDate(application.processed_at, locale)]]
      : []),
  ];
  return (
    <>
      <Link
        href="/applications"
        className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4 shrink-0" />
        {t("Back to applications")}
      </Link>
      <PageHeading
        title={application.reference_number}
        description={`${demoRecordText(application.applicant_name, locale, application.is_demo)} · ${locationLabel(application.village, locale)}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={application.status} />
          <PriorityBadge priority={application.priority} />
        </div>
      </PageHeading>
      {query.created === "1" && application.status === "SUBMITTED" && events.some(event => event.event_type === "APPLICATION_CREATED") && (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm leading-7 text-teal-950">
          <CircleCheck className="mt-1 size-4 shrink-0" aria-hidden="true" />
          {t("Application created. Document screening is ready.")}
        </p>
      )}
      <dl className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-border bg-white p-4 sm:grid-cols-3 sm:p-5">
        {caseFacts.map(({ label, value, attention }, index) => (
          <div key={label} className={`min-w-0 ${index === 2 ? "col-span-2 sm:col-span-1" : ""}`}>
            <dt className="text-xs leading-7 text-muted-foreground">{label}</dt>
            <dd className={`mt-1 text-sm leading-8 font-semibold ${attention ? "text-rose-800" : "text-foreground"}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <nav
        aria-label={t("Application sections")}
        className="mb-6 flex flex-wrap gap-x-3 gap-y-1 border-b border-border pb-3"
      >
        {[
          ["workflow-actions", t("Workflow actions")],
          ["ai-assistance", t("AI assistance")],
          ["overview", t("Overview")],
          ["documents", t("Document checklist")],
          ["field-verification", t("Field verification")],
          ["caseworker-review", t("Caseworker review")],
          ["translated-reading", t("Translated reading view")],
          ["history", t("Application history")],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="flex min-h-11 min-w-0 max-w-full items-center rounded px-2 py-2 text-sm leading-7 text-primary underline-offset-4 transition-colors hover:bg-accent hover:underline"
          >
            <span className="font-medium">{label}</span>
          </a>
        ))}
      </nav>
      <div className="mb-6 grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <WorkflowPanel
          application={application}
          workflow={workflow}
          checklist={checklist}
          officers={officers}
          officer={{ id: profile.id, role: profile.role }}
          today={application.today}
        />
        <AiAssistantPanel
          key={`${application.id}-${workflow.version}-${profile.id}`}
          applicationId={application.id}
          version={workflow.version}
          feature={featureForRole(profile.role)}
          allowed={canUseAi(featureForRole(profile.role), record, profile)}
          closed={["APPROVED", "REJECTED"].includes(application.status)}
        />
      </div>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card id="overview" className="scroll-mt-6">
            <CardHeader>
              <h2 className="text-base leading-8 font-semibold">
                {t("Application overview")}
              </h2>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-6 sm:grid-cols-2">
                {fields.map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs leading-6 text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-2 text-sm leading-8 font-medium break-words">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <RecordedTextReadingView
            key={`reading-${application.id}-${workflow.version}`}
            applicationId={application.id}
            version={workflow.version}
            fields={readingFields(record)}
          />
          <Card id="documents" className="scroll-mt-6">
            <CardHeader>
              <h2 className="text-base leading-8 font-semibold">
                {t("Document checklist")}
              </h2>
              <p className="text-xs leading-6 text-muted-foreground">
                {t(
                  "Officer-recorded document receipt and notes.",
                )}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {checklist.map((item) => (
                <div
                  key={item.key}
                  className="rounded-lg border border-border p-4 text-sm leading-8"
                >
                  <p className="font-medium">
                    {locale === "kn" ? item.label_kn : item.label_en}
                  </p>
                  <p
                    className={
                      item.receipt_status === "RECEIVED"
                        ? "text-teal-900"
                        : "text-amber-900"
                    }
                  >
                    {t(
                      RECEIPT_STATUS[
                        item.receipt_status as keyof typeof RECEIPT_STATUS
                      ],
                    )}
                  </p>
                  {item.note && (
                    <p className="text-xs text-muted-foreground">{item.note}</p>
                  )}
                </div>
              ))}
              <div className="rounded-lg bg-muted p-4">
                <p className="text-xs font-medium">{t("Screening notes")}</p>
                <p className="mt-2 text-sm leading-8 whitespace-pre-wrap">
                  {workflow.screening_notes || t("Not recorded")}
                </p>
              </div>
              {documents.length ? (
                documents.map((document) => (
                  <div
                    key={document.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-4"
                  >
                    <FileText className="mt-1 size-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-sm leading-7 font-medium">
                        {documentLabel(document.document_type, locale)}
                      </p>
                      <p
                        lang={locale}
                        className="mt-2 text-xs leading-6 break-all text-muted-foreground"
                      >
                        {document.file_name}
                      </p>
                      <p className="mt-2 text-xs leading-7 text-muted-foreground">
                        {t("File viewing is unavailable in this workspace.")}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("Recorded:")}{" "}
                        {formatDate(document.created_at, locale)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-muted-foreground">
                  {t("No document metadata recorded.")}
                </p>
              )}
            </CardContent>
          </Card>
          <Card id="field-verification" className="scroll-mt-6">
            <CardHeader>
              <h2 className="text-base leading-8 font-semibold">
                {t("Field verification report")}
              </h2>
            </CardHeader>
            <CardContent>
              <ClipboardList className="mb-3 size-5 text-primary" />
              <p className="mb-3 text-xs leading-7 text-muted-foreground">
                {locationLabel(application.village, locale)} · {locationLabel(application.taluk, locale)} ·{" "}
                {locationLabel(application.district, locale)} {t("Fictional location")}
              </p>
              <p className="mb-3 text-sm font-medium">
                {t(
                  VERIFICATION_STATUS[
                    workflow.verification_status as keyof typeof VERIFICATION_STATUS
                  ],
                )}{" "}
                ·{" "}
                {workflow.field_submitted_at
                  ? t("Submitted report")
                  : t("Not submitted")}
              </p>
              <p className="text-sm leading-8 whitespace-pre-wrap">
                {workflow.field_observations ||
                  demoRecordText(application.field_report ?? "", locale, application.is_demo) ||
                  t("No field report has been recorded.")}
              </p>
              <p className="mt-4 text-xs leading-7 text-muted-foreground">
                {t("Visit:")}{" "}
                {workflow.visit_date
                  ? formatDate(workflow.visit_date, locale)
                  : "—"}{" "}
                {t("Submitted:")}{" "}
                {workflow.field_submitted_at
                  ? formatDate(workflow.field_submitted_at, locale)
                  : "—"}
              </p>
              <ul className="mt-3 space-y-2 text-xs leading-7">
                {Object.entries(VERIFICATION_CHECKS).map(([key, label]) => (
                  <li key={key}>
                    {checks(workflow.verification_checks)[key] ? "✓" : "○"}{" "}
                    {t(label)}
                  </li>
                ))}
              </ul>
              {workflow.follow_up_questions && (
                <div className="mt-4 rounded-lg border border-border p-4">
                  <h3 className="text-sm font-semibold">
                    {t("Follow-up questions")}
                  </h3>
                  <p className="mt-2 text-sm leading-8 whitespace-pre-wrap">
                    {workflow.follow_up_questions}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {workflow.follow_up_resolved
                      ? t("Resolved")
                      : t("Unresolved")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card id="caseworker-review" className="scroll-mt-6">
            <CardHeader>
              <h2 className="text-base leading-8 font-semibold">
                {t("Caseworker review")}
              </h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm leading-8 whitespace-pre-wrap">
                  {workflow.caseworker_notes ||
                    t("Caseworker notes not recorded")}
                </p>
                <ul className="mt-3 space-y-2 text-xs leading-7">
                  {Object.entries(REVIEW_CHECKS).map(([key, label]) => (
                    <li key={key}>
                      {checks(workflow.review_checks)[key] ? "✓" : "○"}{" "}
                      {t(label)}
                    </li>
                  ))}
                </ul>
              </div>
              {workflow.review_issues && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
                  <h3 className="text-sm font-semibold">
                    {t("Issues requiring resolution")}
                  </h3>
                  <p className="mt-2 text-sm leading-8 whitespace-pre-wrap">
                    {workflow.review_issues}
                  </p>
                  <p className="mt-2 text-xs">
                    {workflow.review_issues_resolved
                      ? t("Resolved")
                      : t("Unresolved")}
                  </p>
                </div>
              )}
              <details className="rounded-lg border border-border p-4">
                <summary className="min-h-11 cursor-pointer text-sm leading-8 font-medium">
                  {t("Prior clarification history")}
                </summary>
                <ol className="mt-3 space-y-4">
                  {events
                    .filter((event) =>
                      [
                        "RETURNED_FOR_CLARIFICATION",
                        "APPLICATION_RESUMED",
                      ].includes(event.event_type),
                    )
                    .map((event) => (
                      <li
                        key={event.id}
                        className="border-l-2 border-primary/20 pl-3 text-xs leading-7"
                      >
                        <p className="font-medium">
                          {eventLabel(event.event_type, locale)}
                        </p>
                        <p>
                          {officerLabel(event.actor_name, locale)} ·{" "}
                          {formatDate(event.created_at, locale)}
                        </p>
                        <p className="whitespace-pre-wrap">{event.reason}</p>
                      </li>
                    ))}
                </ol>
                {!events.some(
                  (event) => event.event_type === "RETURNED_FOR_CLARIFICATION",
                ) && (
                  <p className="text-xs text-muted-foreground">
                    {t("No prior clarification")}
                  </p>
                )}
              </details>
              {notes.length ? (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="border-l-2 border-primary/30 pl-4"
                  >
                    <p className="text-sm leading-8 whitespace-pre-wrap">
                      {demoRecordText(note.body, locale, application.is_demo)}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDate(note.created_at, locale)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-muted-foreground">
                  {t("No review notes recorded.")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          <Card className="border-primary/20">
            <CardHeader>
              <h2 className="text-base leading-8 font-semibold">
                {t("Stage & priority")}
              </h2>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap gap-2">
                <StatusBadge status={application.status} />
                <PriorityBadge priority={application.priority} />
              </div>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-8">
                {application.priority_reasons.map((reason) => (
                  <li key={reason}>{priorityReason(reason, locale)}</li>
                ))}
              </ul>
              {application.unresolved_actions.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <h3 className="text-sm font-semibold">
                    {t("Unresolved actions")}
                  </h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-8">
                    {application.unresolved_actions.map((action, index) => (
                      <li key={index}>{demoRecordText(action, locale, application.is_demo)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <h2 className="text-base leading-8 font-semibold">
                {t("Application dates")}
              </h2>
            </CardHeader>
            <CardContent>
              <dl className="space-y-5">
                {dates.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs leading-6 text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-1 text-sm leading-7 font-medium">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Card id="history" className="scroll-mt-6">
            <CardHeader>
              <h2 className="text-base leading-8 font-semibold">
                {t("Application history")}
              </h2>
            </CardHeader>
            <CardContent>
              <WorkflowHistory events={events} checklist={checklist} />
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="mt-7">
        <PriorityGuide />
      </div>
    </>
  );
}
