import { Fragment, useEffect, useMemo, useState } from "react";
import "./App.css";
import { downloadFile, tasksToCSV, tasksToICS, type Task } from "./lib/exports";
import { scheduleTasks } from "./lib/schedule";
import { buildWorkload } from "./lib/workload";
import { buildCalendar, defaultMonth } from "./lib/calendar";
import { computeProgress } from "./lib/progress";

// Backend base URL. In production we set VITE_API_URL (Vercel env var) to the
// deployed backend; locally it falls back to the dev server on :4000.
const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type HealthResponse = { status: string };

// --- pure sort/group helpers ---
// Compare optional strings, sorting missing values last (used for deadline/course).
function cmpMaybe(a?: string, b?: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}
// Highest weight first; missing weights sort last.
function cmpWeightDesc(a?: number, b?: number): number {
  return (b ?? -Infinity) - (a ?? -Infinity);
}
// Bucket tasks by course, with course groups in alphabetical order.
function groupByCourse(list: Task[]): { course: string; tasks: Task[] }[] {
  const map = new Map<string, Task[]>();
  for (const t of list) {
    const k = t.course ?? "";
    (map.get(k) ?? map.set(k, []).get(k)!).push(t);
  }
  return Array.from(map, ([course, tasks]) => ({ course, tasks })).sort((a, b) =>
    cmpMaybe(a.course || undefined, b.course || undefined)
  );
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New state for the upload feature:
  const [files, setFiles] = useState<File[]>([]); // the chosen PDFs (one or more)
  const [progress, setProgress] = useState(""); // "Parsing X (2/3)…" status during a batch
  // Lazy initializer: runs ONCE on first render, loading any saved tasks from
  // localStorage so your work survives a refresh.
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const saved = localStorage.getItem("aw_tasks");
      return saved ? (JSON.parse(saved) as Task[]) : [];
    } catch {
      return []; // corrupt/missing data -> start empty instead of crashing
    }
  });
  const [loading, setLoading] = useState(false);       // disable button while parsing
  const [editing, setEditing] = useState(false);       // view (read-only) vs. edit mode for the table
  const [sortKey, setSortKey] = useState<"deadline" | "weight" | "course" | "title">("deadline");
  const [filterCourse, setFilterCourse] = useState("all");
  const [grouped, setGrouped] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  // Persist tasks to localStorage every time they change. The [tasks] dependency
  // means this effect re-runs after any add/edit/delete/schedule.
  useEffect(() => {
    localStorage.setItem("aw_tasks", JSON.stringify(tasks));
  }, [tasks]);

  const uploadFiles = async () => {
    if (files.length === 0) return alert("Pick at least one PDF first");
    setLoading(true);
    setError(null);
    const failed: string[] = [];

    // Send the files to the backend ONE AT A TIME. The `await` inside the loop
    // pauses until each file finishes before starting the next (sequential),
    // which keeps us under the free LLM's rate limit and gives clean progress.
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setProgress(`Parsing ${f.name} (${i + 1}/${files.length})…`);
      try {
        const fd = new FormData();
        fd.append("file", f); // key "file" must match upload.single("file") on the backend
        const res = await fetch(`${API}/api/parse-pdf`, {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        // Append each file's tasks as soon as they come back.
        setTasks((prev) => [...prev, ...(data.tasks ?? [])]);
      } catch {
        failed.push(f.name); // one bad PDF shouldn't abort the whole batch
      }
    }

    setProgress("");
    setLoading(false);
    if (failed.length) setError(`Couldn't parse: ${failed.join(", ")}`);
  };

  const onDownloadCSV = () => downloadFile(tasksToCSV(tasks), "tasks.csv", "text/csv");

  const onDownloadICS = () => {
    const ics = tasksToICS(tasks);
    if (!ics) return alert("No tasks have a calendar-ready date yet.");
    downloadFile(ics, "deadlines.ics", "text/calendar");
  };

    // Edit one field of one task, immutably.
  const updateTask = (id: string, field: keyof Task, value: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              // weight is a number; everything else is a string (or cleared to undefined)
              [field]:
                field === "weight"
                  ? value === "" ? undefined : Number(value)
                  : value || undefined,
            }
          : t
      )
    );
  };

  const addTask = () => {
    setEditing(true); // adding a task drops you straight into edit mode
    setFilterCourse("all"); // ensure the new row isn't hidden by an active filter
    setTasks((prev) => [...prev, { id: crypto.randomUUID(), title: "New task" }]);
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const suggestSchedule = () => setTasks((prev) => scheduleTasks(prev));

  const clearAll = () => setTasks([]);

  // Recompute weekly workload only when tasks change (useMemo caches the result
  // between renders so we don't rebuild it on every keystroke elsewhere).
  const workload = useMemo(() => buildWorkload(tasks), [tasks]);
  const crunchCount = workload.filter((w) => w.level === "crunch").length;
  // Which month the calendar is showing. Starts at the earliest deadline.
  const [view, setView] = useState(() => defaultMonth(tasks));
  const calendar = useMemo(() => buildCalendar(tasks, view.year, view.month), [tasks, view]);
  const hasDates = workload.length > 0; // workload buckets only exist for dated tasks

  const prevMonth = () =>
    setView((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }));
  const nextMonth = () =>
    setView((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }));

  // Distinct course names, for the filter dropdown.
  const courses = useMemo(
    () => (Array.from(new Set(tasks.map((t) => t.course).filter(Boolean))) as string[]).sort(),
    [tasks]
  );

  // The display view: filter by course, then sort. Editing still targets the
  // real `tasks` by id, so this derived list never breaks edits.
  const visible = useMemo(() => {
    const filtered = filterCourse === "all" ? tasks : tasks.filter((t) => t.course === filterCourse);
    return [...filtered].sort((a, b) => {
      if (sortKey === "weight") return cmpWeightDesc(a.weight, b.weight);
      if (sortKey === "title") return a.title.localeCompare(b.title);
      if (sortKey === "course") return cmpMaybe(a.course, b.course) || cmpMaybe(a.deadline, b.deadline);
      return cmpMaybe(a.deadline, b.deadline); // default: by deadline
    });
  }, [tasks, filterCourse, sortKey]);

  // Check a task off / on (works in view mode too — it's an action, not editing).
  const toggleDone = (id: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  const courseProgress = useMemo(() => computeProgress(tasks), [tasks]);

  // One task row — used by both the flat and grouped views.
  const renderRow = (t: Task) => (
    <tr key={t.id} className={t.done ? "row-done" : ""}>
      <td className="col-check">
        <input
          type="checkbox"
          checked={!!t.done}
          onChange={() => toggleDone(t.id)}
          title="Mark done"
        />
      </td>
      <td className="col-course">
        {editing ? (
          <input value={t.course ?? ""} placeholder="CS 246"
            onChange={(e) => updateTask(t.id, "course", e.target.value)} />
        ) : t.course ? (
          <span className="wk-course">{t.course}</span>
        ) : (
          <span className="cell-empty">—</span>
        )}
      </td>
      <td>
        {editing ? (
          <input value={t.title} onChange={(e) => updateTask(t.id, "title", e.target.value)} />
        ) : (
          <span className="cell-text">{t.title}</span>
        )}
      </td>
      <td className="col-num">
        {editing ? (
          <input type="number" value={t.weight ?? ""}
            onChange={(e) => updateTask(t.id, "weight", e.target.value)} />
        ) : (
          <span className="cell-text">{t.weight != null ? `${t.weight}%` : "—"}</span>
        )}
      </td>
      <td>
        {editing ? (
          <input value={t.deadline ?? ""} placeholder="YYYY-MM-DD"
            onChange={(e) => updateTask(t.id, "deadline", e.target.value)} />
        ) : (
          <span className="cell-text">{t.deadline ?? "—"}</span>
        )}
      </td>
      <td>
        {editing ? (
          <input value={t.recurring ?? ""} placeholder="—"
            onChange={(e) => updateTask(t.id, "recurring", e.target.value)} />
        ) : (
          <span className="cell-text">{t.recurring ?? "—"}</span>
        )}
      </td>
      <td className="col-start">
        {t.suggestedStart ? <span className="badge">{t.suggestedStart}</span> : "—"}
      </td>
      <td className="col-del">
        {editing && (
          <button className="icon-btn" onClick={() => deleteTask(t.id)} title="Delete">✕</button>
        )}
      </td>
    </tr>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">📚</span> AcademicWeapon
        </div>
        {health ? (
          <span className="pill pill-ok"><span className="dot" /> Backend online</span>
        ) : error ? (
          <span className="pill pill-bad"><span className="dot" /> Backend offline</span>
        ) : (
          <span className="pill"><span className="dot" /> Connecting…</span>
        )}
      </header>

      <main className="container">
        <section className="card">
          <h2>Upload syllabus PDFs</h2>
          <p className="muted">
            Drop in one or more course syllabi — we'll pull out the graded
            components, weights, and deadlines.
          </p>

          <label className="dropzone">
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <span className="dropzone-icon">⬆️</span>
            <span className="dropzone-text">
              {files.length === 0
                ? "Click to choose PDF files"
                : `${files.length} file${files.length > 1 ? "s" : ""} selected`}
            </span>
          </label>

          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={uploadFiles}
              disabled={loading || files.length === 0}
            >
              {loading ? "Parsing…" : `Upload & extract${files.length ? ` (${files.length})` : ""}`}
            </button>
          </div>
          {progress && <p className="progress">{progress}</p>}
          {error && <p className="error-text">{error}</p>}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Tasks <span className="count">{tasks.length}</span></h2>
            <div className="toolbar">
              <button
                className={`btn ${editing ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setEditing((e) => !e)}
                disabled={tasks.length === 0}
              >
                {editing ? "✓ Done" : "✎ Edit"}
              </button>
              <button className="btn btn-ghost" onClick={addTask}>+ Add task</button>
              <button className="btn btn-ghost" onClick={suggestSchedule} disabled={tasks.length === 0}>Suggest start dates</button>
              <button className="btn btn-ghost" onClick={onDownloadCSV} disabled={tasks.length === 0}>CSV</button>
              <button className="btn btn-ghost" onClick={onDownloadICS} disabled={tasks.length === 0}>.ics</button>
              <button className="btn btn-danger" onClick={clearAll} disabled={tasks.length === 0}>Clear</button>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="empty">
              <span className="empty-icon">🗓️</span>
              <p>No tasks yet — upload a syllabus or add one manually.</p>
            </div>
          ) : (
            <>
              <div className="table-controls">
                <label>
                  Sort by
                  <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
                    <option value="deadline">Deadline</option>
                    <option value="weight">Weight</option>
                    <option value="course">Course</option>
                    <option value="title">Title</option>
                  </select>
                </label>
                <label>
                  Course
                  <select value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
                    <option value="all">All courses</option>
                    {courses.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="group-toggle">
                  <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
                  Group by course
                </label>
              </div>

              <div className="table-wrap">
                <table className="task-table">
                  <thead>
                    <tr>
                      <th></th><th>Course</th><th>Title</th><th>Weight</th><th>Deadline</th>
                      <th>Recurring</th><th>Start by</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped
                      ? groupByCourse(visible).map((g) => (
                          <Fragment key={g.course || "none"}>
                            <tr className="group-row">
                              <td colSpan={8}>{g.course || "No course"}</td>
                            </tr>
                            {g.tasks.map(renderRow)}
                          </Fragment>
                        ))
                      : visible.map(renderRow)}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {tasks.length > 0 && (
          <section className="card">
            <h2>Progress</h2>
            <div className="prog-list">
              {courseProgress.map((p) => (
                <div key={p.course || "none"} className="prog-row">
                  <div className="prog-head">
                    <span className="prog-name">{p.course || "No course"}</span>
                    <span className="prog-stat">{p.done}/{p.total} done · {p.pct}%</span>
                  </div>
                  <div className="prog-bar">
                    <div className="prog-fill" style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {hasDates && (
          <section className="card">
            <div className="card-head">
              <h2>Calendar</h2>
              {crunchCount > 0 && (
                <span className="warn-chip">⚠️ {crunchCount} crunch week{crunchCount > 1 ? "s" : ""}</span>
              )}
            </div>

            <div className="cal-nav">
              <button className="btn btn-ghost" onClick={prevMonth} aria-label="Previous month">◀</button>
              <span className="cal-title">{calendar.label}</span>
              <button className="btn btn-ghost" onClick={nextMonth} aria-label="Next month">▶</button>
            </div>

            <div className="cal-grid">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="cal-dow">{d}</div>
              ))}
              {/* Flatten weeks into a single stream of cells; the 7-col grid wraps them. */}
              {calendar.weeks.flat().map((d) => (
                <div key={d.date} className={`cal-cell cal-${d.level}${d.inMonth ? "" : " cal-out"}`}>
                  <div className="cal-daynum">{d.day}</div>
                  <div className="cal-chips">
                    {d.tasks.map((t) => (
                      <div
                        key={t.id}
                        className="cal-chip"
                        title={`${t.course ?? ""} ${t.title}${t.weight != null ? ` (${t.weight}%)` : ""}`}
                      >
                        {t.course ? `${t.course}: ` : ""}{t.title}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
