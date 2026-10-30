import type { Database } from "./database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Application = Database["public"]["Tables"]["applications"]["Row"];
export type ApplicationDocument =
  Database["public"]["Tables"]["application_documents"]["Row"];
export type ApplicationNote =
  Database["public"]["Tables"]["application_notes"]["Row"];
export type ApplicationEvent =
  Database["public"]["Tables"]["application_events"]["Row"];
export type ApplicationStatus =
  Database["public"]["Enums"]["application_status"];
export type ApplicationWorkflow =
  Database["public"]["Tables"]["application_workflow"]["Row"];
export type ChecklistItem =
  Database["public"]["Tables"]["application_checklist"]["Row"];

export type ApplicationWorklist = Application & {
  effective_target_date: string;
  is_pending: boolean;
  days_pending: number;
  stage_waiting_days: number;
  recently_processed: boolean;
  unresolved_action_count: number;
  is_overdue: boolean;
  days_overdue: number;
  priority_rank: number;
  priority: import("@/lib/application-filters").Priority;
  priority_reasons: string[];
  clarification_pending: boolean;
  resume_status: ApplicationStatus | null;
  workflow_version: number;
  today: string;
};
