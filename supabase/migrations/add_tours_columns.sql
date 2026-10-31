-- Migration: Add tour support to lists table
-- Run this in your Supabase SQL Editor

-- Add new columns to lists table for tour support
ALTER TABLE lists 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS list_type TEXT DEFAULT 'list' CHECK (list_type IN ('list', 'tour')),
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create index for faster tour queries
CREATE INDEX IF NOT EXISTS idx_lists_list_type ON lists(list_type);

-- Example: Insert a sample tour (optional - for testing)
-- You can remove this or modify it as needed
/*
INSERT INTO lists (user_id, name, description, list_type, metadata)
VALUES (
  'system',
  'The Great Fire of London Walk',
  'Trace the path of the devastating Great Fire of 1666 through the streets of the City of London. Visit the sites where it started, spread, and was finally stopped.',
  'tour',
  '{
    "difficulty": "Moderate",
    "duration": "2 hours",
    "distance": "3.5 km",
    "hero_image": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800"
  }'::jsonb
);
*/

-- RLS policy update: Allow all users to read tours (they are public content)
CREATE POLICY IF NOT EXISTS "Anyone can view official tours"
  ON lists FOR SELECT
  USING (list_type = 'tour');

-- Note: The existing RLS policies for user lists should still work
-- as they filter by user_id for personal lists
