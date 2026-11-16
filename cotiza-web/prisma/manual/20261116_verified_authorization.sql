-- Esquema aditivo del piloto. Aplicar una vez, con conexión directa y ON_ERROR_STOP.
BEGIN;
-- CreateTable
CREATE TABLE "approval_credentials" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rp_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "device_type" TEXT NOT NULL,
    "backed_up" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "approval_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "initiator_id" TEXT NOT NULL,
    "approver_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "credential_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "decided_at" TIMESTAMPTZ(6),
    "consumed_at" TIMESTAMPTZ(6),
    "result" JSONB,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_enrollment_grants" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_request_id" TEXT,
    "bootstrap_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "approval_enrollment_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_challenges" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "request_id" TEXT,
    "grant_id" TEXT,
    "label" TEXT,
    "decision" TEXT,
    "challenge" TEXT NOT NULL,
    "payload_hash" TEXT,
    "binding" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),

    CONSTRAINT "approval_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "previous_hash" TEXT NOT NULL,
    "event_hash" TEXT NOT NULL,
    "record" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_rate_buckets" (
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "window" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "approval_rate_buckets_pkey" PRIMARY KEY ("tenant_id","user_id","scope","window")
);

-- CreateIndex
CREATE INDEX "approval_credentials_tenant_id_user_id_revoked_at_idx" ON "approval_credentials"("tenant_id", "user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "approval_credentials_rp_id_credential_id_key" ON "approval_credentials"("rp_id", "credential_id");

-- CreateIndex
CREATE INDEX "approval_requests_tenant_id_initiator_id_created_at_idx" ON "approval_requests"("tenant_id", "initiator_id", "created_at");

-- CreateIndex
CREATE INDEX "approval_requests_tenant_id_approver_id_state_idx" ON "approval_requests"("tenant_id", "approver_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "approval_enrollment_grants_source_request_id_key" ON "approval_enrollment_grants"("source_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_enrollment_grants_bootstrap_key_key" ON "approval_enrollment_grants"("bootstrap_key");

-- CreateIndex
CREATE INDEX "approval_enrollment_grants_tenant_id_user_id_expires_at_idx" ON "approval_enrollment_grants"("tenant_id", "user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "approval_challenges_challenge_key" ON "approval_challenges"("challenge");

-- CreateIndex
CREATE INDEX "approval_challenges_tenant_id_user_id_expires_at_idx" ON "approval_challenges"("tenant_id", "user_id", "expires_at");

-- CreateIndex
CREATE INDEX "approval_events_tenant_id_case_id_idx" ON "approval_events"("tenant_id", "case_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_events_tenant_id_case_id_sequence_key" ON "approval_events"("tenant_id", "case_id", "sequence");

-- AddForeignKey
ALTER TABLE "approval_credentials" ADD CONSTRAINT "approval_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "approval_enrollment_grants" ADD CONSTRAINT "approval_enrollment_grants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "approval_challenges" ADD CONSTRAINT "approval_challenges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "approval_rate_buckets" ADD CONSTRAINT "approval_rate_buckets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Append-only guard
CREATE FUNCTION cotiza_approval_event_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Recordia approval events are append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER cotiza_approval_event_append_only BEFORE UPDATE OR DELETE ON approval_events
FOR EACH ROW EXECUTE FUNCTION cotiza_approval_event_append_only();
ALTER TABLE approval_events ADD CONSTRAINT approval_event_sequence_positive CHECK (sequence > 0);
ALTER TABLE approval_events ADD CONSTRAINT approval_event_hash_format CHECK (event_hash ~ '^[a-f0-9]{64}$' AND previous_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE approval_credentials ADD CONSTRAINT approval_credential_backup_valid CHECK (device_type IN ('singleDevice','multiDevice') AND NOT (device_type = 'singleDevice' AND backed_up));
ALTER TABLE approval_requests ADD CONSTRAINT approval_request_state_valid CHECK (state IN ('pending','approved','rejected','expired','cancelled','invalidated','consumed'));
COMMIT;
