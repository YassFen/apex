export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type WodType = "fortime" | "amrap" | "emom" | "tabata" | "strength"
export type MovementCategory = "weightlifting" | "olympic" | "gymnastics" | "benchmark" | "cardio"
export type RxLevel = "rx" | "scaled" | "rx+"
export type ResultType = "time" | "rounds" | "weight" | "reps"
export type UserRole = "athlete" | "coach" | "admin"
export type BoxPlan = "free" | "pro" | "enterprise"
export type Unit = "lb" | "kg"

// Convenience aliases (no generics needed at alias level)
export interface Profile { id: string; email: string; full_name: string; avatar_url: string | null; role: UserRole; preferred_unit: Unit; tracking_since: string | null; bio: string | null; city: string | null; favorite_movement: string | null; profile_public: boolean; show_prs_public: boolean; created_at: string; updated_at: string; sex?: 'm' | 'f' | null; dashboard_layout?: Json | null; birth_year?: number | null }
export interface Box { id: string; name: string; slug: string; logo_url: string | null; city: string; country: string; owner_id: string; affiliate_code: string | null; invite_code: string; plan: BoxPlan; created_at: string; description?: string | null; website_url?: string | null; instagram?: string | null; whatsapp?: string | null; schedule?: string | null; disciplines?: string[] | null }
export interface BoxMember { id: string; box_id: string; user_id: string; role: UserRole; joined_at: string; is_active: boolean }
export interface Movement { id: string; name: string; category: MovementCategory; description: string | null; video_url: string | null; box_id?: string | null; created_by?: string | null; image_url?: string | null; cues?: string | null; muscles?: string[] | null }
export interface PrRecord { id: string; user_id: string; movement_id: string; value_lb: number; metric: "1rm" | "3rm" | "max_reps" | "time"; recorded_at: string; notes: string | null; is_pr: boolean }
export interface WodTemplate { id: string; box_id: string | null; created_by: string; name: string; type: WodType; description: string; duration_mins: number | null; movements: Json; is_public: boolean; created_at: string }
export interface DailyWod { id: string; box_id: string; coach_id: string; wod_template_id: string | null; published_at: string; scheduled_for: string; title: string; description: string; movements: Json; is_live: boolean; type: WodType; duration_mins: number | null; show_early?: boolean; class_time?: string | null }
export interface WodResult { id: string; daily_wod_id: string; user_id: string; result_type: ResultType; result_value: string; rx_level: RxLevel; notes: string | null; recorded_at: string }
// ── Box administration (010) ──
export type MembershipKind = 'unlimited' | 'classes'
export type MembershipStatus = 'active' | 'frozen' | 'cancelled'
export interface MembershipPlan { id: string; box_id: string; name: string; kind: MembershipKind; classes_count: number | null; duration_days: number; price: number | null; currency: string; is_active: boolean; created_at: string }
export interface Membership { id: string; box_id: string; user_id: string; plan_id: string | null; plan_name: string; kind: MembershipKind; starts_on: string; ends_on: string; classes_total: number | null; classes_used: number; status: MembershipStatus; frozen_on: string | null; created_at: string }
export interface MembershipEvent { id: string; membership_id: string; box_id: string; user_id: string; type: 'assigned' | 'renewed' | 'frozen' | 'reactivated' | 'cancelled' | 'adjusted'; happened_on: string; reason: string | null; days: number | null; created_at: string }
export interface ClassSlot { id: string; box_id: string; weekday: number; start_time: string; duration_min: number; name: string; capacity: number; coach_id: string | null; is_active: boolean }
export interface ClassOverride { id: string; slot_id: string; box_id: string; class_date: string; coach_id: string | null; cancelled: boolean; cancel_reason: string | null; capacity: number | null }
export type BookingStatus = 'booked' | 'waitlist' | 'cancelled' | 'attended' | 'no_show'
export interface ClassBooking { id: string; slot_id: string; box_id: string; class_date: string; user_id: string; status: BookingStatus; created_at: string }
export interface CoachIssue { id: string; box_id: string; coach_id: string; slot_id: string | null; class_date: string; reason: string | null; status: 'open' | 'resolved'; replacement_id: string | null; created_at: string }
export interface Announcement { id: string; box_id: string; author_id: string; audience: 'coaches' | 'athletes' | 'all'; title: string; body: string | null; urgent: boolean; starts_on: string; ends_on: string | null; weekday: number | null; slot_id: string | null; parent_id: string | null; created_at: string }
export interface MemberFile { box_id: string; user_id: string; phone: string | null; emergency_contact: string | null; birth_date: string | null; notes: string | null }
export interface Benchmark { id: string; user_id: string; name: string; result: string; recorded_at: string; notes: string | null; level: string | null }
