// Pure progress logic: per-course completion, measured by grade-weight when
// available (more meaningful than task count), else by task count.
import type { Task } from "./exports";

export type CourseProgress = {
  course: string;
  total: number;       // task count
  done: number;        // completed task count
  weightTotal: number; // sum of all weights in the course
  weightDone: number;  // sum of completed weights
  pct: number;         // 0–100, by weight if any, else by count
};

export function computeProgress(tasks: Task[]): CourseProgress[] {
  const byCourse = new Map<string, Task[]>();
  for (const t of tasks) {
    const k = t.course ?? "";
    (byCourse.get(k) ?? byCourse.set(k, []).get(k)!).push(t);
  }

  const out: CourseProgress[] = [];
  for (const [course, list] of byCourse) {
    const total = list.length;
    const done = list.filter((t) => t.done).length;
    const weightTotal = list.reduce((s, t) => s + (t.weight ?? 0), 0);
    const weightDone = list.filter((t) => t.done).reduce((s, t) => s + (t.weight ?? 0), 0);
    const pct =
      weightTotal > 0 ? Math.round((weightDone / weightTotal) * 100)
      : total > 0 ? Math.round((done / total) * 100)
      : 0;
    out.push({ course, total, done, weightTotal, weightDone, pct });
  }

  // Alphabetical, with the "no course" bucket last.
  return out.sort((a, b) => (a.course || "~").localeCompare(b.course || "~"));
}
