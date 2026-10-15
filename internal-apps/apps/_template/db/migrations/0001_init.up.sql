-- schema_noop: deliberately minimal schema proving the migration loop.
-- Replace with the app's schema (expand-contract; raw SQL reviewed per
-- the constitution; LLD's schema section is commentary only).
CREATE TABLE template_seed (
  id int PRIMARY KEY,
  label text NOT NULL
);
