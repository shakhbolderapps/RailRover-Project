-- 0004 — touch_updated_at() used now(), which is fixed for the duration of a transaction
-- (it's an alias for transaction_timestamp()). An insert followed by an update of the same row
-- in one transaction therefore left updated_at == created_at instead of advancing it. Caught by
-- pgTAP test 020-crossings-schema.sql #10, the first time the suite ran against a real database.
--
-- clock_timestamp() reads the actual wall clock at the moment the trigger fires, so it advances
-- per statement regardless of transaction boundaries.

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
