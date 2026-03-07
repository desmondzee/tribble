-- Helper to extract lat/lng from a location's PostGIS geography.
CREATE OR REPLACE FUNCTION get_location_coords(p_location_id UUID)
RETURNS TABLE (lat DOUBLE PRECISION, lng DOUBLE PRECISION)
LANGUAGE sql
STABLE
AS $$
    SELECT
        ST_Y(l.geom::geometry) AS lat,
        ST_X(l.geom::geometry) AS lng
    FROM locations l
    WHERE l.id = p_location_id;
$$;
