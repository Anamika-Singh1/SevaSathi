"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import {
  createApplication,
  type CreateApplicationResult,
} from "@/app/(workspace)/applications/new/actions";
import { useI18n } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { translateMessage } from "@/lib/i18n";
import { locationLabel } from "@/lib/i18n/records";
import { INTAKE_DOCUMENTS } from "@/lib/application-intake";

type Fields = {
  applicant_name: string;
  village: string;
  annual_income: string;
  purpose: string;
  certificate_type: "INCOME";
  application_date: string;
  notes: string;
};
const fieldOrder = ["applicant_name", "village", "certificate_type", "application_date", "annual_income", "purpose", "documents", "notes"] as const;
type FieldName = (typeof fieldOrder)[number];

export function ApplicationCreateForm({
  requestId,
  district,
  taluk,
  today,
}: {
  requestId: string;
  district: string;
  taluk: string;
  today: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const request = useRef(requestId);
  const inFlight = useRef(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreateApplicationResult | null>(null);
  const [fields, setFields] = useState<Fields>({
    applicant_name: "",
    village: "",
    annual_income: "",
    purpose: "",
    certificate_type: "INCOME",
    application_date: today,
    notes: "",
  });
  const [received, setReceived] = useState<string[]>([]);
  const busy = pending || result?.ok === true;
  const errors = result?.ok === false ? result.fieldErrors : undefined;
  const errorFor = (name: FieldName) => errors?.[name]?.[0];
  const describedBy = (name: FieldName) =>
    `application-${name}-help${errorFor(name) ? ` application-${name}-error` : ""}`;
  const fieldError = (name: FieldName) =>
    errorFor(name) ? (
      <p id={`application-${name}-error`} className="text-sm leading-7 text-destructive">
        {translateMessage(errorFor(name)!, locale)}
      </p>
    ) : null;

  useEffect(() => {
    if (pending || !result || result.ok) return;
    const firstInvalid = fieldOrder.find((name) => result.fieldErrors?.[name]?.length);
    if (firstInvalid) {
      form.current?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${firstInvalid}"]`)?.focus();
    }
  }, [pending, result]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setResult(null);
    // Keep this form's identity after failures and edits. A lost response may
    // already have committed the application; a retry must resolve that receipt.
    const input = {
      requestId: request.current,
      ...fields,
      documents: INTAKE_DOCUMENTS.map(({ key }) => ({
        key, status: received.includes(key) ? "RECEIVED" : "MISSING",
      })),
    };
    startTransition(async () => {
      try {
        const response = await createApplication(input);
        setResult(response);
        if (response.ok) router.push(`/applications/${response.applicationId}`);
      } catch {
        setResult({
          ok: false,
          message: t("Unable to create the application. Your entries are retained. Retry safely."),
        });
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <Card className="min-w-0 max-w-3xl">
      <CardHeader>
        <h2 className="text-base leading-8 font-semibold">
          {t("Enter applicant details to begin document screening.")}
        </h2>
        <p className="text-sm leading-7 text-muted-foreground">
          {t("Enter fictional details for this demonstration.")}
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-6 rounded-lg border border-border bg-muted/50 p-4">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="application-district" className="text-xs leading-7 text-muted-foreground">{t("District")}</label>
              <Input id="application-district" value={locationLabel(district, locale)} readOnly aria-readonly="true" />
            </div>
            <div className="min-w-0">
              <label htmlFor="application-taluk" className="text-xs leading-7 text-muted-foreground">{t("Taluk")}</label>
              <Input id="application-taluk" value={locationLabel(taluk, locale)} readOnly aria-readonly="true" />
            </div>
          </div>
          <p className="mt-3 text-xs leading-7 text-muted-foreground">
            {t("Your profile determines the district and taluk. New applications start at document screening.")}
          </p>
        </div>
        <form ref={form} method="post" noValidate onSubmit={submit} data-testid="application-create-form">
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className="min-w-0 space-y-2">
              <label htmlFor="application-applicant_name" className="block text-sm leading-7 font-semibold">
                {t("Applicant name")}
              </label>
              <Input
                id="application-applicant_name" name="applicant_name" required maxLength={120}
                autoComplete="off" value={fields.applicant_name}
                onChange={(event) => setFields((value) => ({ ...value, applicant_name: event.target.value }))}
                aria-invalid={!!errorFor("applicant_name")} aria-describedby={describedBy("applicant_name")}
              />
              <p id="application-applicant_name-help" className="text-xs leading-7 text-muted-foreground">
                {t("Enter the applicant name (1–120 characters).")}
              </p>
              {fieldError("applicant_name")}
            </div>
            <div className="min-w-0 space-y-2">
              <label htmlFor="application-village" className="block text-sm leading-7 font-semibold">{t("Village")}</label>
              <Input
                id="application-village" name="village" required maxLength={120}
                autoComplete="off" value={fields.village}
                onChange={(event) => setFields((value) => ({ ...value, village: event.target.value }))}
                aria-invalid={!!errorFor("village")} aria-describedby={describedBy("village")}
              />
              <p id="application-village-help" className="text-xs leading-7 text-muted-foreground">
                {t("Enter a village (1–120 characters).")}
              </p>
              {fieldError("village")}
            </div>
            <div className="grid min-w-0 gap-5 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <label htmlFor="application-certificate_type" className="block text-sm leading-7 font-semibold">{t("Certificate type")}</label>
                <select id="application-certificate_type" name="certificate_type" required
                  value={fields.certificate_type} onChange={() => setFields((value) => ({ ...value, certificate_type: "INCOME" }))}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-input bg-white px-3 py-2 text-sm leading-7"
                  aria-invalid={!!errorFor("certificate_type")} aria-describedby={describedBy("certificate_type")}
                >
                  <option value="INCOME">{t("Income certificate")}</option>
                </select>
                <p id="application-certificate_type-help" className="text-xs leading-7 text-muted-foreground">{t("Select the income certificate service.")}</p>
                {fieldError("certificate_type")}
              </div>
              <div className="min-w-0 space-y-2">
                <label htmlFor="application-application_date" className="block text-sm leading-7 font-semibold">{t("Application date")}</label>
                <Input id="application-application_date" name="application_date" type="date" required min="1900-01-01" max={today}
                  value={fields.application_date} onChange={(event) => setFields((value) => ({ ...value, application_date: event.target.value }))}
                  aria-invalid={!!errorFor("application_date")} aria-describedby={describedBy("application_date")}
                />
                <p id="application-application_date-help" className="text-xs leading-7 text-muted-foreground">{t("Enter a valid application date, today or earlier.")}</p>
                {fieldError("application_date")}
              </div>
            </div>
            <div className="min-w-0 space-y-2">
              <label htmlFor="application-annual_income" className="block text-sm leading-7 font-semibold">{t("Annual income (₹)")}</label>
              <Input
                id="application-annual_income" name="annual_income" type="number" min="0" max="9999999999.99"
                step="0.01" inputMode="decimal" required value={fields.annual_income}
                onChange={(event) => setFields((value) => ({ ...value, annual_income: event.target.value }))}
                aria-invalid={!!errorFor("annual_income")} aria-describedby={describedBy("annual_income")}
              />
              <p id="application-annual_income-help" className="text-xs leading-7 text-muted-foreground">
                {t("Enter annual income from 0 to 9999999999.99, with at most two decimal places.")}
              </p>
              {fieldError("annual_income")}
            </div>
            <div className="min-w-0 space-y-2">
              <label htmlFor="application-purpose" className="block text-sm leading-7 font-semibold">{t("Purpose")}</label>
              <textarea
                id="application-purpose" name="purpose" required maxLength={500} rows={4}
                className="min-h-28 w-full min-w-0 rounded-lg border border-input bg-white px-3 py-2 text-base leading-8 disabled:opacity-50"
                value={fields.purpose}
                onChange={(event) => setFields((value) => ({ ...value, purpose: event.target.value }))}
                aria-invalid={!!errorFor("purpose")} aria-describedby={describedBy("purpose")}
              />
              <p id="application-purpose-help" className="text-xs leading-7 text-muted-foreground">
                {t("Enter a purpose (1–500 characters).")}
              </p>
              {fieldError("purpose")}
            </div>
            <fieldset className="min-w-0 space-y-3" aria-describedby={describedBy("documents")}>
              <legend className="text-sm leading-7 font-semibold">{t("Required documents")}</legend>
              <p id="application-documents-help" className="text-xs leading-7 text-muted-foreground">
                {t("Mark the documents received. Missing documents remain on the screening checklist; no files are uploaded here.")}
              </p>
              {INTAKE_DOCUMENTS.map(({ key, label }) => (
                <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm leading-7">
                  <input type="checkbox" name="documents" value={key} checked={received.includes(key)}
                    className="size-5 shrink-0 accent-primary" aria-invalid={!!errorFor("documents")}
                    onChange={(event) => setReceived((items) => event.target.checked ? [...items, key] : items.filter((item) => item !== key))}
                  />
                  {t(label)}
                </label>
              ))}
              {fieldError("documents")}
            </fieldset>
            <div className="min-w-0 space-y-2">
              <label htmlFor="application-notes" className="block text-sm leading-7 font-semibold">{t("Notes (optional)")}</label>
              <textarea id="application-notes" name="notes" rows={3} maxLength={4000}
                className="min-h-28 w-full min-w-0 rounded-lg border border-input bg-white px-3 py-2 text-base leading-8 disabled:opacity-50"
                value={fields.notes} onChange={(event) => setFields((value) => ({ ...value, notes: event.target.value }))}
                aria-invalid={!!errorFor("notes")} aria-describedby={describedBy("notes")}
              />
              <p id="application-notes-help" className="text-xs leading-7 text-muted-foreground">{t("Notes must contain at most 4000 characters.")}</p>
              {fieldError("notes")}
            </div>
          </fieldset>
          <div className="mt-5" aria-live="polite">
            {result?.ok === false && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-8 text-red-800">
                {translateMessage(result.message, locale)}
              </p>
            )}
            {result?.ok && (
              <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm leading-8 text-teal-950">
                {t("Application created. Opening document screening…")} {result.referenceNumber}
              </p>
            )}
          </div>
          <div className="mt-5 flex min-w-0 flex-wrap gap-3 border-t border-border pt-5">
            <Button type="submit" disabled={busy} aria-busy={busy} className="min-w-0 max-w-full whitespace-normal">
              <LoaderCircle className={pending ? "animate-spin" : "hidden"} aria-hidden="true" />
              <Plus className={pending ? "hidden" : ""} aria-hidden="true" />
              <span hidden={pending}>{t("Create application")}</span>
              <span hidden={!pending}>{t("Creating application…")}</span>
            </Button>
            <Button asChild variant="outline">
              <Link href="/applications" aria-disabled={busy} tabIndex={busy ? -1 : undefined}
                onClick={(event) => { if (busy) event.preventDefault(); }}
              >
                {t("Cancel")}
              </Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
