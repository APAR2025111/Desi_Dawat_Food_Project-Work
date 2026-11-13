import React, { useCallback, useEffect, useState } from "react";
import {
  deleteBusinessDocument,
  downloadBusinessDocument,
  getBusinessDocumentContent,
  generateBusinessDocumentDraft,
  getAdminDocuments,
  getLocalAiModels,
  saveBusinessDocumentDraft,
  updateBusinessDocument,
  uploadBusinessDocument,
} from "../api.js";
import { LETTERHEAD } from "../../../shared/letterhead.js";
import { downloadBusinessDocumentPdf } from "../utils/businessDocumentPdf.js";

const emptyUpload = { title: "", document_type: "", notes: "" };
const emptyDraft = {
  title: "",
  document_type: "",
  instructions: "",
  model: "",
};
const STANDARD_DOCUMENT_TYPES = [
  "Food safety",
  "Registration",
  "Insurance",
  "Lease",
  "Tax",
  "Employment",
  "Supplier",
  "Menu and allergens",
  "Invoice or receipt",
  "Permit or licence",
];

function DocumentTypeField({ value, onChange, placeholder = "Choose a document type" }) {
  const [customMode, setCustomMode] = useState(Boolean(value) && !STANDARD_DOCUMENT_TYPES.includes(value));

  function handleSelect(event) {
    const nextValue = event.target.value;
    if (nextValue === "__custom__") {
      setCustomMode(true);
      if (!customMode) onChange("");
      return;
    }
    setCustomMode(false);
    onChange(nextValue);
  }

  return (
    <>
      <select required value={customMode ? "__custom__" : value} onChange={handleSelect}>
        <option value="" disabled>{placeholder}</option>
        {STANDARD_DOCUMENT_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}
        <option value="__custom__">Other — enter a custom type</option>
      </select>
      {customMode && (
        <input
          required
          maxLength={100}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type your document type"
          aria-label="Custom document type"
        />
      )}
    </>
  );
}

function localDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleDateString();
}

