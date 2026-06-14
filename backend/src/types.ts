// The single shared shape for one course component / task.
// Everything in the app — extraction, scheduling, exports — speaks this.
export type Task = {
  id: string;          // unique id we generate
  title: string;       // "Midterm 1", "Assignment 3"
  course?: string;     // "CS 246" (may be unknown)
  deadline?: string;   // ISO date "2026-03-15" if we can find one
  weight?: number;     // % of final grade, 0–100
  effortHours?: number;// rough estimate of work needed (we'll infer later)
  suggestedStart?: string; // filled in by the scheduler in Phase 5
  recurring?: string;   // e.g. "weekly" if it repeats; otherwise absent
};