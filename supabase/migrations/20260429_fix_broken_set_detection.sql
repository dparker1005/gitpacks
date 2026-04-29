-- Fix refresh_user_scores so it actually flips is_complete to FALSE when a
-- previously-complete set breaks (top-N reshuffle, recycle, etc).
--
-- The original used `comp IS NOT NULL` to detect "row exists in
-- collection_completions". For composite/record types Postgres defines
-- `IS NOT NULL` as "every field is non-null", and the table has a nullable
-- `insured_at` column that's NULL for any non-insured user — so the check
-- silently evaluated FALSE for the common case and the function skipped the
-- branch that clears is_complete. Bonus stayed at 0 (correct) but the flag
-- never flipped (wrong), which broke the dashboard's broken-set badge.
--
-- Use `comp.user_id IS NOT NULL` instead — user_id is NOT NULL on the table,
-- so it's a clean "did SELECT INTO find a row" check.

CREATE OR REPLACE FUNCTION refresh_user_scores(p_user_id UUID) RETURNS VOID AS $$
DECLARE
  repo RECORD;
  score RECORD;
  comp RECORD;
  bonus INT;
  global_total INT := 0;
BEGIN
  FOR repo IN
    SELECT DISTINCT owner_repo FROM user_collections WHERE user_id = p_user_id
  LOOP
    SELECT * INTO score FROM compute_user_repo_score(p_user_id, repo.owner_repo);

    bonus := 0;
    SELECT * INTO comp FROM collection_completions
      WHERE user_id = p_user_id AND owner_repo = repo.owner_repo;

    IF score.unique_cards = score.total_cards_in_repo AND score.total_cards_in_repo > 0 THEN
      bonus := (score.base_points * 0.5)::INT;
      INSERT INTO collection_completions (user_id, owner_repo, card_count_at_completion, is_complete)
        VALUES (p_user_id, repo.owner_repo, score.total_cards_in_repo, TRUE)
        ON CONFLICT (user_id, owner_repo) DO UPDATE SET
          is_complete = TRUE,
          card_count_at_completion = score.total_cards_in_repo,
          completed_at = CASE
            WHEN collection_completions.is_complete THEN collection_completions.completed_at
            ELSE NOW()
          END;
    ELSIF comp.user_id IS NOT NULL THEN
      IF comp.insured THEN
        bonus := (score.base_points * 0.5)::INT;
      ELSE
        UPDATE collection_completions SET is_complete = FALSE
          WHERE user_id = p_user_id AND owner_repo = repo.owner_repo;
      END IF;
    END IF;

    INSERT INTO leaderboard_scores (user_id, owner_repo, base_points, completion_bonus, total_points, unique_cards, total_cards_in_repo, updated_at)
      VALUES (p_user_id, repo.owner_repo, score.base_points, bonus, score.base_points + bonus, score.unique_cards, score.total_cards_in_repo, NOW())
      ON CONFLICT (user_id, owner_repo) DO UPDATE SET
        base_points = score.base_points,
        completion_bonus = bonus,
        total_points = score.base_points + bonus,
        unique_cards = score.unique_cards,
        total_cards_in_repo = score.total_cards_in_repo,
        updated_at = NOW();

    global_total := global_total + score.base_points + bonus;
  END LOOP;

  INSERT INTO leaderboard_scores (user_id, owner_repo, base_points, completion_bonus, total_points, unique_cards, total_cards_in_repo, updated_at)
    VALUES (p_user_id, '__global__', global_total, 0, global_total, 0, 0, NOW())
    ON CONFLICT (user_id, owner_repo) DO UPDATE SET
      total_points = global_total,
      updated_at = NOW();

  UPDATE profiles SET total_points = global_total WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill: any non-insured row currently flagged is_complete=true whose
-- score row says unique_cards < total_cards_in_repo is stale from the bug.
UPDATE collection_completions cc
SET is_complete = FALSE
FROM leaderboard_scores ls
WHERE ls.user_id = cc.user_id
  AND ls.owner_repo = cc.owner_repo
  AND cc.is_complete = TRUE
  AND cc.insured = FALSE
  AND ls.total_cards_in_repo > 0
  AND ls.unique_cards < ls.total_cards_in_repo;
