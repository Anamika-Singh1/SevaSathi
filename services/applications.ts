import "server-only";
import { cache } from "react";
import { requireOfficer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { applicationIdSchema } from "@/lib/validation";
import {
  PAGE_SIZE,
  parseApplicationFilters,
  applicationSearchExpression,
  type ApplicationFilters,
} from "@/lib/application-filters";
import type { ApplicationWorklist, ApplicationEvent } from "@/types/domain";

const loadError = () =>
  new Error(
    "ಅರ್ಜಿಗಳನ್ನು ಪಡೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. / Unable to load applications. Check Supabase migrations and connectivity.",
  );

export async function listApplications(
  input: Partial<ApplicationFilters> & { limit?: number } = {},
) {
  await requireOfficer();
  const supabase = await createClient();
  const filters = { ...parseApplicationFilters({}), ...input };
  const pageSize = Math.max(1, Math.min(input.limit ?? PAGE_SIZE, 100));
  const filteredQuery = (head = false) => {
    let query = supabase
      .from("application_worklist")
      .select("*", { count: "exact", head });
    if (filters.q) query = query.or(applicationSearchExpression(filters.q));
    if (filters.status)
      query = query.eq(
        "status",
        filters.status as ApplicationWorklist["status"],
      );
    if (filters.village) query = query.eq("village", filters.village);
    if (filters.priority) query = query.eq("priority", filters.priority);
    if (filters.overdue)
      query = query.eq("is_overdue", filters.overdue === "yes");
    if (filters.view === "pending") query = query.eq("is_pending", true);
    if (filters.view === "attention") query = query.eq("priority_rank", 3);
    if (filters.view === "final-review")
      query = query.in("status", ["UNDER_REVIEW", "PENDING_APPROVAL"]);
    if (filters.view === "recent") query = query.eq("recently_processed", true);
    return query;
  };
  const total = await filteredQuery(true);
  if (total.error) throw loadError();
  const count = total.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const page = Math.min(filters.page, totalPages);
  let query = filteredQuery();
  if (filters.sort === "priority")
    query = query
      .order("priority_rank", { ascending: false })
      .order("effective_target_date", { ascending: true });
  else if (filters.sort === "target")
    query = query
      .order("is_pending", { ascending: false })
      .order("effective_target_date", { ascending: true });
  else if (filters.sort === "recent")
    query = query.order("processed_at", {
      ascending: false,
      nullsFirst: false,
    });
  else
    query = query
      .order("is_pending", { ascending: false })
      .order("submitted_at", { ascending: true });
  const { data, error } = await query
    .order("id")
    .range((page - 1) * pageSize, page * pageSize - 1)
    .overrideTypes<ApplicationWorklist[], { merge: false }>();
  if (error) throw loadError();
  return { applications: data, count, page, totalPages, pageSize };
}

export const getWorkflowSettings = cache(async () => {
  await requireOfficer();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_demo_settings")
    .select("*")
    .single();
  if (error) throw loadError();
  return data;
});

export async function getVillages() {
  await requireOfficer();
  const supabase = await createClient();
  const villages: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("application_villages")
      .select("village")
      .order("village")
      .range(offset, offset + 499);
    if (error) throw loadError();
    villages.push(...data.flatMap((row) => (row.village ? [row.village] : [])));
    if (data.length < 500) break;
  }
  return villages;
}

export async function getApplication(id: string) {
  await requireOfficer();
  if (!applicationIdSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data: application, error } = await supabase
    .from("application_worklist")
    .select("*")
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<ApplicationWorklist, { merge: false }>();
  if (error) throw loadError();
  if (!application) return null;
  const [documents, notes, events, assigned, workflow, checklist, officers] =
    await Promise.all([
      supabase
        .from("application_documents")
        .select("*")
        .eq("application_id", id)
        .order("created_at"),
      supabase
        .from("application_notes")
        .select("*")
        .eq("application_id", id)
        .order("created_at", { ascending: false }),
      loadApplicationHistory(supabase, id),
      supabase.rpc("application_assigned_officer", { target_id: id }),
      supabase
        .from("application_workflow")
        .select("*")
        .eq("application_id", id)
        .single(),
      supabase
        .from("application_checklist")
        .select("*")
        .eq("application_id", id)
        .order("key"),
      supabase.rpc("workflow_officers", { target_id: id }),
    ]);
  if (
    documents.error ||
    notes.error ||
    events.error ||
    assigned.error ||
    workflow.error ||
    checklist.error ||
    officers.error
  )
    throw loadError();
  return {
    application,
    documents: documents.data,
    notes: notes.data,
    events: events.data,
    assignedOfficer: assigned.data[0] ?? null,
    workflow: workflow.data,
    checklist: checklist.data,
    officers: officers.data,
  };
}

async function loadApplicationHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
) {
  const records: ApplicationEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("application_events")
      .select("*")
      .eq("application_id", id)
      .order("created_at")
      .order("sequence")
      .range(offset, offset + 499);
    if (error) throw loadError();
    records.push(...data);
    if (data.length < 500) break;
  }
  return { data: records, error: null };
}

export async function getApplicationStats() {
  await requireOfficer();
  const supabase = await createClient();
  const base = () =>
    supabase
      .from("application_worklist")
      .select("id", { count: "exact", head: true });
  const queries = {
    pending: base().eq("is_pending", true),
    attention: base().eq("priority_rank", 3),
    field: base().eq("status", "FIELD_VERIFICATION"),
    review: base().in("status", ["UNDER_REVIEW", "PENDING_APPROVAL"]),
    overdue: base().eq("is_overdue", true),
    recent: base().eq("recently_processed", true),
  };
  const results = await Promise.all(
    Object.entries(queries).map(async ([key, query]) => {
      const { count, error } = await query;
      if (error) throw loadError();
      return [key, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(results) as Record<keyof typeof queries, number>;
}

export async function getDashboardApplications() {
  await requireOfficer();
  const supabase = await createClient();
  const [queue, recent, screening] = await Promise.all([
    supabase
      .from("application_worklist")
      .select("*")
      .gte("priority_rank", 2)
      .order("priority_rank", { ascending: false })
      .order("effective_target_date")
      .order("submitted_at")
      .order("id")
      .limit(5)
      .overrideTypes<ApplicationWorklist[], { merge: false }>(),
    supabase
      .from("application_worklist")
      .select("*")
      .eq("recently_processed", true)
      .order("processed_at", { ascending: false })
      .order("id")
      .limit(3)
      .overrideTypes<ApplicationWorklist[], { merge: false }>(),
    supabase
      .from("application_worklist")
      .select("*")
      .eq("status", "SUBMITTED")
      .order("created_at", { ascending: false })
      .order("id")
      .limit(5)
      .overrideTypes<ApplicationWorklist[], { merge: false }>(),
  ]);
  if (queue.error || recent.error || screening.error) throw loadError();
  return { queue: queue.data, recent: recent.data, screening: screening.data };
}
