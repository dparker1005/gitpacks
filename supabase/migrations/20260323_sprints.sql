-- Migration: Sprints (Daily + Weekly competitive arena)
-- Players open packs on a rotating repo, commit their best 5-card lineup, and earn bracket rewards.

-- 1. Sprints table (one row per daily/weekly sprint)
CREATE TABLE IF NOT EXISTS sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('daily', 'weekly')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sprints are publicly readable" ON sprints FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_sprints_type_ends ON sprints(type, ends_at DESC);
CREATE INDEX IF NOT EXISTS idx_sprints_active ON sprints(type, starts_at, ends_at);

-- 2. Sprint entries (one per user per sprint)
CREATE TABLE IF NOT EXISTS sprint_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id UUID NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  card_common TEXT,
  card_rare TEXT,
  card_epic TEXT,
  card_legendary TEXT,
  card_mythic TEXT,
  total_power INT NOT NULL DEFAULT 0,
  committed_at TIMESTAMPTZ,
  rank INT,
  percentile NUMERIC(5,2),
  packs_won INT,
  packs_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sprint_id, user_id)
);

ALTER TABLE sprint_entries ENABLE ROW LEVEL SECURITY;
-- Users can read their own entries (for past sprints, dashboard)
CREATE POLICY "Users read own sprint entries" ON sprint_entries FOR SELECT USING (auth.uid() = user_id);
-- Public read for rankings after sprint ends — only expose non-sensitive columns via RPC/views
-- rank IS NOT NULL means sprint is finalized
CREATE POLICY "Public read finished sprint rankings" ON sprint_entries FOR SELECT USING (rank IS NOT NULL);
-- Public read for committed entries (participant counts during active sprints)
CREATE POLICY "Public count committed sprint entries" ON sprint_entries FOR SELECT USING (committed_at IS NOT NULL);
-- No direct INSERT/UPDATE policies — all mutations go through SECURITY DEFINER RPCs
-- to prevent users from setting total_power, rank, packs_won, etc. directly

-- Index on repo_cache.card_count for efficient sprint repo selection
CREATE INDEX IF NOT EXISTS idx_repo_cache_card_count ON repo_cache(card_count);

CREATE INDEX IF NOT EXISTS idx_sprint_entries_sprint ON sprint_entries(sprint_id);
CREATE INDEX IF NOT EXISTS idx_sprint_entries_user ON sprint_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_sprint_entries_ranking ON sprint_entries(sprint_id, total_power DESC);

-- 3. Sprint repo cooldowns (prevent repeat repos)
CREATE TABLE IF NOT EXISTS sprint_repo_cooldowns (
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('daily', 'weekly')),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (repo_owner, repo_name, type)
);

ALTER TABLE sprint_repo_cooldowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sprint cooldowns are publicly readable" ON sprint_repo_cooldowns FOR SELECT USING (true);

