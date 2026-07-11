BEGIN;

CREATE OR REPLACE FUNCTION recoup_keep_newest_cockpit_read_model()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source_refreshed_at < OLD.source_refreshed_at THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recoup_cockpit_read_models_monotonic_refresh ON recoup_cockpit_read_models;
CREATE TRIGGER recoup_cockpit_read_models_monotonic_refresh
  BEFORE UPDATE ON recoup_cockpit_read_models
  FOR EACH ROW
  EXECUTE FUNCTION recoup_keep_newest_cockpit_read_model();

COMMIT;
