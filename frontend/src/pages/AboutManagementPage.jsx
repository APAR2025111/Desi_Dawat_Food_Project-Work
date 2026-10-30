import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteAboutMedia, getAboutPage, resolveImageUrl, saveAboutPage, uploadAboutMedia } from "../api.js";

export default function AboutManagementPage() {
  const token = sessionStorage.getItem("desiDawatAdminToken") || "";
  const [title, setTitle] = useState("About Desi Dawat");
  const [description, setDescription] = useState("");
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    getAboutPage()
      .then((data) => {
        setTitle(data.title || "About Desi Dawat");
        setDescription(data.description || "");
        setMedia(Array.isArray(data.media) ? data.media : []);
      })
      .catch((loadError) => setError(loadError.message || "Could not load About Us content."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await saveAboutPage(token, { title, description });
      setTitle(result.title || title.trim());
      setDescription(result.description ?? description);
      setMessage("About Us text saved.");
    } catch (saveError) {
      setError(saveError.message || "Could not save About Us text.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const result = await uploadAboutMedia(token, file);
      setMedia((current) => [...current, result.media]);
      setMessage("Media uploaded and added to the About Us page.");
    } catch (uploadError) {
      setError(uploadError.message || "Could not upload this media file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(mediaItem) {
    if (!window.confirm("Remove this photo or video from the About Us page?")) return;
    setRemovingId(mediaItem.media_id);
    setError("");
    setMessage("");
    try {
      await deleteAboutMedia(token, mediaItem.media_id);
      setMedia((current) => current.filter((item) => item.media_id !== mediaItem.media_id));
      setMessage("Media removed.");
    } catch (deleteError) {
      setError(deleteError.message || "Could not remove this media file.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="admin-page about-admin-page">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">PRIVATE AREA</span>
          <h1>About Us content</h1>
          <p className="muted">Write your story and manage the photos and videos shown to customers.</p>
        </div>
        <Link className="button button-outline" to="/admin">Back to dashboard</Link>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
      {loading ? <p>Loading About Us content…</p> : (
        <>
          <form className="panel about-admin-form" onSubmit={handleSave}>
            <label>
              Page heading
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required />
            </label>
            <label>
              Description
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={9} maxLength={10000} placeholder="Tell customers about your kitchen, your food, and the people behind Desi Dawat." />
              <small>{description.length}/10000 characters. Separate paragraphs with a blank line.</small>
            </label>
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save About Us text"}
            </button>
          </form>

          <section className="panel about-media-admin">
            <div className="panel-heading">
              <div><h2>Photos and videos</h2><p className="muted">JPG, PNG, WebP, MP4, or WebM · up to 50 MB per file</p></div>
              <label className="button button-outline about-upload-button">
                {uploading ? "Uploading…" : "Upload media"}
                <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
            {media.length ? (
              <div className="about-admin-media-grid">
                {media.map((item) => (
                  <article className="about-admin-media-item" key={item.media_id}>
                    {item.media_type === "video" ? (
                      <video controls preload="metadata" src={resolveImageUrl(item.media_url)} />
                    ) : (
                      <img src={resolveImageUrl(item.media_url)} alt={item.alt_text || "About Desi Dawat"} />
                    )}
                    <div className="about-admin-media-footer">
                      <span>{item.media_type === "video" ? "Video" : "Image"}</span>
                      <button type="button" className="text-button danger-text" onClick={() => handleDelete(item)} disabled={removingId === item.media_id}>
                        {removingId === item.media_id ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="about-admin-empty">No photos or videos added yet. Use Upload media to build this section.</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
