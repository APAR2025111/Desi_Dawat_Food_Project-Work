-- Private business document metadata and locally generated editable drafts.
-- Uploaded files are stored outside the public /uploads directory by the API.
CREATE TABLE IF NOT EXISTS business_documents (
  document_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  notes VARCHAR(2000) NULL,
  original_filename VARCHAR(255) NOT NULL,
  storage_key VARCHAR(100) NULL,
  mime_type VARCHAR(150) NOT NULL,
  source ENUM('uploaded', 'ai_draft') NOT NULL,
  content_text LONGTEXT NULL,
  ai_model VARCHAR(200) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_business_documents_updated (updated_at, document_id),
  INDEX idx_business_documents_type (document_type)
);
