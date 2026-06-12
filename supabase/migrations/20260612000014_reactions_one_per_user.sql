-- Keep only the most recent reaction per (drop_id, user_id) before changing PK
DELETE FROM drop_reactions dr1
USING drop_reactions dr2
WHERE dr1.drop_id = dr2.drop_id
  AND dr1.user_id = dr2.user_id
  AND dr1.created_at < dr2.created_at;

-- Swap primary key to enforce one reaction per person per drop
ALTER TABLE drop_reactions DROP CONSTRAINT drop_reactions_pkey;
ALTER TABLE drop_reactions ADD PRIMARY KEY (drop_id, user_id);
