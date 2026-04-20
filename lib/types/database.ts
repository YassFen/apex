export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type WodType = "fortime" | "amrap" | "emom" | "tabata" | "strength"
export type MovementCategory = "weightlifting" | "olympic" | "gymnastics" | "benchmark" | "cardio"
export type RxLevel = "rx" | "scaled" | "rx+"
export type ResultType = "time" | "rounds" | "weight" | "reps"
export type UserRole = "athlete" | "coach" | "admin"
export type BoxPlan = "free" | "pro" | "enterprise"
export type Unit = "lb" | "kg"

// Convenience aliases (no generics needed at alias level)
export interface Profile { id: string; email: string; full_name: string; avatar_url: string | null; role: UserRole; preferred_unit: Unit; tracking_since: string | null; bio: string | null; city: string | null; created_at: string; updated_at: string }
export interface Box { id: string; name: string; slug: string; logo_url: string | null; city: string; country: string; owner_id: string; affiliate_code: string | null; invite_code: string; plan: BoxPlan; created_at: string }
export interface BoxMember { id: string; box_id: string; user_id: string; role: UserRole; joined_at: string; is_active: boolean }
export interface Movement { id: string; name: string; category: MovementCategory; description: string | null; video_url: string | null }
export interface PrRecord { id: string; user_id: string; movement_id: string; value_lb: number; metric: "1rm" | "3rm" | "max_reps" | "time"; recorded_at: string; notes: string | null; is_pr: boolean }
export interface WodTemplate { id: string; box_id: string | null; created_by: string; name: string; type: WodType; description: string; duration_mins: number | null; movements: Json; is_public: boolean; created_at: string }
export interface DailyWod { id: string; box_id: string; coach_id: string; wod_template_id: string | null; published_at: string; scheduled_for: string; title: string; description: string; movements: Json; is_live: boolean; type: WodType; duration_mins: number | null }
export interface WodResult { id: string; daily_wod_id: string; user_id: string; result_type: ResultType; result_value: string; rx_level: RxLevel; notes: string | null; recorded_at: string }
export interface Benchmark { id: string; user_id: string; name: string; result: string; recorded_at: string; notes: string | null; level: string | null }
