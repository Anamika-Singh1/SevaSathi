
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "application_checklist": {
                  Row: {
                    "application_id": string,"key": string,"label_en": string,"label_kn": string,"note": string,"receipt_status": string,"required": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"key": string,"label_en": string,"label_kn": string,"note"?: string,"receipt_status"?: string,"required"?: boolean
                  }
                  Update: {
                    "application_id"?: string,"key"?: string,"label_en"?: string,"label_kn"?: string,"note"?: string,"receipt_status"?: string,"required"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_checklist_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "application_worklist"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_checklist_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "application_worklist_base"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_checklist_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    }
                  ]
                },"application_documents": {
                  Row: {
                    "application_id": string,"created_at": string,"document_type": string,"file_name": string,"id": string,"is_demo": boolean,"storage_path": string | null,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"document_type": string,"file_name": string,"id"?: string,"is_demo"?: boolean,"storage_path"?: string | null,"uploaded_by"?: string | null
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"document_type"?: string,"file_name"?: string,"id"?: string,"is_demo"?: boolean,"storage_path"?: string | null,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_documents_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "application_worklist"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_documents_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "application_worklist_base"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_documents_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_documents_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"application_events": {
                  Row: {
                    "actor_id": string | null,"actor_name": string,"actor_role": string,"application_id": string,"created_at": string,"description": string,"event_type": string,"id": string,"metadata": NonNullable<Json>,"new_state": NonNullable<Json>,"previous_state": NonNullable<Json>,"reason": string | null,"request_id": string | null,"sequence": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"actor_name"?: string,"actor_role"?: string,"application_id": string,"created_at"?: string,"description": string,"event_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"new_state"?: NonNullable<Json>,"previous_state"?: NonNullable<Json>,"reason"?: string | null,"request_id"?: string | null,"sequence"?: never
                  }
                  Update: {
                    "actor_id"?: string | null,"actor_name"?: string,"actor_role"?: string,"application_id"?: string,"created_at"?: string,"description"?: string,"event_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"new_state"?: NonNullable<Json>,"previous_state"?: NonNullable<Json>,"reason"?: string | null,"request_id"?: string | null,"sequence"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_events_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "application_worklist"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_events_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "application_worklist_base"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_events_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    }
                  ]
                },"application_notes": {
                  Row: {
                    "application_id": string,"author_id": string | null,"body": string,"created_at": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"author_id"?: string | null,"body": string,"created_at"?: string,"id"?: string
                  }
                  Update: {
                    "application_id"?: string,"author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_notes_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "application_worklist"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_notes_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "application_worklist_base"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_notes_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"application_workflow": {
                  Row: {
                    "application_id": string,"approving_officer_id": string | null,"caseworker_id": string | null,"caseworker_notes": string,"clarification_pending": boolean,"decided_at": string | null,"decided_by": string | null,"decision_reason": string | null,"field_observations": string,"field_submitted_at": string | null,"follow_up_questions": string,"follow_up_resolved": boolean,"operator_id": string | null,"resume_status": Database["public"]['Enums']["application_status"] | null,"return_reason": string | null,"return_stack": NonNullable<Json>,"return_to_stage": Database["public"]['Enums']["application_status"] | null,"returned_at": string | null,"returned_by": string | null,"review_checks": NonNullable<Json>,"review_issues": string,"review_issues_resolved": boolean,"review_submitted_at": string | null,"screened_at": string | null,"screening_notes": string,"updated_at": string,"verification_checks": NonNullable<Json>,"verification_status": string,"version": number,"visit_date": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"approving_officer_id"?: string | null,"caseworker_id"?: string | null,"caseworker_notes"?: string,"clarification_pending"?: boolean,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"field_observations"?: string,"field_submitted_at"?: string | null,"follow_up_questions"?: string,"follow_up_resolved"?: boolean,"operator_id"?: string | null,"resume_status"?: Database["public"]['Enums']["application_status"] | null,"return_reason"?: string | null,"return_stack"?: NonNullable<Json>,"return_to_stage"?: Database["public"]['Enums']["application_status"] | null,"returned_at"?: string | null,"returned_by"?: string | null,"review_checks"?: NonNullable<Json>,"review_issues"?: string,"review_issues_resolved"?: boolean,"review_submitted_at"?: string | null,"screened_at"?: string | null,"screening_notes"?: string,"updated_at"?: string,"verification_checks"?: NonNullable<Json>,"verification_status"?: string,"version"?: number,"visit_date"?: string | null
                  }
                  Update: {
                    "application_id"?: string,"approving_officer_id"?: string | null,"caseworker_id"?: string | null,"caseworker_notes"?: string,"clarification_pending"?: boolean,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"field_observations"?: string,"field_submitted_at"?: string | null,"follow_up_questions"?: string,"follow_up_resolved"?: boolean,"operator_id"?: string | null,"resume_status"?: Database["public"]['Enums']["application_status"] | null,"return_reason"?: string | null,"return_stack"?: NonNullable<Json>,"return_to_stage"?: Database["public"]['Enums']["application_status"] | null,"returned_at"?: string | null,"returned_by"?: string | null,"review_checks"?: NonNullable<Json>,"review_issues"?: string,"review_issues_resolved"?: boolean,"review_submitted_at"?: string | null,"screened_at"?: string | null,"screening_notes"?: string,"updated_at"?: string,"verification_checks"?: NonNullable<Json>,"verification_status"?: string,"version"?: number,"visit_date"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_workflow_application_id_fkey"
      columns: ["application_id"]
isOneToOne: true
      referencedRelation: "application_worklist"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_workflow_application_id_fkey"
      columns: ["application_id"]
isOneToOne: true
      referencedRelation: "application_worklist_base"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_workflow_application_id_fkey"
      columns: ["application_id"]
isOneToOne: true
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_workflow_approving_officer_id_fkey"
      columns: ["approving_officer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_workflow_caseworker_id_fkey"
      columns: ["caseworker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_workflow_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_workflow_operator_id_fkey"
      columns: ["operator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_workflow_returned_by_fkey"
      columns: ["returned_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"applications": {
                  Row: {
                    "annual_income": number,"applicant_name": string,"application_date": string | null,"assigned_field_officer_id": string | null,"certificate_type": string,"created_at": string,"created_by": string | null,"district": string,"field_report": string | null,"id": string,"is_demo": boolean,"processed_at": string | null,"processing_status": string | null,"purpose": string,"reference_number": string,"stage_entered_at": string,"status": Database["public"]['Enums']["application_status"],"submitted_at": string,"taluk": string,"target_date": string | null,"unresolved_actions": (string)[],"updated_at": string,"village": string,"workflow_stage": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "annual_income": number,"applicant_name": string,"application_date"?: never,"assigned_field_officer_id"?: string | null,"certificate_type"?: string,"created_at"?: string,"created_by"?: string | null,"district": string,"field_report"?: string | null,"id"?: string,"is_demo"?: boolean,"processed_at"?: string | null,"processing_status"?: never,"purpose": string,"reference_number": string,"stage_entered_at"?: string,"status"?: Database["public"]['Enums']["application_status"],"submitted_at"?: string,"taluk": string,"target_date"?: string | null,"unresolved_actions"?: (string)[],"updated_at"?: string,"village": string,"workflow_stage"?: never
                  }
                  Update: {
                    "annual_income"?: number,"applicant_name"?: string,"application_date"?: never,"assigned_field_officer_id"?: string | null,"certificate_type"?: string,"created_at"?: string,"created_by"?: string | null,"district"?: string,"field_report"?: string | null,"id"?: string,"is_demo"?: boolean,"processed_at"?: string | null,"processing_status"?: never,"purpose"?: string,"reference_number"?: string,"stage_entered_at"?: string,"status"?: Database["public"]['Enums']["application_status"],"submitted_at"?: string,"taluk"?: string,"target_date"?: string | null,"unresolved_actions"?: (string)[],"updated_at"?: string,"village"?: string,"workflow_stage"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_assigned_field_officer_id_fkey"
      columns: ["assigned_field_officer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"district": string,"full_name": string,"id": string,"is_active": boolean,"role": Database["public"]['Enums']["officer_role"],"taluk": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"district": string,"full_name": string,"id": string,"is_active"?: boolean,"role": Database["public"]['Enums']["officer_role"],"taluk": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"district"?: string,"full_name"?: string,"id"?: string,"is_active"?: boolean,"role"?: Database["public"]['Enums']["officer_role"],"taluk"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"workflow_demo_settings": {
                  Row: {
                    "due_soon_days": number,"id": boolean,"recent_processed_days": number,"stage_attention_days": number,"target_days": number,"urgent_action_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "due_soon_days"?: number,"id"?: boolean,"recent_processed_days"?: number,"stage_attention_days"?: number,"target_days"?: number,"urgent_action_count"?: number
                  }
                  Update: {
                    "due_soon_days"?: number,"id"?: boolean,"recent_processed_days"?: number,"stage_attention_days"?: number,"target_days"?: number,"urgent_action_count"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "application_villages": {
                  Row: {
                    "village": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"application_worklist": {
                  Row: {
                    "annual_income": number,"applicant_name": string,"application_date": string | null,"assigned_field_officer_id": string | null,"certificate_type": string,"clarification_pending": boolean,"created_at": string,"created_by": string | null,"days_overdue": number | null,"days_pending": number | null,"district": string,"due_soon_days": number,"effective_target_date": string | null,"field_report": string | null,"id": string,"is_demo": boolean,"is_overdue": boolean | null,"is_pending": boolean | null,"priority": string | null,"priority_rank": number | null,"priority_reasons": (string)[] | null,"processed_at": string | null,"processing_status": string | null,"purpose": string,"recently_processed": boolean | null,"reference_number": string,"resume_status": Database["public"]['Enums']["application_status"] | null,"stage_attention_days": number,"stage_entered_at": string,"stage_waiting_days": number | null,"status": Database["public"]['Enums']["application_status"],"submitted_at": string,"taluk": string,"target_date": string | null,"today": string | null,"unresolved_action_count": number | null,"unresolved_actions": (string)[],"updated_at": string,"urgent_action_count": number,"village": string,"workflow_stage": string | null,"workflow_version": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "applications_assigned_field_officer_id_fkey"
      columns: ["assigned_field_officer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"application_worklist_base": {
                  Row: {
                    "annual_income": number,"applicant_name": string,"assigned_field_officer_id": string | null,"certificate_type": string,"created_at": string,"created_by": string | null,"days_overdue": number | null,"days_pending": number | null,"district": string,"due_soon_days": number,"effective_target_date": string | null,"field_report": string | null,"id": string,"is_demo": boolean,"is_overdue": boolean | null,"is_pending": boolean | null,"priority": string | null,"priority_rank": number | null,"priority_reasons": (string)[] | null,"processed_at": string | null,"purpose": string,"recently_processed": boolean | null,"reference_number": string,"stage_attention_days": number,"stage_entered_at": string,"stage_waiting_days": number | null,"status": Database["public"]['Enums']["application_status"],"submitted_at": string,"taluk": string,"target_date": string | null,"today": string | null,"unresolved_action_count": number | null,"unresolved_actions": (string)[],"updated_at": string,"urgent_action_count": number,"village": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "applications_assigned_field_officer_id_fkey"
      columns: ["assigned_field_officer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "application_assigned_officer":
{ Args: { "target_id": string }; Returns: {
              "full_name": string,"id": string,"role": Database["public"]['Enums']["officer_role"]
            }[]
                           },
"can_read_application":
{ Args: { "target_id": string }; Returns: boolean
                           },
"create_application":
{ Args: { "annual_income": number,"applicant_name": string,"purpose": string,"request_id": string,"village": string }; Returns: Json
                           } |
{ Args: { "annual_income": number,"applicant_name": string,"application_date": string,"certificate_type": string,"documents": Json,"notes": string,"purpose": string,"request_id": string,"village": string }; Returns: Json
                           },
"current_officer_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["officer_role"]
                           },
"reserve_ai_request":
{ Args: { "expected_version": number,"feature": string,"target_id": string }; Returns: Json
                           },
"workflow_action":
{ Args: { "action": string,"expected_version": number,"payload"?: Json,"request_id": string,"target_id": string }; Returns: Json
                           },
"workflow_officers":
{ Args: { "target_id": string }; Returns: {
              "full_name": string,"id": string,"role": Database["public"]['Enums']["officer_role"]
            }[]
                           }
          }
          Enums: {
            "application_status": "SUBMITTED"|"FIELD_VERIFICATION"|"UNDER_REVIEW"|"PENDING_APPROVAL"|"APPROVED"|"REJECTED","officer_role": "OPERATOR"|"FIELD_OFFICER"|"CASEWORKER"|"APPROVING_OFFICER"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "application_status": ["SUBMITTED", "FIELD_VERIFICATION", "UNDER_REVIEW", "PENDING_APPROVAL", "APPROVED", "REJECTED"],"officer_role": ["OPERATOR", "FIELD_OFFICER", "CASEWORKER", "APPROVING_OFFICER"]
          }
        }
} as const
