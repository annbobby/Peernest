-- ============================================================================
-- PEERNEST - VIT VELLORE FULL-STACK CAMPUS CONVENIENCE PLATFORM
-- Database Schema Migration 003: Seed Data (VIT Vellore Campus Coordinates & Config)
-- ============================================================================

-- Campus Locations (VIT Vellore Coordinates)
INSERT INTO campus_locations (name, code, type, latitude, longitude, description) VALUES
('Campus Central Parcel Centre (Post Office)', 'PARCEL_MAIN', 'parcel_centre', 12.971900, 79.159400, 'Main campus courier & speed post collection hub near Gate 2 / Foodys'),
('SJT Courier Pickup Counter', 'PARCEL_SJT', 'parcel_centre', 12.971200, 79.163600, 'Silver Jubilee Tower Ground Floor express delivery kiosk'),
('Technology Tower (TT)', 'ACAD_TT', 'academic_building', 12.970100, 79.159700, 'Main administrative & engineering departments tower'),
('Silver Jubilee Tower (SJT)', 'ACAD_SJT', 'academic_building', 12.971200, 79.163600, 'Academic complex, labs and faculty offices'),
('Dr. MGR Block (MB)', 'ACAD_MB', 'academic_building', 12.969200, 79.157800, 'Central administrative block'),
('Main Gate 1 (Katpadi Road)', 'GATE_1', 'gate', 12.969300, 79.155900, 'Primary campus entrance opposite Katpadi railway road'),
('Main Gate 2 (All Mart Entrance)', 'GATE_2', 'gate', 12.971500, 79.157800, 'Delivery gate adjacent to Foodys and shopping square'),
('Main Gate 3 (Back Gate)', 'GATE_3', 'gate', 12.973500, 79.164500, 'Eastern gate connecting to outer road')
ON CONFLICT (code) DO NOTHING;

-- Hostel Locations (VIT Vellore Men & Ladies Hostels)
INSERT INTO hostel_locations (name, code, gender, latitude, longitude) VALUES
('Men''s Hostel - Block A', 'MH_A', 'M', 12.969800, 79.156500),
('Men''s Hostel - Block B', 'MH_B', 'M', 12.970200, 79.156800),
('Men''s Hostel - Block C', 'MH_C', 'M', 12.970600, 79.157100),
('Men''s Hostel - Block D', 'MH_D', 'M', 12.971000, 79.157400),
('Men''s Hostel - Block E', 'MH_E', 'M', 12.971500, 79.157600),
('Men''s Hostel - Block F', 'MH_F', 'M', 12.972000, 79.157800),
('Men''s Hostel - Block G', 'MH_G', 'M', 12.972400, 79.158200),
('Men''s Hostel - Block H', 'MH_H', 'M', 12.972900, 79.158500),
('Men''s Hostel - Block J', 'MH_J', 'M', 12.973400, 79.159000),
('Men''s Hostel - Block K', 'MH_K', 'M', 12.973800, 79.159500),
('Men''s Hostel - Block L', 'MH_L', 'M', 12.974200, 79.160100),
('Men''s Hostel - Block M', 'MH_M', 'M', 12.974600, 79.160700),
('Men''s Hostel - Block N', 'MH_N', 'M', 12.975000, 79.161300),
('Men''s Hostel - Block P', 'MH_P', 'M', 12.975400, 79.161900),
('Men''s Hostel - Block Q', 'MH_Q', 'M', 12.975800, 79.162500),
('Men''s Hostel - Block R', 'MH_R', 'M', 12.976200, 79.163100),
('Men''s Hostel - Block S', 'MH_S', 'M', 12.976600, 79.163700),
('Men''s Hostel - Block T', 'MH_T', 'M', 12.977000, 79.164300),
('Ladies'' Hostel - Block A', 'LH_A', 'F', 12.968200, 79.159000),
('Ladies'' Hostel - Block B', 'LH_B', 'F', 12.968500, 79.159500),
('Ladies'' Hostel - Block C', 'LH_C', 'F', 12.968800, 79.160000),
('Ladies'' Hostel - Block D', 'LH_D', 'F', 12.969100, 79.160500),
('Ladies'' Hostel - Block E', 'LH_E', 'F', 12.969400, 79.161000),
('Ladies'' Hostel - Block F', 'LH_F', 'F', 12.969700, 79.161500),
('Ladies'' Hostel - Block G', 'LH_G', 'F', 12.970000, 79.162000),
('Ladies'' Hostel - Block H', 'LH_H', 'F', 12.970300, 79.162500)
ON CONFLICT (code) DO NOTHING;

-- Rental Categories
INSERT INTO rental_categories (name, slug, description, icon) VALUES
('Textbooks & Reference Books', 'textbooks', 'Engineering, CS, biotech, mathematics and reference guides', 'book-open'),
('Academic Calculators', 'calculators', 'Scientific calculators (fx-991EX, fx-991MS, graphing calculators)', 'calculator'),
('Lab Coats & Safety Gear', 'lab-coats', 'White cotton lab coats, safety goggles, dissecting sets', 'shield'),
('Laboratory & Electronics Equipment', 'lab-equipment', 'Breadboards, digital multimeters, Arduino / Raspberry Pi kits', 'cpu'),
('Sports Equipment', 'sports-equipment', 'Badminton rackets, cricket bats, footballs, basketballs', 'activity'),
('Formal & Event Wear', 'event-wear', 'Blazers, formal suits, conference attire, traditional sets', 'award'),
('Student Room Essentials', 'essentials', 'Table lamps, kettle, iron boxes, mattress toppers, folding desks', 'home')
ON CONFLICT (slug) DO NOTHING;

-- Platform Pricing & Operational Settings
INSERT INTO platform_settings (key, value, category, description) VALUES
('base_delivery_fee', '8.00', 'pricing', 'Base booking fee for campus parcel pickup in INR'),
('price_per_km', '5.00', 'pricing', 'Rate per kilometre of calculated route in INR'),
('min_delivery_fee', '10.00', 'pricing', 'Minimum delivery charge payable by requester'),
('max_delivery_fee', '120.00', 'pricing', 'Maximum delivery charge cap for campus deliveries'),
('fallback_delivery_fee', '20.00', 'pricing', 'Fixed fee when GPS is unavailable or declined'),
('parcel_commission_percent', '15.00', 'commission', 'PeerNest platform cut on parcel delivery (percent)'),
('rental_commission_percent', '10.00', 'commission', 'PeerNest platform commission on rental charges (percent)'),
('max_active_deliveries_per_partner', '3', 'operations', 'Maximum simultaneous active deliveries a delivery partner can claim'),
('max_declared_parcel_value', '10000.00', 'protection', 'Maximum declared parcel value eligible for campus transit'),
('max_parcel_compensation', '5000.00', 'protection', 'Maximum compensation claim payout per parcel incident'),
('rental_inspection_window_hours', '24', 'rentals', 'Hours after return for owner to inspect and file damage report'),
('institutional_email_domain', 'vitstudent.ac.in', 'auth', 'Allowed student institutional email domain for registration')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
