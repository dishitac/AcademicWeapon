// Pure timeline logic: lay each dated task out as a bar across the semester.
// left%/width% are computed from each task's position within the overall date
// range, so the UI just needs to apply them as CSS percentages.
import type { Task } from "./exports";

export type TimelineBar = {
  id: string;
  course: string;
  title: string;
  leftPct: number;   // bar start position (0–100) across the range
  widthPct: number;  // bar length (start → deadline)
  weight?: number;
  startLabel: string;
  dueLabel: string;
};

export type TimelineMonth = { label: string; leftPct: number };

export type Timeline = {
  bars: TimelineBar[];
  months: TimelineMonth[];
  empty: boolean;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const parseLocal = (iso: string) => new Date(iso + "T00:00:00");
const fmt = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

// Same rule the scheduler uses, so a bar has a sensible length even before the
// user clicks "Suggest start dates": ~1hr/1% of grade, ~3 focus-hours/day.
function fallbackLeadDays(t: Task): number {
  const effort = t.effortHours && t.effortHours > 0 ? t.effortHours
    : t.weight && t.weight > 0 ? t.weight
    : 2;
  return Math.max(1, Math.ceil(effort / 3));
}

export function buildTimeline(tasks: Task[]): Timeline {
  const dated = tasks.filter((t) => t.deadline && ISO.test(t.deadline));
  if (dated.length === 0) return { bars: [], months: [], empty: true };

  // Resolve each task to a [start, due] pair (start = scheduled, or estimated).
  const spans = dated.map((t) => {
    const due = parseLocal(t.deadline!);
    const start = t.suggestedStart && ISO.test(t.suggestedStart)
      ? parseLocal(t.suggestedStart)
      : new Date(due.getTime() - fallbackLeadDays(t) * DAY);
    return { t, start, due };
  });

  // Overall range, padded a couple days on each side for breathing room.
  const rangeStart = Math.min(...spans.map((s) => s.start.getTime())) - 2 * DAY;
  const rangeEnd = Math.max(...spans.map((s) => s.due.getTime())) + 2 * DAY;
  const total = rangeEnd - rangeStart || 1;
  const pct = (ms: number) => ((ms - rangeStart) / total) * 100;

  // Sort by course, then by deadline within a course.
  spans.sort((a, b) => {
    const c = (a.t.course ?? "").localeCompare(b.t.course ?? "");
    return c !== 0 ? c : a.due.getTime() - b.due.getTime();
  });

  const bars: TimelineBar[] = spans.map(({ t, start, due }) => {
    const left = pct(start.getTime());
    return {
      id: t.id,
      course: t.course ?? "",
      title: t.title,
      leftPct: left,
      widthPct: Math.max(pct(due.getTime()) - left, 1.5), // floor so it's always visible
      weight: t.weight,
      startLabel: fmt(start),
      dueLabel: fmt(due),
    };
  });

  // Month tick labels: walk month-by-month across the range.
  const months: TimelineMonth[] = [];
  const cursor = new Date(rangeStart);
  cursor.setDate(1);
  while (cursor.getTime() <= rangeEnd) {
    const left = pct(cursor.getTime());
    if (left >= 0 && left <= 100) months.push({ label: MONTHS[cursor.getMonth()], leftPct: left });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return { bars, months, empty: false };
}
