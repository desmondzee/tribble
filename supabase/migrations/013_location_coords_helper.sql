-- RPC to get lat/lon for a report from its location's PostGIS geometry.
-- Coordinates live in locations.geom, not processing_metadata.
CREATE OR REPLACE FUNCTION get_location_coords(p_report_id UUID)
RETURNS TABLE(latitude DOUBLE PRECISION, longitude DOUBLE PRECISION)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ST_Y(l.geom::geometry)::double precision AS latitude,
    ST_X(l.geom::geometry)::double precision AS longitude
  FROM reports r
  JOIN locations l ON r.location_id = l.id
  WHERE r.id = p_report_id;
$$;