export default function DocumentsManagement({ token }) {
  const [documents, setDocuments] = useState([]);
  const [editingDocument, setEditingDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState([]);
  const [aiStatus, setAiStatus] = useState("Checking local AI…");
  const [upload, setUpload] = useState(emptyUpload);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadTypeReset, setUploadTypeReset] = useState(0);
  const [draft, setDraft] = useState(emptyDraft);
  const [draftTypeReset, setDraftTypeReset] = useState(0);
  const [draftText, setDraftText] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const loadDocuments = useCallback(async () => {
    const result = await getAdminDocuments(token);
    setDocuments(Array.isArray(result.documents) ? result.documents : []);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getAdminDocuments(token), getLocalAiModels(token)]).then(([documentsResult, aiResult]) => {
      if (cancelled) return;
      if (documentsResult.status === "fulfilled") {
        setDocuments(Array.isArray(documentsResult.value.documents) ? documentsResult.value.documents : []);
      } else {
        setError(documentsResult.reason?.message || "Could not load business documents. Apply database migration 009 first.");
      }
      if (aiResult.status === "fulfilled") {
        const availableModels = Array.isArray(aiResult.value.models) ? aiResult.value.models : [];
        setModels(availableModels);
        setAiStatus(aiResult.value.available
          ? availableModels.length ? "Ollama is ready." : "Ollama is running, but no local models are installed."
          : aiResult.value.message || "Ollama is not running.");
        if (availableModels.length) {
          setDraft((current) => ({ ...current, model: current.model || availableModels[0].name }));
        }
      } else {
        setAiStatus(aiResult.reason?.message || "Could not check the local AI service.");
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token]);

  async function handleUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedFile) {
      setError("Choose a document file to upload.");
      return;
    }
    setBusy("upload");
    setError("");
    setMessage("");
    try {
      await uploadBusinessDocument(token, selectedFile, upload);
      form.reset();
      setUpload(emptyUpload);
      setUploadTypeReset((version) => version + 1);
      setSelectedFile(null);
      await loadDocuments();
      setMessage("Document uploaded and stored privately.");
    } catch (uploadError) {
      setError(uploadError.message || "Could not upload this document.");
    } finally {
      setBusy("");
    }
  }

  async function handleGenerate(event) {
    event.preventDefault();
    setBusy("generate");
    setError("");
    setMessage("");
    setDraftText("");
    try {
      const result = await generateBusinessDocumentDraft(token, {
        ...draft,
        business_context: `${LETTERHEAD.name}; ${LETTERHEAD.english}; ${LETTERHEAD.address}, Finland; phone ${LETTERHEAD.phone}; email ${LETTERHEAD.email}.`,
      });
      setDraftText(result.content || "");
      setDraftModel(result.model || draft.model);
      setMessage("Draft generated locally. Review and edit it before saving.");
    } catch (generationError) {
      setError(generationError.message || "Could not generate a draft.");
    } finally {
      setBusy("");
    }
  }

  async function handleSaveDraft() {
    setBusy("save-draft");
    setError("");
    setMessage("");
    try {
      await saveBusinessDocumentDraft(token, {
        title: draft.title,
        document_type: draft.document_type,
        notes: "AI-generated draft. Please review before use.",
        content_text: draftText,
        ai_model: draftModel,
      });
      await loadDocuments();
      setDraft(emptyDraft);
      setDraftTypeReset((version) => version + 1);
      setDraftText("");
      setDraftModel("");
      setMessage("AI draft saved to Document Management.");
    } catch (saveError) {
      setError(saveError.message || "Could not save this draft.");
    } finally {
      setBusy("");
    }
  }

  async function handleDownload(document) {
    setBusy(`download-${document.document_id}`);
    setError("");
    setMessage("");
    try {
      await downloadBusinessDocument(token, document.document_id, document.original_filename);
      setMessage(`Downloaded “${document.title}”.`);
    } catch (downloadError) {
      setError(downloadError.message || "Could not download this document.");
    } finally {
      setBusy("");
    }
  }

  async function handleSaveDocumentEdit(event) {
    event.preventDefault();
    if (!editingDocument) return;
    const documentId = editingDocument.document_id;
    setBusy(`edit-${documentId}`);
    setError("");
    setMessage("");
    try {
      await updateBusinessDocument(token, documentId, editingDocument);
      setEditingDocument(null);
      setMessage("Document details updated.");
      try {
        await loadDocuments();
      } catch {
        setError("The document was updated, but the list could not be refreshed. Reload this page to see the saved changes.");
      }
    } catch (updateError) {
      setError(updateError.message || "Could not update this document.");
    } finally {
      setBusy("");
    }
  }

  async function handleDownloadDraftPdf() {
    setBusy("pdf-draft");
    setError("");
    setMessage("");
    try {
      await downloadBusinessDocumentPdf(draft.title, draft.document_type, draftText);
      setMessage("Branded PDF report downloaded.");
    } catch (pdfError) {
      setError(pdfError.message || "Could not create the PDF report.");
    } finally {
      setBusy("");
    }
  }

  async function handleDownloadSavedDraftPdf(document) {
    setBusy(`pdf-${document.document_id}`);
    setError("");
    setMessage("");
    try {
      const saved = await getBusinessDocumentContent(token, document.document_id);
      await downloadBusinessDocumentPdf(saved.title, saved.document_type, saved.content_text);
      setMessage("Branded PDF report downloaded.");
    } catch (pdfError) {
      setError(pdfError.message || "Could not prepare this report as a PDF.");
    } finally {
      setBusy("");
    }
  }

  async function handleDelete(document) {
    if (!window.confirm(`Permanently remove “${document.title}” and its stored file?`)) return;
    setBusy(`delete-${document.document_id}`);
    setError("");
    setMessage("");
    try {
      await deleteBusinessDocument(token, document.document_id);
      setDocuments((current) => current.filter((item) => item.document_id !== document.document_id));
      setMessage("Document removed.");
    } catch (deleteError) {
      setError(deleteError.message || "Could not remove this document.");
    } finally {
      setBusy("");
    }
  }

  const documentGroups = Object.values(documents.reduce((groups, document) => {
    const category = document.document_type?.trim() || "Uncategorized";
    if (!groups[category]) groups[category] = { category, documents: [] };
    groups[category].documents.push(document);
    return groups;
  }, {})).sort((left, right) => left.category.localeCompare(right.category));

  async function handleCheckLocalAi() {
    setAiStatus("Checking local AI…");
    setError("");
    try {
      const result = await getLocalAiModels(token);
      const availableModels = Array.isArray(result.models) ? result.models : [];
      setModels(availableModels);
      setAiStatus(result.available
        ? availableModels.length ? "Ollama is ready." : "Ollama is running, but no local models are installed."
        : result.message || "Ollama is not running.");
      if (availableModels.length) setDraft((current) => ({ ...current, model: availableModels[0].name }));
    } catch (checkError) {
      setModels([]);
      setAiStatus(checkError.message || "Could not check the local AI service.");
    }
  }

  return (
    <div className="documents-management">
      <p className="documents-private-note">
        Business files are stored in a private server folder and served only to signed-in admins. The local AI receives only the title, context, and instructions you enter; uploaded files are not sent to it.
      </p>

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}

      <section className="panel documents-panel">
        <div className="panel-heading">
          <div><h2>Store a business document</h2><p className="muted">PDF, Word, OpenDocument, or plain text · up to 25 MB</p></div>
        </div>
        <form className="documents-form" onSubmit={handleUpload}>
          <label>Document name<input required maxLength={200} value={upload.title} onChange={(event) => setUpload({ ...upload, title: event.target.value })} placeholder="e.g. Kitchen self-monitoring plan" /></label>
          <label>Document type<DocumentTypeField key={uploadTypeReset} value={upload.document_type} onChange={(document_type) => setUpload((current) => ({ ...current, document_type }))} /></label>
          <label className="documents-wide-field">Description or notes<textarea rows={2} maxLength={2000} value={upload.notes} onChange={(event) => setUpload({ ...upload, notes: event.target.value })} placeholder="Optional details to help you find this document later" /></label>
          <label className="documents-wide-field">Choose file<input required type="file" accept=".pdf,.doc,.docx,.odt,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,text/plain" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} /></label>
          <button className="button button-primary" type="submit" disabled={busy !== ""}>{busy === "upload" ? "Uploading…" : "Upload and save"}</button>
        </form>
      </section>

      <section className="panel documents-panel">
        <div className="panel-heading">
          <div><h2>Create a document draft with local AI</h2><p className="muted">Generated text stays on this computer and remains editable before you save it.</p></div>
          <div className="documents-ai-controls"><span className={`documents-ai-status ${models.length ? "is-ready" : ""}`} role="status">{aiStatus}</span><button className="button button-outline" type="button" disabled={busy !== ""} onClick={handleCheckLocalAi}>Check local AI</button></div>
        </div>
        <form className="documents-form" onSubmit={handleGenerate}>
          <label>Document title<input required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="e.g. Kitchen self-monitoring plan" /></label>
          <label>Document type<DocumentTypeField key={draftTypeReset} value={draft.document_type} onChange={(document_type) => setDraft((current) => ({ ...current, document_type }))} /></label>
          <label>Local model<select required value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} disabled={!models.length}>
            <option value="">{models.length ? "Choose an installed model" : "No local models available"}</option>
            {models.map((model) => <option value={model.name} key={model.name}>{model.name}</option>)}
          </select></label>
          <label className="documents-wide-field">What should the document contain?<textarea required rows={4} maxLength={10000} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} placeholder="Describe the document you need and the sections, checks, or format you want." /></label>
          <button className="button button-primary" type="submit" disabled={!models.length || busy !== ""}>{busy === "generate" ? "Generating locally…" : "Generate editable draft"}</button>
        </form>
        {draftText && (
          <div className="documents-draft-editor">
            <label>Review and edit the draft<textarea rows={18} value={draftText} onChange={(event) => setDraftText(event.target.value)} /></label>
            <p className="muted">Draft from {draftModel || "local model"}. Verify operational and regulatory details before relying on it.</p>
            <button className="button button-outline" type="button" disabled={busy !== ""} onClick={handleDownloadDraftPdf}>{busy === "pdf-draft" ? "Creating PDF…" : "Download PDF report"}</button>
            <button className="button button-primary" type="button" disabled={busy !== ""} onClick={handleSaveDraft}>{busy === "save-draft" ? "Saving…" : "Save draft to documents"}</button>
          </div>
        )}
      </section>

      <section className="panel documents-panel">
        <div className="panel-heading"><div><h2>Stored business documents</h2><p className="muted">Private files and saved AI drafts · grouped by document type</p></div><span className="documents-count">{documents.length}</span></div>
        {loading ? <p>Loading documents…</p> : documents.length ? (
          <div className="documents-categories">
            {documentGroups.map(({ category, documents: groupedDocuments }) => (
              <details className="documents-category" key={category}>
                <summary className="documents-category-summary">
                  <span className="documents-category-title">{category}</span>
                  <span className="documents-category-count">{groupedDocuments.length} {groupedDocuments.length === 1 ? "document" : "documents"}</span>
                </summary>
                <div className="documents-list">
                  {groupedDocuments.map((document) => (
                    <article className="documents-list-item" key={document.document_id}>
                      <div className="documents-list-content">
                        <div><h3>{document.title}</h3><p>{document.document_type} · {document.source === "ai_draft" ? `AI draft${document.ai_model ? ` · ${document.ai_model}` : ""}` : "Uploaded file"}</p><small>{document.original_filename} · Added {localDate(document.created_at)}</small>{document.notes && <p className="documents-list-notes">{document.notes}</p>}</div>
                        <div className="documents-actions">
                          <button className="button button-outline" type="button" disabled={busy !== ""} onClick={() => setEditingDocument({ document_id: document.document_id, title: document.title, document_type: document.document_type, notes: document.notes || "", file: null })}>Edit</button>
                          {document.source === "ai_draft" ? <button className="button button-outline" type="button" disabled={busy !== ""} onClick={() => handleDownloadSavedDraftPdf(document)}>{busy === `pdf-${document.document_id}` ? "Creating PDF…" : "Download PDF"}</button> : <button className="button button-outline" type="button" disabled={busy !== ""} onClick={() => handleDownload(document)}>{busy === `download-${document.document_id}` ? "Preparing…" : "Download"}</button>}
                          <button className="text-button danger-text" type="button" disabled={busy !== ""} onClick={() => handleDelete(document)}>{busy === `delete-${document.document_id}` ? "Removing…" : "Remove"}</button>
                        </div>
                      </div>
                      {editingDocument?.document_id === document.document_id && (
                        <form className="documents-edit-form" onSubmit={handleSaveDocumentEdit}>
                          <label>Document name<input required maxLength={200} value={editingDocument.title} onChange={(event) => setEditingDocument((current) => ({ ...current, title: event.target.value }))} /></label>
                          <label>Document type<DocumentTypeField key={document.document_id} value={editingDocument.document_type} onChange={(document_type) => setEditingDocument((current) => ({ ...current, document_type }))} /></label>
                          <label className="documents-wide-field">Description or notes<textarea rows={2} maxLength={2000} value={editingDocument.notes} onChange={(event) => setEditingDocument((current) => ({ ...current, notes: event.target.value }))} /></label>
                          <label className="documents-wide-field">Replace file (optional)<input type="file" accept=".pdf,.doc,.docx,.odt,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,text/plain" onChange={(event) => setEditingDocument((current) => ({ ...current, file: event.target.files?.[0] || null }))} /><small>Leave this empty to keep the current file. Maximum file size: 25 MB.</small></label>
                          <div className="documents-edit-actions">
                            <button className="button button-primary" type="submit" disabled={busy !== ""}>{busy === `edit-${document.document_id}` ? "Saving…" : "Save changes"}</button>
                            <button className="button button-outline" type="button" disabled={busy !== ""} onClick={() => setEditingDocument(null)}>Cancel</button>
                          </div>
                        </form>
                      )}
                    </article>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : <p>No business documents saved yet.</p>}
      </section>
    </div>
  );
}
