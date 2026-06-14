// Pure workload logic: group dated tasks by week, total their grade-weight,
// and classify each week as calm / busy / crunch. No React here.
import type { Task } from "./exports";

export type WeekBucket = {
  weekStart: string;            // ISO date (Monday) — used as a stable key & for sorting
  label: string;               // human label, e.g. "Mar 2 – Mar 8"
  tasks: Task[];               // tasks due that week, sorted by deadline
  totalWeight: number;         // sum of grade-weights due that week
  level: "calm" | "busy" | "crunch";
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const parseLocal = (iso: string) => new Date(iso + "T00:00:00"); // local midnight, no TZ shift

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Monday of the week containing d (getDay(): 0=Sun..6=Sat -> shift so Mon=0).
function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const mondayOffset = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - mondayOffset);
  return out;
}

const fmt = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

export function buildWorkload(tasks: Task[]): WeekBucket[] {
  // Only tasks with a real calendar date can sit on a timeline.
  const dated = tasks.filter((t) => t.deadline && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline));

  // Bucket tasks by the Monday of their due-week.
  const byWeek = new Map<string, Task[]>();
  for (const t of dated) {
    const key = toISO(startOfWeek(parseLocal(t.deadline!)));
    (byWeek.get(key) ?? byWeek.set(key, []).get(key)!).push(t);
  }

  const buckets: WeekBucket[] = [];
  for (const [weekStart, weekTasks] of byWeek) {
    const totalWeight = weekTasks.reduce((sum, t) => sum + (t.weight ?? 0), 0);
    const n = weekTasks.length;

    // Classify. Weight is the main signal; task-count is a fallback for
    // unweighted weeks. Both thresholds are easy knobs to tune.
    let level: WeekBucket["level"] = "calm";
    if (totalWeight >= 40 || n >= 4) level = "crunch";
    else if (totalWeight >= 20 || n >= 2) level = "busy";

    const start = parseLocal(weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    buckets.push({
      weekStart,
      label: `${fmt(start)} – ${fmt(end)}`,
      tasks: [...weekTasks].sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1)),
      totalWeight,
      level,
    });
  }

  // Chronological order.
  return buckets.sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}
