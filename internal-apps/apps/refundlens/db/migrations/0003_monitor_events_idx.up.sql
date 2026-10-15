-- 0003 — the monitors_panel widget query's correlated latest-event
-- lookups were cost-capped by the fence (EXPLAIN > 5000): every row of
-- monitors seq-scanned monitor_events twice. A covering (monitor_id,
-- fired_at DESC) index turns both lookups into index scans — the fence
-- keeps its cost cap, the panel keeps its SQL honest.
CREATE INDEX monitor_events_by_monitor
  ON refundlens.monitor_events (monitor_id, fired_at DESC);
