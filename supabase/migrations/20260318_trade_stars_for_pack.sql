-- Trade stars for bonus pack: spend 100 stars from any repo to get 1 bonus pack
CREATE OR REPLACE FUNCTION trade_stars_for_pack(
  p_user_id UUID,
  p_owner_repo TEXT,
  p_cost INT DEFAULT 100
) RETURNS TABLE(success BOOLEAN, new_balance INT, new_bonus_packs INT) AS $$
DECLARE
  cur_balance INT;
  cur_bonus INT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Lock and check star balance
  SELECT balance INTO cur_balance FROM user_stars
    WHERE user_id = p_user_id AND owner_repo = p_owner_repo
    FOR UPDATE;

  IF cur_balance IS NULL OR cur_balance < p_cost THEN
    RETURN QUERY SELECT false, COALESCE(cur_balance, 0), 0;
    RETURN;
  END IF;

  -- Deduct stars
  UPDATE user_stars SET
    balance = balance - p_cost,
    total_spent = total_spent + p_cost,
    updated_at = NOW()
    WHERE user_id = p_user_id AND owner_repo = p_owner_repo;

  -- Grant 1 bonus pack
  UPDATE profiles SET bonus_packs = bonus_packs + 1 WHERE id = p_user_id
    RETURNING bonus_packs INTO cur_bonus;

  RETURN QUERY SELECT true, (cur_balance - p_cost), cur_bonus;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
