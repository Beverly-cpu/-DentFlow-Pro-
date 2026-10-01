ALTER TABLE patients ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version>0);

-- Every writer, including migration repairs, invalidates an older edit.
CREATE FUNCTION increment_patient_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER patients_increment_version BEFORE UPDATE ON patients
FOR EACH ROW EXECUTE FUNCTION increment_patient_version();
