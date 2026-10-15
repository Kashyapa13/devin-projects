-- down for 0002_live_monitors — drops only the objects that migration added.
DROP TABLE IF EXISTS refundlens.monitor_events;
DROP TABLE IF EXISTS refundlens.monitors;
DROP TABLE IF EXISTS refundlens.agg_hourly;
