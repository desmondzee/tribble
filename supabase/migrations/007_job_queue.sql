-- Pipeline job queue with SKIP LOCKED claiming
CREATE TABLE pipeline_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    priority INT NOT NULL DEFAULT 0,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    last_error TEXT,
    node_trace JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    locked_by TEXT,
    locked_at TIMESTAMPTZ
);

CREATE INDEX idx_jobs_pending ON pipeline_jobs(priority DESC, created_at ASC)
    WHERE status = 'pending';

-- Atomic job claiming — no advisory locks, no polling
CREATE OR REPLACE FUNCTION claim_next_job(worker_id TEXT)
RETURNS SETOF pipeline_jobs LANGUAGE sql AS $$
    UPDATE pipeline_jobs
    SET status = 'processing', locked_by = worker_id,
        locked_at = now(), attempts = attempts + 1,
        started_at = COALESCE(started_at, now())
    WHERE id = (
        SELECT id FROM pipeline_jobs
        WHERE status = 'pending' AND attempts < max_attempts
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED LIMIT 1
    ) RETURNING *;
$$;
