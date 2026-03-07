-- Verification runs — one per pipeline invocation (audit trail)
CREATE TABLE verification_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    pipeline_version TEXT NOT NULL DEFAULT '0.1.0',
    node_trace JSONB NOT NULL DEFAULT '[]',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed', 'rejected')),
    error TEXT,
    duration_ms INT
);

CREATE INDEX idx_verification_report ON verification_runs(report_id);

-- Confidence scores — FK to report + verification run
CREATE TABLE confidence_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    verification_run_id UUID NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
    publishability FLOAT NOT NULL CHECK (publishability >= 0.0 AND publishability <= 1.0),
    urgency FLOAT NOT NULL CHECK (urgency >= 0.0 AND urgency <= 1.0),
    access_difficulty FLOAT NOT NULL CHECK (access_difficulty >= 0.0 AND access_difficulty <= 1.0),
    breakdown JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_confidence_report ON confidence_scores(report_id);
CREATE INDEX idx_confidence_publishability ON confidence_scores(publishability DESC);
