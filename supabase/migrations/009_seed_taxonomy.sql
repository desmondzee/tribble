INSERT INTO taxonomy_terms (id, label, category, description) VALUES
    ('violence_active_threat', 'Violence / Active Threat', 'security', 'Armed conflict, shelling, airstrikes, or direct threat to life'),
    ('displacement', 'Displacement', 'displacement', 'Forced movement of populations due to conflict or disaster'),
    ('medical_need', 'Medical Need', 'health', 'Medical emergencies, hospital damage, or lack of medical supplies'),
    ('food_insecurity', 'Food Insecurity', 'food', 'Food shortages, looting of food stores, or disrupted supply chains'),
    ('water_access', 'Water Access', 'water_sanitation', 'Water supply disruption, contamination, or sanitation failure'),
    ('shelter_need', 'Shelter Need', 'shelter', 'Destroyed or damaged housing, need for temporary shelter'),
    ('infrastructure_damage', 'Infrastructure Damage', 'infrastructure', 'Damage to roads, bridges, hospitals, schools, or utilities'),
    ('route_blockage', 'Route Blockage', 'access', 'Roads blocked, bridges destroyed, or areas inaccessible'),
    ('communications_disruption', 'Communications Disruption', 'communications', 'Internet, phone, or radio blackouts'),
    ('weather_hazard', 'Weather Hazard', 'weather', 'Extreme heat, flooding, storms, or drought'),
    ('aid_delivery_update', 'Aid Delivery Update', 'aid', 'Humanitarian aid delivery status or obstruction'),
    ('public_service_interruption', 'Public Service Interruption', 'public_service', 'Government services, utilities, or institutions disrupted'),
    ('protection_concern', 'Protection Concern', 'security', 'Gender-based violence, child protection, or civilian targeting')
ON CONFLICT (id) DO NOTHING;
