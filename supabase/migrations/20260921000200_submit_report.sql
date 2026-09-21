-- 0005 — submit_report(): the only legal way to write a report.
--
-- Phase 2. SOW M3 "Report Blocked" / "Report Clear". See decisions/0004-report-validation-is-server-side.md
--
-- There is deliberately no insert policy on `reports` for anon/authenticated (migration 0002).
-- This function is SECURITY DEFINER and is the only door. It enforces, in order:
--   1. device suspension
--   2. the crossing exists and is active
--   3. the report radius (a client-side check is decoration — ADR 0004)
--   4. the per-device rate limit
-- and returns jsonb shaped exactly like SubmitReportResult in packages/shared/src/types.ts, so
-- the mobile client can pattern-match `ok` without a separate error-handling path for the
-- expected rejections. A thrown exception is reserved for genuinely unexpected failures.
--
-- Uses clock_timestamp(), not now(), throughout — now() is fixed for the whole transaction
-- (see migration 20260921000100), which would make the rate-limit window and freshness reset
-- meaningless for a caller that upserts a device and inserts a report in one transaction.

create or replace function submit_report(
  p_crossing_id uuid,
  p_status      report_status,
  p_device_id   text,
  p_lat         double precision,
  p_lng         double precision
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_suspended boolean;
  v_crossing         crossings%rowtype;
  v_driver_point     geography;
  v_radius_meters    numeric;
  v_distance_meters   double precision;
  v_window_minutes   int;
  v_max_reports      int;
  v_recent_count     int;
  v_result           jsonb;
begin
  -- 1. Register/refresh the device, and read whether it is suspended. A guest has no auth.uid()
  --    yet; devices.user_id is attached once one exists, and preserved across anonymous calls.
  insert into devices (device_id, user_id)
  values (p_device_id, auth.uid())
  on conflict (device_id) do update
    set last_seen_at = clock_timestamp(),
        user_id = coalesce(devices.user_id, excluded.user_id)
  returning is_suspended into v_device_suspended;

  if v_device_suspended then
    return jsonb_build_object(
      'ok', false,
      'reason', 'device_suspended',
      'message', 'This device is currently suspended from submitting reports.'
    );
  end if;

  -- 2. The crossing must exist and be in service. A retired crossing is never reportable.
  select * into v_crossing from crossings where id = p_crossing_id and is_active;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'crossing_not_found',
      'message', 'This crossing is not available for reporting.'
    );
  end if;

  -- 3. The radius check. "Too far to report" is not the driver's mistake — it means the system
  --    cannot trust an observation of a crossing the driver cannot see (ADR 0004).
  v_driver_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_distance_meters := st_distance(v_crossing.geom, v_driver_point);
  v_radius_meters := config_number('report_radius_meters', 1609.344);

  if v_distance_meters > v_radius_meters then
    return jsonb_build_object(
      'ok', false,
      'reason', 'too_far_from_crossing',
      'message', 'You are too far from this crossing to report it.'
    );
  end if;

  -- 4. Per-device rate limit (SOW M3-AC5), to deter spam.
  v_window_minutes := config_int('rate_limit_window_minutes', 5);
  v_max_reports := config_int('rate_limit_max_reports', 10);

  select count(*) into v_recent_count
  from reports
  where device_id = p_device_id
    and not is_removed
    and reported_at > clock_timestamp() - (v_window_minutes * interval '1 minute');

  if v_recent_count >= v_max_reports then
    return jsonb_build_object(
      'ok', false,
      'reason', 'rate_limited',
      'message', 'Too many reports submitted recently. Please wait before reporting again.'
    );
  end if;

  -- 5. Write the report. reporter_geom is kept so an administrator reviewing abuse can audit
  --    the distance claim after the fact, not just trust it.
  insert into reports (crossing_id, status, device_id, user_id, reporter_geom, reported_at)
  values (p_crossing_id, p_status, p_device_id, auth.uid(), v_driver_point, clock_timestamp());

  -- 6. Return the recomputed status, camelCase to match CrossingStatus in packages/shared.
  select jsonb_build_object(
    'ok', true,
    'crossing', jsonb_build_object(
      'id', cs.id,
      'dotId', cs.dot_id,
      'name', cs.name,
      'road', cs.road,
      'city', cs.city,
      'state', cs.state,
      'latitude', cs.latitude,
      'longitude', cs.longitude,
      'isActive', cs.is_active,
      'color', cs.color,
      'lastStatus', cs.last_status,
      'lastReportedAt', cs.last_reported_at,
      'reportCount', cs.report_count
    )
  ) into v_result
  from crossing_status cs
  where cs.id = p_crossing_id;

  return v_result;
end;
$$;

comment on function submit_report is
  'The only legal write path into reports (ADR 0004). Enforces device suspension, crossing '
  'active state, the report radius and the per-device rate limit, server-side. Returns jsonb '
  'shaped like SubmitReportResult so the client never needs a separate error path for expected '
  'rejections.';

grant execute on function submit_report(uuid, report_status, text, double precision, double precision)
  to anon, authenticated;
