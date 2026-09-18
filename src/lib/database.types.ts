// Hand-authored types mirroring the Supabase schema in supabase/migrations.
// Regenerate with `supabase gen types typescript` once your project is linked
// if you want a fully generated version.

export type UserRole = "admin" | "trainer";
export type MembershipPlan = "monthly" | "quarterly" | "half_yearly";
export type BatchCategory =
  | "weekday_morning"
  | "kids"
  | "weekday_evening"
  | "weekend"
  | "personal_training";
export type BatchStatus = "active" | "upcoming";
export type MemberStatus = "active" | "expiring_soon" | "expired";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  created_at: string;
}

export interface Branch {
  id: string;
  name: string;
  created_at: string;
}

export interface TrainerBranch {
  trainer_id: string;
  branch_id: string;
}

export interface Batch {
  id: string;
  name: string;
  category: BatchCategory;
  time_slot: string;
  days: string;
  status: BatchStatus;
  branch_id: string;
  created_at: string;
}

export interface TrainerBatch {
  trainer_id: string;
  batch_id: string;
}

export interface Member {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  photo_url: string | null;
  plan: MembershipPlan;
  start_date: string;
  expiry_date: string;
  notes: string | null;
  branch_id: string;
  sheet_person_no: number | null;
  sheet_renewal_no: number;
  total_fee: number | null;
  cali_percent: number | null;
  invoice_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  member_id: string;
  amount: number;
  paid_date: string;
  created_at: string;
}

export type PaymentStatus = "paid" | "partial" | "unpaid";

export interface SheetSyncSettings {
  id: "singleton";
  apps_script_url: string | null;
  apps_script_token: string | null;
  next_person_no: number;
}

export interface MemberWithStatus extends Member {
  status: MemberStatus;
}

export interface MemberBatch {
  member_id: string;
  batch_id: string;
}

export interface PTClient {
  id: string;
  member_id: string;
  trainer_id: string;
  trainer_share_percent: number | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  session_date: string;
  batch_id: string;
  trainer_id: string;
  submitted_at: string;
}

export interface AttendanceEntry {
  id: string;
  attendance_record_id: string;
  member_id: string;
  present: boolean;
  member_status_at_time: MemberStatus;
  is_post_expiry: boolean;
  created_at: string;
}

export interface DemoVisitor {
  id: string;
  attendance_record_id: string;
  name: string;
  phone: string;
  visit_date: string;
  created_at: string;
}

export interface PTSession {
  id: string;
  pt_client_id: string;
  session_date: string;
  trainer_id: string;
  session_done: boolean;
  marked_at: string;
}

export interface ExceptionReportRow {
  member_id: string;
  member_name: string;
  phone: string;
  expiry_date: string;
  post_expiry_count: number;
  offense_dates: string[];
  batch_names: string[];
}

export interface MonthlyAttendanceRow {
  member_id: string;
  member_name: string;
  month: string;
  batch_id: string;
  batch_name: string;
  sessions_attended: number;
}

// Minimal Database generic so supabase-js typing works without full codegen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
