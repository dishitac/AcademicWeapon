import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import {PDFParse} from "pdf-parse"
import { extractTasks } from "./llm";


const app = express(); 
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
    res.json({status: "ok"});
});

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`)
});

const upload = multer({ storage: multer.memoryStorage() });
// upload.single("file") = "expect ONE file, in a form field named 'file'."
// It runs as middleware, populating req.file before our handler runs.
app.post("/api/parse-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "no file uploaded" });
    }
    const parser = new PDFParse({ data: req.file.buffer }); // load the PDF bytes
    const result = await parser.getText();
    await parser.destroy();
    const tasks = await extractTasks(result.text); // ← the new line
    res.json({ tasks });                            // ← return tasks now, not raw text
                             // free memory/workers
    res.json({ text: result.text });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

