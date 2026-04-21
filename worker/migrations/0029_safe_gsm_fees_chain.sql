-- Add chain_id to safe_gsm_fees so the table can hold GSM fee events from
-- chains other than Ethereum. Existing rows are all Ethereum (chain_id=1).
--
-- We keep (tx_hash, log_index) as the PK: cross-chain hash collisions are
-- cryptographically negligible, and scoping the PK to one chain would
-- require a table rewrite just to defend against an event that will never
-- happen.
ALTER TABLE safe_gsm_fees ADD COLUMN chain_id INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_safe_gsm_fees_chain ON safe_gsm_fees(chain_id);
