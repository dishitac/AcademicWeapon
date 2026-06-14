// Pure export logic — no React, no state. Takes tasks, produces files.
// Lives apart from the UI so it's reusable and testable on its own.

export type Task = {
  id: string;
  title: string;
  course?: string;
  weight?: number;
  deadline?: string;
  recurring?: string;
  effortHours?: number;    // estimated work; user can override
  suggestedStart?: string; // filled in by the scheduler
  done?: boolean;          // checked off by the student
};

// The 3-step browser "download a string as a file" trick.
export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function tasksToCSV(tasks: Task[]): string {
  const esc = (v: string | number | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = "course,title,weight,deadline,suggestedStart,recurring";
  const rows = tasks.map((t) =>
    [t.course, t.title, t.weight, t.deadline, t.suggestedStart, t.recurring].map(esc).join(",")
  );
  return [header, ...rows].join("\n");
}

// Returns the .ics text, or null if no task has a calendar-ready date.
export function tasksToICS(tasks: Task[]): string | null {
  const dated = tasks.filter((t) => t.deadline && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline));
  if (dated.length === 0) return null;

  const escIcs = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const events = dated.map((t) => {
    const date = t.deadline!.replace(/-/g, "");
    const summary = `${t.course ? `${t.course}: ` : ""}${t.title}${t.weight != null ? ` (${t.weight}%)` : ""}`;
    return [
      "BEGIN:VEVENT",
      `UID:${t.id}-${Math.random().toString(36).slice(2)}@academicweapon`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${date}`,
      `SUMMARY:${escIcs(summary)}`,
      "END:VEVENT",
    ].join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AcademicWeapon//EN",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}
