-- Smart cache invalidation: store latest commit SHA and issue number
-- to avoid full GitHub API refresh when repo hasn't changed
ALTER TABLE repo_cache ADD COLUMN IF NOT EXISTS last_commit_sha TEXT;
ALTER TABLE repo_cache ADD COLUMN IF NOT EXISTS last_issue_number INT;
