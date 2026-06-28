-- ============================================================
-- GigSpot Seed Data
-- Sample categories and demo data
-- ============================================================

-- Job Categories
INSERT INTO categories (name, icon, color) VALUES
    ('Delivery', '🚚', '#FF6B6B'),
    ('Cleaning', '🧹', '#4ECDC4'),
    ('Cooking', '🍳', '#FFE66D'),
    ('Tutoring', '📚', '#6C63FF'),
    ('Gardening', '🌱', '#2ECC71'),
    ('Event Staff', '🎪', '#E91E63'),
    ('Data Entry', '💻', '#00BCD4'),
    ('Photography', '📷', '#FF9800'),
    ('Warehouse', '📦', '#795548'),
    ('Pet Care', '🐕', '#9C27B0'),
    ('Driving', '🚗', '#607D8B'),
    ('Construction', '🔨', '#FF5722'),
    ('Retail', '🛒', '#3F51B5'),
    ('Security', '🛡️', '#F44336'),
    ('Other', '💼', '#9E9E9E')
ON CONFLICT (name) DO NOTHING;
