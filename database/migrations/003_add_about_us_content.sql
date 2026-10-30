-- Admin-managed About Us page text and media references.
-- Media files remain in UPLOAD_DIR; this schema stores only safe relative URLs.
CREATE TABLE IF NOT EXISTS about_page_content (
  content_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS about_page_media (
  media_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  media_url VARCHAR(500) NOT NULL,
  media_type ENUM('image', 'video') NOT NULL,
  alt_text VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_about_page_media_order (sort_order, media_id)
);

INSERT IGNORE INTO about_page_content (content_id, title, description)
VALUES (1, 'About Desi Dawat', 'Share your kitchen story and introduce the people behind Desi Dawat. You can edit this text and add photos or videos from the admin panel.');
