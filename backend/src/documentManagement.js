import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_DRAFT_CHARACTERS = 50_000;
const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".odt", ".txt"]);

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function ollamaUrl() {
  const configured = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const parsed = new URL(configured);
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname)) {
    throw new Error("OLLAMA_BASE_URL must point to this computer (localhost). ");
  }
  return parsed.toString().replace(/\/$/, "");
}

function isSupportedFile(bytes, extension) {
  if (extension === ".pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === ".doc") return bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (extension === ".docx" || extension === ".odt") return bytes.subarray(0, 4).toString("ascii") === "PK\u0003\u0004";
  if (extension === ".txt") return !bytes.subarray(0, 4096).includes(0);
  return false;
}

function publicRecord(row) {
  return {
    document_id: row.document_id,
    title: row.title,
    document_type: row.document_type,
    notes: row.notes,
    original_filename: row.original_filename,
    source: row.source,
    ai_model: row.ai_model,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createDocumentRouter({ pool, requireAdmin, storageDir }) {
  const router = express.Router();
  const privateDir = path.resolve(storageDir);
  fs.mkdir(privateDir, { recursive: true }).catch((error) => {
    console.error("Could not create private document storage:", error.code || "UNKNOWN");
  });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => callback(null, privateDir),
      filename: (_req, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      if (allowedExtensions.has(extension)) return callback(null, true);
      const error = new Error("Upload a PDF, Word, OpenDocument, or plain-text file.");
      error.statusCode = 400;
      return callback(error);
    },
  });

  router.get("/", requireAdmin, async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT document_id, title, document_type, notes, original_filename, source, ai_model, created_at, updated_at
         FROM business_documents ORDER BY updated_at DESC, document_id DESC`
      );
      return res.json({ documents: rows.map(publicRecord) });
    } catch (error) {
      console.error("GET /api/admin/documents failed:", error.code || "UNKNOWN");
      return res.status(500).json({ error: "Could not load business documents. Apply database migration 009 first." });
    }
  });

  router.get("/ai/models", requireAdmin, async (_req, res) => {
    try {
      const response = await fetch(`${ollamaUrl()}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Local AI service returned an error.");
      const result = await response.json();
      return res.json({ available: true, models: (result.models || []).map(({ name, size }) => ({ name, size })) });
    } catch (error) {
      const message = error.cause?.code === "ECONNREFUSED" || error.name === "TypeError"
        ? "Ollama is not running. Start Ollama locally and install a model to enable drafting."
        : error.message || "Could not connect to Ollama.";
      return res.json({ available: false, models: [], message });
    }
  });

  router.post("/ai/translate-menu", requireAdmin, async (req, res) => {
    const text = cleanText(req.body?.text, 5000);
    const field = req.body?.field === "name" ? "name" : req.body?.field === "description" ? "description" : "";
    const model = cleanText(req.body?.model, 200);
    const maxCharacters = Number.isInteger(req.body?.max_characters)
      ? Math.max(1, Math.min(req.body.max_characters, 5000))
      : 5000;
    if (!text || !field || !model) {
      return res.status(400).json({ error: "Provide menu text, its field type, and an installed local model." });
    }

    try {
      const isTranslateGemma = model.toLowerCase().includes("translategemma");
      const prompt = isTranslateGemma
        ? `You are a professional English (en) to Finnish (fi) translator. Accurately convey the meaning and nuances of the original text using natural Finnish. Produce only the Finnish translation, without explanations or commentary. For menu item names, preserve established Indian dish names and translate quantities or serving labels naturally. Preserve Indian ingredient names: moong dal means mungpavut, ghee and paneer remain ghee and paneer. Example: "Rich and aromatic Indian dessert made with roasted moong dal, ghee, sugar, and nuts." → "Täyteläinen ja aromaattinen intialainen jälkiruoka, joka on valmistettu paahdetuista mungpavuista, gheestä, sokerista ja pähkinöistä." Keep the output within ${maxCharacters} characters. Please translate the following English text into Finnish:\n\n\n${text}`
        : `Translate this restaurant menu ${field} from English into natural, concise Finnish. Preserve the meaning, Indian dish identity, ingredients, quantities and measurements. Keep dish names that have no established Finnish equivalent in their original form. Keep the translation within ${maxCharacters} characters. Return only the Finnish translation, with no labels or explanation.\n\n${text}`;
      const response = await fetch(`${ollamaUrl()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Translation models may need extra time on their first local load.
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          model,
          stream: false,
          keep_alive: "5m",
          messages: [{ role: "user", content: prompt }],
          options: { temperature: 0, num_ctx: 2048, num_predict: field === "name" ? 96 : 256 },
        }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        const details = cleanText(failure.error, 500);
        return res.status(502).json({ error: details ? `Ollama could not translate this text: ${details}` : `Ollama returned HTTP ${response.status}.` });
      }
      const result = await response.json();
      const translation = cleanText(result.message?.content, Math.min(maxCharacters, 5000));
      if (!translation) return res.status(502).json({ error: "Ollama returned an empty translation." });
      return res.json({ translation, model: result.model || model });
    } catch (error) {
      const message = error.name === "TimeoutError"
        ? "Finnish translation took too long. Check that the local model has finished loading, then try again."
        : error.cause?.code === "ECONNREFUSED" || error.name === "TypeError"
          ? "Ollama is not running. Start Ollama locally to translate menu text."
          : error.message || "Could not translate menu text.";
      return res.status(503).json({ error: message });
    }
  });

  router.post("/ai/generate", requireAdmin, async (req, res) => {
    const title = cleanText(req.body?.title, 200);
    const documentType = cleanText(req.body?.document_type, 100);
    const instructions = cleanText(req.body?.instructions, 10_000);
    const businessContext = cleanText(req.body?.business_context, 10_000);
    const model = cleanText(req.body?.model, 200);
    if (!title || !documentType || !instructions || !model) {
      return res.status(400).json({ error: "Enter a document title, type, instructions, and select an installed local model." });
    }

    try {
      const messages = [
        {
          role: "system",
          content: "Draft a complete, clear, practical business document for a small vegetarian Indian restaurant in Oulu, Finland. Aim for 500–700 words unless the user asks for more. Complete every requested section and checklist item, and finish with a clear final section; never stop mid-sentence or mid-checklist. Use only facts supplied by the user; mark unknown details as [TO BE COMPLETED] and never invent licenses, procedures, temperatures, legal requirements, or approvals. Treat regulatory or legal material as a draft that requires verification against current official guidance. Use headings, concise checklists, and editable plain text. Do not claim the document is officially approved or legally compliant.",
        },
        {
          role: "user",
          content: `Document title: ${title}\nDocument type: ${documentType}\nBusiness context: ${businessContext || "No additional details supplied."}\nInstructions: ${instructions}`,
        },
      ];
      const sections = [];
      let generatedModel = model;
      let completed = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(`${ollamaUrl()}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(300_000),
          body: JSON.stringify({
            model,
            stream: false,
            // Thinking models may otherwise use the response budget on their
            // separate reasoning channel and return no document text.
            think: false,
            keep_alive: "5m",
            messages,
            options: { temperature: 0.2, num_ctx: 8192, num_predict: 4096 },
          }),
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => ({}));
          const details = cleanText(failure.error, 500);
          console.error("Local document generation failed:", response.status, details || "No Ollama error details.");
          return res.status(502).json({
            error: details
              ? `Ollama could not generate the draft: ${details}`
              : `Ollama could not generate the draft (HTTP ${response.status}). Check the local Ollama log.`,
          });
        }
        const result = await response.json();
        generatedModel = result.model || generatedModel;
        const section = cleanText(result.message?.content, MAX_DRAFT_CHARACTERS - sections.join("\n\n").length);
        if (section) sections.push(section);
        if (result.done_reason !== "length") {
          completed = true;
          break;
        }
        messages.push(
          { role: "assistant", content: section },
          { role: "user", content: "Continue the same document from where you stopped. Do not repeat completed text. Finish every remaining requested section and end the document cleanly." }
        );
      }
      const content = cleanText(sections.join("\n\n"), MAX_DRAFT_CHARACTERS);
      if (!content) return res.status(502).json({ error: "The local model returned an empty draft. Try giving it more specific instructions." });
      if (!completed) return res.status(502).json({ error: "The model stopped before completing the report. Try a smaller request or select a lighter local model." });
      return res.json({ content, model: generatedModel });
    } catch (error) {
      const message = error.name === "TimeoutError"
        ? "The local model took too long to respond. Try a smaller model or a shorter request."
        : error.cause?.code === "ECONNREFUSED" || error.name === "TypeError"
          ? "Ollama is not running. Start Ollama locally and try again."
          : error.message || "Could not generate the document draft.";
      return res.status(503).json({ error: message });
    }
  });

  router.post("/", requireAdmin, upload.single("file"), async (req, res) => {
    const title = cleanText(req.body?.title, 200);
    const documentType = cleanText(req.body?.document_type, 100);
    const notes = cleanText(req.body?.notes, 2000);
    const content = cleanText(req.body?.content_text, MAX_DRAFT_CHARACTERS);
    const source = req.file ? "uploaded" : "ai_draft";
    const model = cleanText(req.body?.ai_model, 200);
    if (!title || !documentType || (!req.file && !content)) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: "Provide a title, document type, and either a file or draft text." });
    }

    if (req.file) {
      const extension = path.extname(req.file.originalname).toLowerCase();
      const bytes = await fs.readFile(req.file.path);
      if (!isSupportedFile(bytes, extension)) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ error: "The file contents do not match a supported document format." });
      }
    }

    try {
      const [result] = await pool.execute(
        `INSERT INTO business_documents
           (title, document_type, notes, original_filename, storage_key, mime_type, source, content_text, ai_model)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          documentType,
          notes || null,
          req.file?.originalname || `${title}.txt`,
          req.file?.filename || null,
          req.file?.mimetype || "text/plain; charset=utf-8",
          source,
          req.file ? null : content,
          source === "ai_draft" ? model || null : null,
        ]
      );
      return res.status(201).json({ message: "Document saved.", document_id: result.insertId });
    } catch (error) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      console.error("POST /api/admin/documents failed:", error.code || "UNKNOWN");
      return res.status(500).json({ error: "Could not save the document. Apply database migration 009 first." });
    }
  });

  router.put("/:id", requireAdmin, upload.single("file"), async (req, res) => {
    const documentId = Number(req.params.id);
    const removeNewUpload = async () => {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
    };
    if (!Number.isSafeInteger(documentId) || documentId < 1) {
      await removeNewUpload();
      return res.status(400).json({ error: "Invalid document ID." });
    }

    const title = cleanText(req.body?.title, 200);
    const documentType = cleanText(req.body?.document_type, 100);
    const notes = cleanText(req.body?.notes, 2000);
    if (!title || !documentType) {
      await removeNewUpload();
      return res.status(400).json({ error: "Enter a document name and type." });
    }

    if (req.file) {
      const extension = path.extname(req.file.originalname).toLowerCase();
      let bytes;
      try {
        bytes = await fs.readFile(req.file.path);
      } catch {
        await removeNewUpload();
        return res.status(500).json({ error: "Could not read the replacement document." });
      }
      if (!isSupportedFile(bytes, extension)) {
        await removeNewUpload();
        return res.status(400).json({ error: "The file contents do not match a supported document format." });
      }
    }

    try {
      const [rows] = await pool.execute(
        "SELECT storage_key FROM business_documents WHERE document_id = ? LIMIT 1",
        [documentId]
      );
      if (!rows.length) {
        await removeNewUpload();
        return res.status(404).json({ error: "Document not found." });
      }

      if (req.file) {
        await pool.execute(
          `UPDATE business_documents
           SET title = ?, document_type = ?, notes = ?, original_filename = ?, storage_key = ?, mime_type = ?,
               source = 'uploaded', content_text = NULL, ai_model = NULL
           WHERE document_id = ?`,
          [title, documentType, notes || null, req.file.originalname, req.file.filename, req.file.mimetype, documentId]
        );
        if (rows[0].storage_key) {
          const oldFile = path.resolve(privateDir, path.basename(rows[0].storage_key));
          if (path.dirname(oldFile) === privateDir) await fs.unlink(oldFile).catch(() => {});
        }
      } else {
        await pool.execute(
          "UPDATE business_documents SET title = ?, document_type = ?, notes = ? WHERE document_id = ?",
          [title, documentType, notes || null, documentId]
        );
      }

      return res.json({ message: "Document updated." });
    } catch (error) {
      await removeNewUpload();
      console.error("PUT /api/admin/documents/:id failed:", error.code || "UNKNOWN");
      return res.status(500).json({ error: "Could not update this document." });
    }
  });

  router.get("/:id/content", requireAdmin, async (req, res) => {
    const documentId = Number(req.params.id);
    if (!Number.isSafeInteger(documentId) || documentId < 1) return res.status(400).json({ error: "Invalid document ID." });
    try {
      const [rows] = await pool.execute(
        "SELECT title, document_type, source, content_text FROM business_documents WHERE document_id = ? LIMIT 1",
        [documentId]
      );
      if (!rows.length) return res.status(404).json({ error: "Document not found." });
      const savedDocument = rows[0];
      if (savedDocument.source !== "ai_draft" || !savedDocument.content_text) {
        return res.status(400).json({ error: "Only saved AI drafts can be printed with the Desi Dawat letterhead." });
      }
      return res.json({
        title: savedDocument.title,
        document_type: savedDocument.document_type,
        content_text: savedDocument.content_text,
      });
    } catch (error) {
      console.error("GET /api/admin/documents/:id/content failed:", error.code || "UNKNOWN");
      return res.status(500).json({ error: "Could not prepare this report." });
    }
  });

  router.get("/:id/download", requireAdmin, async (req, res) => {
    const documentId = Number(req.params.id);
    if (!Number.isSafeInteger(documentId) || documentId < 1) return res.status(400).json({ error: "Invalid document ID." });
    try {
      const [rows] = await pool.execute(
        "SELECT title, original_filename, storage_key, mime_type, content_text FROM business_documents WHERE document_id = ? LIMIT 1",
        [documentId]
      );
      if (!rows.length) return res.status(404).json({ error: "Document not found." });
      const document = rows[0];
      if (document.storage_key) {
        const resolved = path.resolve(privateDir, path.basename(document.storage_key));
        if (path.dirname(resolved) !== privateDir) return res.status(404).json({ error: "Document file not found." });
        return res.download(resolved, path.basename(document.original_filename), (error) => {
          if (error && !res.headersSent) res.status(404).json({ error: "Document file not found." });
        });
      }
      const safeTitle = path.basename(document.title).replace(/[<>:"/\\|?*]/g, "-");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${safeTitle || "business-document"}.txt"`);
      return res.send(document.content_text || "");
    } catch (error) {
      console.error("GET /api/admin/documents/:id/download failed:", error.code || "UNKNOWN");
      return res.status(500).json({ error: "Could not download this document." });
    }
  });

  router.get("/:id/content", requireAdmin, async (req, res) => {
    const documentId = Number(req.params.id);
    if (!Number.isSafeInteger(documentId) || documentId < 1) return res.status(400).json({ error: "Invalid document ID." });
    try {
      const [rows] = await pool.execute(
        "SELECT title, document_type, source, content_text FROM business_documents WHERE document_id = ? LIMIT 1",
        [documentId]
      );
      if (!rows.length) return res.status(404).json({ error: "Document not found." });
      const savedDocument = rows[0];
      if (savedDocument.source !== "ai_draft" || !savedDocument.content_text) {
        return res.status(400).json({ error: "Only saved AI drafts can be printed with the Desi Dawat letterhead." });
      }
      return res.json({
        title: savedDocument.title,
        document_type: savedDocument.document_type,
        content_text: savedDocument.content_text,
      });
    } catch (error) {
      console.error("GET /api/admin/documents/:id/content failed:", error.code || "UNKNOWN");
      return res.status(500).json({ error: "Could not prepare this report." });
    }
  });

  router.delete("/:id", requireAdmin, async (req, res) => {
    const documentId = Number(req.params.id);
    if (!Number.isSafeInteger(documentId) || documentId < 1) return res.status(400).json({ error: "Invalid document ID." });
    try {
      const [rows] = await pool.execute("SELECT storage_key FROM business_documents WHERE document_id = ? LIMIT 1", [documentId]);
      if (!rows.length) return res.status(404).json({ error: "Document not found." });
      await pool.execute("DELETE FROM business_documents WHERE document_id = ?", [documentId]);
      if (rows[0].storage_key) {
        const resolved = path.resolve(privateDir, path.basename(rows[0].storage_key));
        if (path.dirname(resolved) === privateDir) await fs.unlink(resolved).catch(() => {});
      }
      return res.json({ message: "Document removed." });
    } catch (error) {
      console.error("DELETE /api/admin/documents/:id failed:", error.code || "UNKNOWN");
      return res.status(500).json({ error: "Could not remove this document." });
    }
  });

  return router;
}
