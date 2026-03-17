-- Migration: Share-to-X reward + Referral system

-- 1. Add share/referral columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shared_on_x BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code) WHERE referral_code IS NOT NULL;

-- Set referral_code = github_username for existing users
UPDATE profiles SET referral_code = github_username WHERE referral_code IS NULL AND github_username != '';

-- 2. Referrals table
CREATE TABLE IF NOT EXISTS referrals (
  referrer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (referred_id)
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own referrals as referrer" ON referrals FOR SELECT USING (auth.uid() = referrer_id);
CREATE POLICY "Users can view own referrals as referred" ON referrals FOR SELECT USING (auth.uid() = referred_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);

-- 3. Claim share reward: one-time 5 bonus packs for sharing on X
CREATE OR REPLACE FUNCTION claim_share_reward(
  p_user_id UUID
) RETURNS TABLE(success BOOLEAN, new_bonus_packs INT) AS $$
DECLARE
  cur_shared BOOLEAN;
  cur_bonus INT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT shared_on_x INTO cur_shared FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF cur_shared IS NULL THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  IF cur_shared THEN
    -- Already claimed
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  UPDATE profiles
  SET shared_on_x = true, bonus_packs = bonus_packs + 5
  WHERE id = p_user_id
  RETURNING bonus_packs INTO cur_bonus;

  RETURN QUERY SELECT true, cur_bonus;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Process referral: called on new user signup
CREATE OR REPLACE FUNCTION process_referral(
  p_new_user_id UUID,
  p_referral_code TEXT
) RETURNS TABLE(success BOOLEAN, referrer_username TEXT) AS $$
DECLARE
  v_referrer_id UUID;
  v_referrer_username TEXT;
  v_referred_by UUID;
  v_referral_count INT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_new_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Check new user hasn't already been referred
  SELECT referred_by INTO v_referred_by FROM profiles WHERE id = p_new_user_id;
  IF v_referred_by IS NOT NULL THEN
    RETURN QUERY SELECT false, ''::TEXT;
    RETURN;
  END IF;

  -- Look up referrer by code
  SELECT id, github_username INTO v_referrer_id, v_referrer_username
  FROM profiles WHERE referral_code = p_referral_code;

  IF v_referrer_id IS NULL THEN
    RETURN QUERY SELECT false, ''::TEXT;
    RETURN;
  END IF;

  -- Prevent self-referral
  IF v_referrer_id = p_new_user_id THEN
    RETURN QUERY SELECT false, ''::TEXT;
    RETURN;
  END IF;

  -- Check referrer has < 10 referrals
  SELECT COUNT(*) INTO v_referral_count FROM referrals WHERE referrer_id = v_referrer_id;
  IF v_referral_count >= 10 THEN
    RETURN QUERY SELECT false, v_referrer_username;
    RETURN;
  END IF;

  -- Insert referral (PK on referred_id prevents duplicates)
  BEGIN
    INSERT INTO referrals (referrer_id, referred_id) VALUES (v_referrer_id, p_new_user_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT false, ''::TEXT;
    RETURN;
  END;

  -- Grant 5 bonus packs to referrer
  UPDATE profiles SET bonus_packs = bonus_packs + 5 WHERE id = v_referrer_id;

  -- Grant 5 extra bonus packs to referred user + set referred_by
  UPDATE profiles SET bonus_packs = bonus_packs + 5, referred_by = v_referrer_id WHERE id = p_new_user_id;

  RETURN QUERY SELECT true, v_referrer_username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
