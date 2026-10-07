-- A1-S: Virtual PostgreSQL database for Zeus Secretariat sandbox trials.
-- Database: zeus_secretariat_sandbox (PostgreSQL 15.19, local cluster).
-- Role: zeus_sandbox (sandbox-only credentials; no production secrets).
-- These tables mirror the durable-evidence contracts that the Secretariat
-- core requires (DurableEvidenceStore / ExecutionStore / AtomicSettlementHandoff)
-- so that every fact Argus-driven traffic produces is persisted durably.

CREATE TABLE IF NOT EXISTS operations (
  operation_id     text PRIMARY KEY,
  request_id       text NOT NULL,
  client_id        text,
  subject          text NOT NULL,             -- clawrouter | franklin | blockrun
  scenario         text NOT NULL,             -- S1..S9 label of the trial
  state            text NOT NULL,             -- OperationStatus
  payment_state    text NOT NULL,
  execution_state  text NOT NULL,
  delivery_state   text NOT NULL,
  target           text NOT NULL,
  method           text NOT NULL,
  request_payload  jsonb,
  seller_capability jsonb,
  result_data      jsonb,
  error            text,
  timestamps       jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF EXISTS ops_client_request_uidx ON operations (client_id, request_id);
CREATE INDEX IF NOT EXISTS ops_subject_scenario_idx ON operations (subject, scenario);

CREATE TABLE IF NOT EXISTS evidence_records (
  id             bigserial PRIMARY KEY,
  operation_id   text NOT NULL REFERENCES operations(operation_id),
  subject        text NOT NULL,
  scenario       text NOT NULL,
  phase          text NOT NULL,               -- DISCOVERY|POLICY|PAYMENT|SETTLEMENT|EXECUTION|DELIVERY|RECOVERY|FINAL
  event          text NOT NULL,
  payload        jsonb,
  recorded_at    bigint NOT NULL,
  inserted_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ev_op_idx ON evidence_records (operation_id);
CREATE INDEX IF NOT EXISTS ev_subject_idx ON evidence_records (subject, scenario);

CREATE TABLE IF NOT EXISTS payment_intents (
  payment_intent_id      text PRIMARY KEY,
  operation_id           text NOT NULL REFERENCES operations(operation_id),
  request_id             text,
  client_id              text,
  subject                text NOT NULL,
  scenario               text NOT NULL,
  authorizer             text NOT NULL,
  pay_to                 text NOT NULL,
  value                  text NOT NULL,
  asset                  text NOT NULL,
  network                text NOT NULL,
  nonce                  text NOT NULL,
  valid_after            bigint NOT NULL,
  valid_before           bigint NOT NULL,
  payment_payload        text,
  payment_payload_hash   text,
  settlement_state       text NOT NULL,
  tx_hash                text,
  facilitator_http_status int,
  facilitator_response   jsonb,
  error_reason           text,
  settled_evidence_bundle jsonb,
  probe_count            int DEFAULT 0,
  created_at             bigint NOT NULL,
  updated_at             bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS pi_op_idx ON payment_intents (operation_id);
CREATE INDEX IF NOT EXISTS pi_state_idx ON payment_intents (settlement_state);

CREATE TABLE IF NOT EXISTS nonces (
  nonce        text PRIMARY KEY,
  operation_id text NOT NULL,
  payer        text NOT NULL,
  status       text NOT NULL,   -- RESERVED|SIGNED|SUBMITTED|SETTLED
  created_at   bigint NOT NULL,
  updated_at   bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_attempts (
  attempt_id       text PRIMARY KEY,
  operation_id     text NOT NULL,
  execution_id     text NOT NULL,
  subject          text NOT NULL,
  scenario         text NOT NULL,
  attempt_number   int NOT NULL,
  status           text NOT NULL,  -- PENDING|ATTEMPTED|SUCCESS|HTTP_FAILURE|DELIVERY_UNKNOWN|UNRESOLVABLE
  request_url      text,
  request_method   text,
  request_body     jsonb,
  response_status  int,
  response_body    jsonb,
  response_headers jsonb,
  error_reason     text,
  idempotency_key  text,
  started_at       bigint,
  completed_at     bigint,
  created_at       bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS ea_op_idx ON execution_attempts (operation_id);

CREATE TABLE IF NOT EXISTS recovery_jobs (
  job_id          text PRIMARY KEY,
  operation_id    text NOT NULL,
  job_type        text NOT NULL,   -- EXECUTION|RETRY|RETRIEVAL|OBSERVATION
  status          text NOT NULL,   -- PENDING|RUNNING|COMPLETED|FAILED|UNRESOLVABLE
  priority        int NOT NULL DEFAULT 0,
  max_attempts    int NOT NULL,
  current_attempt int NOT NULL DEFAULT 0,
  locked_by       text,
  locked_until    bigint,
  last_error      text,
  metadata        jsonb,
  created_at      bigint NOT NULL,
  updated_at      bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS reconciliation_jobs (
  job_id            text PRIMARY KEY,
  payment_intent_id text NOT NULL,
  status            text NOT NULL,
  next_probe_at     timestamptz NOT NULL,
  probe_count       int NOT NULL DEFAULT 0,
  worker_id         text,
  locked_until      bigint,
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reconciliation_observations (
  id                bigserial PRIMARY KEY,
  attempt_id        text NOT NULL,
  payment_intent_id text NOT NULL,
  timestamp         bigint NOT NULL,
  rpc_provider_id   text NOT NULL,
  head_block        bigint NOT NULL,
  authorization_state boolean,
  valid_before      bigint NOT NULL,
  result            text NOT NULL,
  error             text
);

CREATE TABLE IF NOT EXISTS argus_exchanges (
  id            bigserial PRIMARY KEY,
  subject       text NOT NULL,
  scenario      text NOT NULL,
  run_id        text NOT NULL,
  direction     text NOT NULL,
  exchange_type text NOT NULL,
  status        text NOT NULL,   -- success|failure|timeout|payment_required|unknown
  http_status   int,
  request_summary  jsonb,
  response_summary jsonb,
  secretariat_decision jsonb,     -- what the Secretariat did with this exchange
  observed_at   bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS ae_subject_idx ON argus_exchanges (subject, scenario);
