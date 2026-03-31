-- Add discord_anonymous to reports.source_type for Discord intake channel.
-- Constraint name is the default PostgreSQL naming for column CHECK.

ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_source_type_check;

ALTER TABLE reports
  ADD CONSTRAINT reports_source_type_check CHECK (source_type IN (
    'web_identified', 'web_anonymous',
    'whatsapp_identified', 'whatsapp_anonymous',
    'discord_anonymous',
    'acled_historical', 'satellite', 'weather'
  ));
