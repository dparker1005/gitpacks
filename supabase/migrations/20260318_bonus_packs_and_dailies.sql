-- Migration: Bonus packs split + Dailies system
-- Separates regenerating packs (ready_packs) from bonus packs (bonus_packs)
-- Adds daily challenge claim tracking

-- 1. Add bonus_packs column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bonus_packs INTEGER NOT NULL DEFAULT 0;

-- 2. Migrate existing users: move excess ready_packs (above max 2) into bonus_packs
UPDATE profiles
SET bonus_packs = GREATEST(ready_packs - 2, 0),
    ready_packs = LEAST(ready_packs, 2)
WHERE ready_packs > 2;

-- 3. Change default for new users (signup bonus goes to bonus_packs now)
ALTER TABLE profiles ALTER COLUMN ready_packs SET DEFAULT 0;

-- 4. Daily claims table
CREATE TABLE IF NOT EXISTS daily_claims (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  claim_date DATE NOT NULL DEFAULT (CURRENT_DATE AT TIME ZONE 'UTC'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_type, claim_date)
);

ALTER TABLE daily_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own daily claims" ON daily_claims FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own daily claims" ON daily_claims FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_daily_claims_user_date ON daily_claims(user_id, claim_date);

-- 5. Daily detections cache table
CREATE TABLE IF NOT EXISTS daily_detections (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  detected_types TEXT[] NOT NULL DEFAULT '{}',
  check_date DATE NOT NULL DEFAULT (CURRENT_DATE AT TIME ZONE 'UTC'),
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE daily_detections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own detections" ON daily_detections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users upsert own detections" ON daily_detections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own detections" ON daily_detections FOR UPDATE USING (auth.uid() = user_id);

-- 6. Update decrement_pack: consume ready_packs first (they regen), then bonus_packs
DROP FUNCTION IF EXISTS decrement_pack(UUID, INT);
CREATE OR REPLACE FUNCTION decrement_pack(
  p_user_id UUID,
  p_max_packs INT DEFAULT 2
) RETURNS TABLE(success BOOLEAN, new_ready_packs INT, new_bonus_packs INT, new_last_regen_at TIMESTAMPTZ) AS $$
DECLARE
  cur_packs INT;
  cur_bonus INT;
  cur_regen TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT ready_packs, bonus_packs, last_regen_at INTO cur_packs, cur_bonus, cur_regen
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF cur_packs IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, NOW();
    RETURN;
  END IF;

  -- Try ready_packs first (they regenerate)
  IF cur_packs > 0 THEN
    IF cur_packs >= p_max_packs AND (cur_packs - 1) < p_max_packs THEN
      cur_regen := NOW();
    END IF;

    UPDATE profiles
    SET ready_packs = cur_packs - 1, last_regen_at = cur_regen
    WHERE id = p_user_id;

    RETURN QUERY SELECT true, (cur_packs - 1)::INT, cur_bonus, cur_regen;
    RETURN;
  END IF;

  -- Then bonus_packs
  IF cur_bonus > 0 THEN
    UPDATE profiles SET bonus_packs = cur_bonus - 1 WHERE id = p_user_id;
    RETURN QUERY SELECT true, cur_packs, (cur_bonus - 1)::INT, cur_regen;
    RETURN;
  END IF;

  -- No packs available
  RETURN QUERY SELECT false, 0, 0, cur_regen;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Atomic daily claim: checks max 3/day, inserts claim, increments bonus_packs
CREATE OR REPLACE FUNCTION claim_daily(
  p_user_id UUID,
  p_event_type TEXT
) RETURNS TABLE(success BOOLEAN, new_bonus_packs INT, claims_today INT) AS $$
DECLARE
  today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  cur_claims INT;
  cur_bonus INT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Check max 3 claims per day
  SELECT COUNT(*) INTO cur_claims
  FROM daily_claims WHERE user_id = p_user_id AND claim_date = today;

  IF cur_claims >= 3 THEN
    RETURN QUERY SELECT false, 0, cur_claims;
    RETURN;
  END IF;

  -- Insert claim (unique constraint prevents double-claim of same type)
  BEGIN
    INSERT INTO daily_claims (user_id, event_type, claim_date)
    VALUES (p_user_id, p_event_type, today);
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT false, 0, cur_claims;
    RETURN;
  END;

  -- Increment bonus_packs
  UPDATE profiles SET bonus_packs = bonus_packs + 1 WHERE id = p_user_id
  RETURNING bonus_packs INTO cur_bonus;

  RETURN QUERY SELECT true, cur_bonus, (cur_claims + 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
