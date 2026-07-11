BEGIN;

ALTER TABLE recoup_cockpit_read_models
  DROP CONSTRAINT IF EXISTS recoup_cockpit_read_models_surface_check;

ALTER TABLE recoup_cockpit_read_models
  ADD CONSTRAINT recoup_cockpit_read_models_surface_check
  CHECK (surface IN ('forensics-analyst', 'connector-readiness', 'credit-risk-review'));

ALTER TABLE recoup_cockpit_read_models
  DROP CONSTRAINT IF EXISTS recoup_cockpit_read_models_persona_check;

ALTER TABLE recoup_cockpit_read_models
  ADD CONSTRAINT recoup_cockpit_read_models_persona_check
  CHECK (persona IN ('maya', 'david'));

COMMIT;
