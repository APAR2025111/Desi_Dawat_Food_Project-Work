import React, { useEffect, useState } from "react";
import { getAboutPage, resolveImageUrl } from "../api.js";

export default function AboutPage() {
  const [about, setAbout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getAboutPage()
      .then(setAbout)
      .catch((loadError) => setError(loadError.message || "About Us content is unavailable right now."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="about-page">
      <header className="about-heading">
        <span className="eyebrow">DESI DAWAT · OULU</span>
        <h1>{about?.title || "About Desi Dawat"}</h1>
        <p>Perinteinen intialainen perhekeittiö · Oulu</p>
        <p>Traditional Indian Family Kitchen · Oulu</p>
      </header>

      {loading ? (
        <p className="about-state">Loading our story…</p>
      ) : error ? (
        <p className="notice about-state" role="status">{error}</p>
      ) : (
        <>
          <div className="about-description">
            {about?.description ? (
              about.description.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))
            ) : (
              <p className="about-placeholder">Our story, kitchen, and the people behind Desi Dawat will be shared here soon.</p>
            )}
          </div>

          {about?.media?.length ? (
            <div className="about-media-grid">
              {about.media.map((media) => {
                const src = resolveImageUrl(media.media_url);
                return (
                  <figure className="about-media-card" key={media.media_id}>
                    {media.media_type === "video" ? (
                      <video controls preload="metadata" src={src} aria-label="Desi Dawat video" />
                    ) : (
                      <img src={src} alt={media.alt_text || "Desi Dawat kitchen and food"} loading="lazy" />
                    )}
                  </figure>
                );
              })}
            </div>
          ) : (
            <div className="about-media-placeholder">
              <div><span aria-hidden="true">📷</span><strong>Photos coming soon</strong></div>
              <div><span aria-hidden="true">▶</span><strong>Videos coming soon</strong></div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
