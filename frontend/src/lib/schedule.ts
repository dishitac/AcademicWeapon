import type { Task } from "./exports";

const HOURS_PER_DAY = 3; // productive hours you'll spend per day on one task

// If the user gave no effort, estimate ~1 hour per 1% of grade.
function estimateEffort(t: Task): number {
  if (t.effortHours && t.effortHours > 0) return t.effortHours;
  if (t.weight && t.weight > 0) return t.weight;
  return 2; // small default for unweighted tasks
}

// Format a Date as YYYY-MM-DD in LOCAL time (see note below).
function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Returns a NEW array with suggestedStart filled for every task that has a real date.
export function scheduleTasks(tasks: Task[]): Task[] {
  return tasks.map((t) => {
    if (!t.deadline || !/^\d{4}-\d{2}-\d{2}$/.test(t.deadline)) {
      return { ...t, suggestedStart: undefined }; // can't schedule undated tasks
    }
    const leadDays = Math.max(1, Math.ceil(estimateEffort(t) / HOURS_PER_DAY));
    const due = new Date(t.deadline + "T00:00:00"); // parse as local midnight
    const start = new Date(due);
    start.setDate(start.getDate() - leadDays); // subtract days (handles month rollover)
    return { ...t, suggestedStart: toLocalISO(start) };
  });
}
