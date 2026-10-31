-- Add preferred_language preference to user profiles
-- Valid values: fr, de, es, it, zh, hi, ar, ja, pt, ko. NULL = English (default).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT NULL;

-- Enforce only supported ISO codes (or NULL for English) at the database level
ALTER TABLE profiles
  ADD CONSTRAINT profiles_preferred_language_check
  CHECK (
    preferred_language IS NULL OR
    preferred_language IN ('fr','de','es','it','zh','hi','ar','ja','pt','ko')
  );