-- 4. Commit sprint lineup (atomic: validates ownership, rarity, computes power server-side)
CREATE OR REPLACE FUNCTION commit_sprint_lineup(
  p_user_id UUID,
  p_sprint_id UUID,
  p_card_common TEXT,
  p_card_rare TEXT,
  p_card_epic TEXT,
  p_card_legendary TEXT,
  p_card_mythic TEXT,
  p_total_power INT  -- ignored, computed server-side for security
) RETURNS TABLE(success BOOLEAN, committed_at TIMESTAMPTZ, computed_power INT) AS $$
DECLARE
  v_sprint RECORD;
  v_owner_repo TEXT;
  v_repo_data JSONB;
  v_power INT := 0;
  v_card_power INT;
  v_card_rarity TEXT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Validate sprint exists and is active
  SELECT s.repo_owner, s.repo_name, s.starts_at, s.ends_at
  INTO v_sprint
  FROM sprints s WHERE s.id = p_sprint_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  IF NOW() < v_sprint.starts_at OR NOW() >= v_sprint.ends_at THEN
    RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  v_owner_repo := v_sprint.repo_owner || '/' || v_sprint.repo_name;

  -- Load repo data for rarity/power validation
  SELECT rc.data INTO v_repo_data FROM repo_cache rc WHERE rc.owner_repo = v_owner_repo;
  IF v_repo_data IS NULL THEN
    RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  -- Helper: validate a card — check ownership, look up power and rarity from repo_cache, enforce rarity constraint
  -- For each non-null card slot, verify:
  --   1. User owns the card in user_collections
  --   2. Card exists in repo_cache.data
  --   3. Card rarity is at or below the slot's maximum rarity
  --   4. Accumulate power from repo_cache (not client)

  -- Validate common slot (exact rarity: common only)
  IF p_card_common IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM user_collections WHERE user_id = p_user_id AND owner_repo = v_owner_repo AND contributor_login = p_card_common) THEN
      RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 0; RETURN;
    END IF;
    SELECT (elem->>'power')::INT, elem->>'rarity' INTO v_card_power, v_card_rarity
    FROM jsonb_array_elements(v_repo_data) elem WHERE elem->>'login' = p_card_common;
    IF v_card_rarity IS NULL OR v_card_rarity != 'common' THEN
      RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 0; RETURN;
    END IF;
    v_power := v_power + COALESCE(v_card_power, 0);
  END IF;

  -- Validate rare slot (rare or lower)
  IF p_card_rare IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM user_collections WHERE user_id = p_user_id AND owner_repo = v_owner_repo AND contributor_login = p_card_rare) THEN
      RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 0; RETURN;
    END IF;
    SELECT (elem->>'power')::INT, elem->>'rarity' INTO v_card_power, v_card_rarity
    FROM jsonb_array_elements(v_repo_data) elem WHERE elem->>'login' = p_card_rare;
    IF v_card_rarity IS NULL OR v_card_rarity NOT IN ('common', 'rare') THEN
      RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 0; RETURN;
    END IF;
    v_power := v_power + COALESCE(v_card_power, 0);
  END IF;

  -- Validate epic slot (epic or lower)
  IF p_card_epic IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM user_collections WHERE user_id = p_user_id AND owner_repo = v_owner_repo AND contributor_login = p_card_epic) THEN
      RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 0; RETURN;
    END IF;
    SELECT (elem->>'power')::INT, elem->>'rarity' INTO v_card_power, v_card_rarity
    FROM jsonb_array_elements(v_repo_data) elem WHERE elem->>'login' = p_card_epic;
    IF v_card_rarity IS NULL OR v_card_rarity NOT IN ('common', 'rare', 'epic') THEN
      RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 0; RETURN;
    END IF;
    v_power := v_power + COALESCE(v_card_power, 0);
  END IF;

  -- Validate legendary slot (at or below legendary: common, rare, epic, legendary)
  IF p_card_legendary IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM user_collections WHERE user_id = p_user_id AND owner_repo = v_owner_repo AND contributor_login = p_card_legendary) THEN
      RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 0; RETURN;
    END IF;
    SELECT (elem->>'power')::INT, elem->>'rarity' INTO v_card_power, v_card_rarity
    FROM jsonb_array_elements(v_repo_data) elem WHERE elem->>'login' = p_card_legendary;
    IF v_card_rarity IS NULL OR v_card_rarity NOT IN ('common', 'rare', 'epic', 'legendary') THEN
      RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 0; RETURN;
    END IF;
    v_power := v_power + COALESCE(v_card_power, 0);
  END IF;

  -- Validate mythic slot (at or below mythic: any rarity)
  IF p_card_mythic IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM user_collections WHERE user_id = p_user_id AND owner_repo = v_owner_repo AND contributor_login = p_card_mythic) THEN
      RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 0; RETURN;
    END IF;
    SELECT (elem->>'power')::INT, elem->>'rarity' INTO v_card_power, v_card_rarity
    FROM jsonb_array_elements(v_repo_data) elem WHERE elem->>'login' = p_card_mythic;
    IF v_card_rarity IS NULL THEN
      RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, 0; RETURN;
    END IF;
    v_power := v_power + COALESCE(v_card_power, 0);
  END IF;

  -- Upsert entry with SERVER-COMPUTED power (ignore client p_total_power)
  INSERT INTO sprint_entries (sprint_id, user_id, card_common, card_rare, card_epic, card_legendary, card_mythic, total_power, committed_at)
  VALUES (p_sprint_id, p_user_id, p_card_common, p_card_rare, p_card_epic, p_card_legendary, p_card_mythic, v_power, NOW())
  ON CONFLICT (sprint_id, user_id) DO UPDATE SET
    card_common = EXCLUDED.card_common,
    card_rare = EXCLUDED.card_rare,
    card_epic = EXCLUDED.card_epic,
    card_legendary = EXCLUDED.card_legendary,
    card_mythic = EXCLUDED.card_mythic,
    total_power = EXCLUDED.total_power,
    committed_at = NOW();

  RETURN QUERY SELECT true, NOW(), v_power;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Claim sprint rewards (atomic: check unclaimed, add bonus packs)
