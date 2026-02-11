-- Reset events with amount=0 back to NULL so the backfill can re-fetch
-- with the corrected balance fetching logic.
-- Exclude 'destroy' events where amount=0 might be genuine (funds already seized).
UPDATE blacklist_events SET amount = NULL WHERE amount = 0 AND event_type != 'destroy';
