CREATE TABLE flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL,
  description text NOT NULL DEFAULT '',
  targeting   jsonb NOT NULL DEFAULT '{}'::jsonb,  -- rules: {"enabled_if": {...}}
  env         text NOT NULL CHECK (env IN ('dev','staging','prod')),
  deleted     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, env)
);
CREATE TABLE flag_audit_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  flag_id    uuid REFERENCES flags(id),
  actor      text NOT NULL,
  action     text NOT NULL,                -- create/update/delete/eval-note
  detail     jsonb NOT NULL DEFAULT '{}',
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flag_audit_flag_idx ON flag_audit_events (flag_id, at DESC);