CREATE OR REPLACE FUNCTION claim_sprint_reward(
  p_user_id UUID,
  p_entry_id UUID
) RETURNS TABLE(success BOOLEAN, new_bonus_packs INT, packs_awarded INT) AS $$
DECLARE
  v_entry RECORD;
  v_sprint RECORD;
  v_bonus INT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Lock the entry row
  SELECT se.id, se.sprint_id, se.user_id, se.packs_won, se.packs_claimed, se.committed_at
  INTO v_entry
  FROM sprint_entries se WHERE se.id = p_entry_id FOR UPDATE;

  IF NOT FOUND OR v_entry.user_id != p_user_id THEN
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;

  -- Must have committed and have rewards
  IF v_entry.committed_at IS NULL OR v_entry.packs_won IS NULL OR v_entry.packs_won <= 0 THEN
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;

  IF v_entry.packs_claimed THEN
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;

  -- Ensure sprint is actually over
  SELECT s.ends_at INTO v_sprint FROM sprints s WHERE s.id = v_entry.sprint_id;
  IF NOT FOUND OR NOW() < v_sprint.ends_at THEN
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;

  -- Mark claimed and add bonus packs
  UPDATE sprint_entries SET packs_claimed = true WHERE id = p_entry_id;

  UPDATE profiles SET bonus_packs = bonus_packs + v_entry.packs_won WHERE id = p_user_id
  RETURNING bonus_packs INTO v_bonus;

  RETURN QUERY SELECT true, v_bonus, v_entry.packs_won;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Finalize sprint (called by cron API — calculates ranks and rewards)
-- This is SECURITY DEFINER with no auth check because it runs from a cron/admin endpoint
CREATE OR REPLACE FUNCTION finalize_sprint(p_sprint_id UUID) RETURNS VOID AS $$
DECLARE
  v_sprint RECORD;
  v_total INT;
  v_type TEXT;
  rec RECORD;
  v_rank INT;
  v_prev_power INT;
  v_current_rank INT;
  v_pct NUMERIC(5,2);
  v_packs INT;
  v_lock_key BIGINT;
  v_top10 INT;
  v_top25 INT;
  v_top50 INT;
BEGIN
  -- Only callable from service role (cron endpoint)
  IF current_setting('role', true) NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'finalize_sprint: service role required';
  END IF;

  -- Advisory lock to prevent concurrent finalization of the same sprint
  v_lock_key := abs(hashtext(p_sprint_id::TEXT));
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN; -- Another process is finalizing this sprint
  END IF;

  SELECT s.id, s.type, s.ends_at, s.repo_owner, s.repo_name INTO v_sprint
  FROM sprints s WHERE s.id = p_sprint_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Only finalize if sprint has ended
  IF NOW() < v_sprint.ends_at THEN RETURN; END IF;

  -- Check if already finalized
  IF EXISTS (SELECT 1 FROM sprint_entries WHERE sprint_id = p_sprint_id AND rank IS NOT NULL LIMIT 1) THEN
    RETURN;
  END IF;

  v_type := v_sprint.type;

  -- Count committed participants
  SELECT COUNT(*) INTO v_total FROM sprint_entries WHERE sprint_id = p_sprint_id AND committed_at IS NOT NULL;

  IF v_total = 0 THEN RETURN; END IF;

  -- Compute tier boundaries, ensuring each tier gets at least 1 slot
  -- (so with 2 people: 1st=Top10%, 2nd=Top25%, not "Participated")
  v_top10 := GREATEST(CEIL(v_total * 0.10)::INT, 1);
  v_top25 := GREATEST(CEIL(v_total * 0.25)::INT, v_top10 + 1);
  v_top50 := GREATEST(CEIL(v_total * 0.50)::INT, v_top25 + 1);

  -- Rank by total_power DESC; ties get the same rank (dense ranking for percentile, but standard for placement)
  v_current_rank := 0;
  v_prev_power := NULL;
  v_rank := 0;

  FOR rec IN
    SELECT se.id, se.total_power
    FROM sprint_entries se
    WHERE se.sprint_id = p_sprint_id AND se.committed_at IS NOT NULL
    ORDER BY se.total_power DESC
  LOOP
    v_current_rank := v_current_rank + 1;
    -- Standard ranking: ties get the same rank (the lower number)
    IF v_prev_power IS NULL OR rec.total_power < v_prev_power THEN
      v_rank := v_current_rank;
    END IF;
    v_prev_power := rec.total_power;

    -- Percentile: rank / total (lower is better)
    -- Generous tie-breaking: tied users get the best rank in the group
    v_pct := (v_rank::NUMERIC / v_total::NUMERIC) * 100;

    -- Determine packs based on bracket
    -- Tie-breaking: use v_rank (same for all tied), so all tied users at a boundary get the better bracket
    IF v_rank <= v_top10 THEN
      -- Top 10%
      IF v_type = 'daily' THEN v_packs := 4; ELSE v_packs := 12; END IF;
    ELSIF v_rank <= v_top25 THEN
      -- Top 25%
      IF v_type = 'daily' THEN v_packs := 3; ELSE v_packs := 9; END IF;
    ELSIF v_rank <= v_top50 THEN
      -- Top 50%
      IF v_type = 'daily' THEN v_packs := 2; ELSE v_packs := 6; END IF;
    ELSE
      -- Participated
      IF v_type = 'daily' THEN v_packs := 1; ELSE v_packs := 3; END IF;
    END IF;

    UPDATE sprint_entries SET rank = v_rank, percentile = v_pct, packs_won = v_packs WHERE id = rec.id;
  END LOOP;

  -- Also set rank/packs for uncommitted entries (rank = total+1, participated tier)
  UPDATE sprint_entries
  SET rank = v_total + 1,
      percentile = 100,
      packs_won = 0
  WHERE sprint_id = p_sprint_id AND committed_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create sprint (picks a random eligible repo, respects cooldowns)
