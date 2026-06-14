import type { Task } from "./types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

// The "system" prompt sets the rules. This is where all the intelligence lives —
// every rule here came directly from the messy real-world cases in your syllabus.
const SYSTEM_PROMPT = `You are a precise syllabus parser. Extract graded course components and return STRICT JSON.

Return a JSON object of the form: { "tasks": [ ... ] }
Each task has: { "title": string, "course": string|null, "weight": number|null, "deadline": string|null, "recurring": string|null }

Rules:
- "course": the course code/name this syllabus belongs to (e.g. "CS 246", "STAT 230"). Detect it ONCE from the text and put the SAME value on every task. null if not found.
- "weight" = percent of the FINAL grade for that single task, as a number (8 means 8%). null if unknown.
- SPLIT grouped components into individual tasks. "Assignments (4, equally weighted) = 32%" -> 4 tasks, weight 8 each.
- If individual due dates are given ("Assignment 2 due Feb 27"), put each on its own task with its own deadline.
- "deadline": use ISO "YYYY-MM-DD" if a full date is determinable; else the date text as written ("Feb 27"); else null.
- "recurring": "weekly" (or similar) if it repeats; else null.
- Do NOT invent tasks, weights, or dates. Use only what the text supports.
- Output ONLY the JSON object. No markdown, no commentary.`;

export async function extractTasks(syllabusText: string): Promise<Task[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1, // low = consistent/factual, not creative
      response_format: { type: "json_object" }, // Groq's "must return valid JSON" mode
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: syllabusText.slice(0, 12000) }, // keep within free token limits
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  // Dig the model's answer out (the path you saw in the smoke test):
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);
  const rawTasks: any[] = Array.isArray(parsed.tasks) ? parsed.tasks : [];

  // Coerce the model's output into our Task shape and attach ids.
  // We DON'T blindly trust types — the LLM might send a string where we want a number.
  return rawTasks.map((t) => ({
    id: crypto.randomUUID(), // globally unique so tasks from different uploads never collide
    title: String(t.title ?? "Untitled"),
    course: t.course ? String(t.course) : undefined,
    weight: typeof t.weight === "number" ? t.weight : undefined,
    deadline: t.deadline ? String(t.deadline) : undefined,
    recurring: t.recurring ? String(t.recurring) : undefined,
  }));
}
