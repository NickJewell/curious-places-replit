-- PRD7: Check-ins, Profile & Gamification
-- Run this migration in your Supabase SQL Editor

-- 1. Create badges table (badge definitions)
CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  icon_name TEXT NOT NULL DEFAULT 'award',
  requirement_type TEXT NOT NULL CHECK (requirement_type IN ('checkin_count', 'tour_complete', 'category', 'special')),
  requirement_value INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create checkins table (user visit records)
CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  place_name TEXT NOT NULL,
  place_latitude DOUBLE PRECISION NOT NULL,
  place_longitude DOUBLE PRECISION NOT NULL,
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, place_id)
);

-- 3. Create user_badges table (badges earned by users)
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_place_id ON checkins(place_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);

-- 5. Enable RLS
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for badges (public read)
CREATE POLICY "Anyone can view badges" ON badges
  FOR SELECT USING (true);

-- 7. RLS Policies for checkins (users can manage their own)
CREATE POLICY "Users can view their own checkins" ON checkins
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own checkins" ON checkins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 8. RLS Policies for user_badges (users can view their own, system inserts)
CREATE POLICY "Users can view their own badges" ON user_badges
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own badges" ON user_badges
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 9. Insert default badges
INSERT INTO badges (name, description, icon_name, requirement_type, requirement_value)
VALUES 
  ('The Explorer', 'Complete your first check-in', 'compass', 'checkin_count', 1),
  ('The Wanderer', 'Check in to 5 different places', 'map-pin', 'checkin_count', 5),
  ('The Historian', 'Check in to 10 different places', 'book-open', 'checkin_count', 10),
  ('The Legend', 'Check in to 25 different places', 'star', 'checkin_count', 25),
  ('Tour Guide', 'Complete an official tour', 'flag', 'tour_complete', 1)
ON CONFLICT (name) DO NOTHING;

-- 10. Create RPC function to get user progress
CREATE OR REPLACE FUNCTION get_user_progress(uid UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_checkins', (SELECT COUNT(*) FROM checkins WHERE user_id = uid),
    'total_badges', (SELECT COUNT(*) FROM user_badges WHERE user_id = uid),
    'badges', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', b.id,
        'name', b.name,
        'description', b.description,
        'icon_name', b.icon_name,
        'earned_at', ub.earned_at
      )), '[]'::json)
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = uid
    ),
    'recent_checkins', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', c.id,
        'place_id', c.place_id,
        'place_name', c.place_name,
        'checked_in_at', c.checked_in_at
      ) ORDER BY c.checked_in_at DESC), '[]'::json)
      FROM (SELECT * FROM checkins WHERE user_id = uid ORDER BY checked_in_at DESC LIMIT 20) c
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