-- Returns the new sprint ID, or NULL if no eligible repo found
CREATE OR REPLACE FUNCTION create_sprint(
  p_type TEXT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ
) RETURNS UUID AS $$
DECLARE
  v_cooldown_days INT;
  v_min_cards INT;
  v_max_cards INT;
  v_repo RECORD;
  v_sprint_id UUID;
BEGIN
  -- Only callable from service role (cron endpoint)
  IF current_setting('role', true) NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'create_sprint: service role required';
  END IF;

  -- Validate timestamps
  IF p_starts_at >= p_ends_at THEN
    RETURN NULL;
  END IF;

  -- Set parameters based on type
  -- Mythic count = Math.round(card_count * 0.03) in JS, so:
  --   Daily (1-2 mythics): card_count 17..83
  --   Weekly (3 mythics):  card_count 84..116
  IF p_type = 'daily' THEN
    v_cooldown_days := 30;
    v_min_cards := 17;   -- min card_count for 1 mythic
    v_max_cards := 83;   -- max card_count for 2 mythics
  ELSIF p_type = 'weekly' THEN
    v_cooldown_days := 90;
    v_min_cards := 84;   -- min card_count for 3 mythics
    v_max_cards := 116;  -- max card_count for 3 mythics
  ELSE
    RETURN NULL;
  END IF;

  -- Find eligible repo by card_count range (fast — uses indexed column, no JSONB scan)
  SELECT rc.owner_repo INTO v_repo
  FROM repo_cache rc
  WHERE rc.card_count BETWEEN v_min_cards AND v_max_cards
    AND NOT EXISTS (
      SELECT 1 FROM sprint_repo_cooldowns src
      WHERE src.repo_owner || '/' || src.repo_name = rc.owner_repo
        AND src.type = p_type
        AND src.last_used_at > NOW() - (v_cooldown_days || ' days')::INTERVAL
    )
    -- Don't pick a repo that's currently active in another sprint
    AND NOT EXISTS (
      SELECT 1 FROM sprints s
      WHERE s.repo_owner || '/' || s.repo_name = rc.owner_repo
        AND s.ends_at > NOW()
    )
  ORDER BY random()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Parse owner/repo from owner_repo string
  v_sprint_id := gen_random_uuid();

  INSERT INTO sprints (id, repo_owner, repo_name, type, starts_at, ends_at)
  VALUES (
    v_sprint_id,
    split_part(v_repo.owner_repo, '/', 1),
    split_part(v_repo.owner_repo, '/', 2),
    p_type,
    p_starts_at,
    p_ends_at
  );

  -- Update cooldown
  INSERT INTO sprint_repo_cooldowns (repo_owner, repo_name, type, last_used_at)
  VALUES (
    split_part(v_repo.owner_repo, '/', 1),
    split_part(v_repo.owner_repo, '/', 2),
    p_type,
    NOW()
  )
  ON CONFLICT (repo_owner, repo_name, type) DO UPDATE SET last_used_at = NOW();

  RETURN v_sprint_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
