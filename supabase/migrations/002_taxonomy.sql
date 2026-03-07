CREATE TABLE taxonomy_terms (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'security','displacement','health','food','water_sanitation',
        'shelter','infrastructure','access','communications',
        'weather','aid','public_service'
    )),
    description TEXT NOT NULL,
    parent_id TEXT REFERENCES taxonomy_terms(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_taxonomy_category ON taxonomy_terms(category);
CREATE INDEX idx_taxonomy_parent ON taxonomy_terms(parent_id);
