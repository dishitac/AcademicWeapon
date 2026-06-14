// Pure calendar logic: build a Monday-start month grid with tasks dropped onto
// their due-days, and classify each day's load. No React here.
import type { Task } from "./exports";

export type DayLevel = "none" | "busy" | "crunch";

export type CalendarDay = {
  date: string;        // YYYY-MM-DD
  day: number;         // day-of-month number
  inMonth: boolean;    // false for the leading/trailing days of adjacent months
  tasks: Task[];       // tasks due this day
  totalWeight: number; // grade-weight due this day
  level: DayLevel;
};

export type CalendarMonth = {
  year: number;
  month: number;            // 0–11
  label: string;            // "March 2026"
  weeks: CalendarDay[][];   // rows of 7 days
};

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const parseLocal = (iso: string) => new Date(iso + "T00:00:00");
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildCalendar(tasks: Task[], year: number, month: number): CalendarMonth {
  // Index tasks by their due date for O(1) lookup per cell.
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.deadline && ISO.test(t.deadline)) {
      (byDate.get(t.deadline) ?? byDate.set(t.deadline, []).get(t.deadline)!).push(t);
    }
  }

  // Grid starts on the Monday on/before the 1st of the month.
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
  const cursor = new Date(year, month, 1 - startOffset);

  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const dayTasks = byDate.get(toISO(cursor)) ?? [];
      const totalWeight = dayTasks.reduce((s, t) => s + (t.weight ?? 0), 0);
      let level: DayLevel = "none";
      if (dayTasks.length) level = totalWeight >= 25 || dayTasks.length >= 2 ? "crunch" : "busy";

      week.push({
        date: toISO(cursor),
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === month,
        tasks: dayTasks,
        totalWeight,
        level,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  // Drop a trailing week that's entirely in the next month (keeps the grid tight).
  while (weeks.length > 4 && weeks[weeks.length - 1].every((d) => !d.inMonth)) weeks.pop();

  return { year, month, label: `${MONTHS[month]} ${year}`, weeks };
}

// Sensible starting month: the earliest task deadline, else today's month.
export function defaultMonth(tasks: Task[]): { year: number; month: number } {
  const dates = tasks
    .filter((t) => t.deadline && ISO.test(t.deadline))
    .map((t) => t.deadline!)
    .sort();
  const d = dates.length ? parseLocal(dates[0]) : new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
}
