-- Apply after 20261113_won_consolidation.sql. No existing outcomes or policies change.
BEGIN;
CREATE TABLE IF NOT EXISTS customer_acceptance_files (
  tenant_id text NOT NULL,
  proposal_id text NOT NULL,
  evidence_id uuid NOT NULL DEFAULT gen_random_uuid(),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/png', 'image/jpeg', 'message/rfc822')),
  file_data bytea NOT NULL CHECK (octet_length(file_data) BETWEEN 1 AND 3145728),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, proposal_id, evidence_id),
  UNIQUE (tenant_id, proposal_id, sha256),
  FOREIGN KEY (tenant_id, proposal_id) REFERENCES proposals(tenant_id, proposal_id)
);
COMMIT;
