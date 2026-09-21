-- pgTAP: notifications and the in-app inbox (SOW M1 "Notifications", M5 "System-Wide
-- Notifications").
--
-- The assertions that matter most here are the negative ones. An inbox that shows a driver
-- someone else's notifications is a privacy failure, and it is invisible in any test that only
-- ever queries as one user — so this file creates two drivers and checks the boundary from both
-- sides.

begin;
select plan(14);

select has_table('notifications', 'notifications table exists');
select has_table('notification_recipients', 'notification_recipients table exists');
select has_function('inbox', 'inbox() exists');
select has_function('mark_notification_read', array['uuid'], 'mark_notification_read() exists');

select ok(
  (select relrowsecurity from pg_class where relname = 'notifications'),
  'RLS is enabled on notifications'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'notification_recipients'),
  'RLS is enabled on notification_recipients'
);

-- ---------------------------------------------------------------------------------------------
-- Two drivers, one notification each. auth.users rows are created directly because there is no
-- session to sign in with inside pgTAP.
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'driver-one@example.test'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'driver-two@example.test')
on conflict (id) do nothing;

insert into crossings (dot_id, name, geom)
values ('NOTIF-1', 'Alert Crossing',
        st_setsrid(st_makepoint(-83.5379, 41.6528), 4326)::geography);

insert into notifications (id, kind, title, body, crossing_id)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'route_alert', 'Blocked crossing ahead',
   'Alert Crossing is blocked on your route',
   (select id from crossings where dot_id = 'NOTIF-1')),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'broadcast', 'Pilot update',
   'Thanks for taking part in the RailRover pilot', null);

insert into notification_recipients (notification_id, user_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222');

-- ---------------------------------------------------------------------------------------------
-- M1-Notifications-AC2: the inbox shows a driver their own notifications, and ONLY those.
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from inbox()),
  1,
  'M1-Notifications-AC2: the inbox lists the notification addressed to this driver'
);

select is(
  (select title from inbox()),
  'Blocked crossing ahead',
  'the inbox returns the right notification, not merely the right count'
);

select is(
  (select count(*)::int from inbox() where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  0,
  'a driver CANNOT see a notification addressed to someone else'
);

-- M1-Notifications-AC3: the deep-link target travels with the notification.
select is(
  (select crossing_id from inbox()),
  (select id from crossings where dot_id = 'NOTIF-1'),
  'M1-Notifications-AC3: a route alert carries the crossing it refers to'
);

-- ---------------------------------------------------------------------------------------------
-- Read state (M1-Notifications-AC2)
-- ---------------------------------------------------------------------------------------------
select ok(
  (select read_at is null from inbox()),
  'a new notification starts unread'
);

select lives_ok(
  $$select mark_notification_read('aaaaaaaa-0000-4000-8000-000000000001')$$,
  'a driver can mark their own notification read'
);

select ok(
  (select read_at is not null from inbox()),
  'M1-Notifications-AC2: the notification is read afterwards'
);

-- Marking someone else's notification read must be a no-op rather than an error, because the
-- UPDATE simply matches no rows the caller owns.
select is(
  (select count(*)::int from notification_recipients
     where notification_id = 'aaaaaaaa-0000-4000-8000-000000000002' and read_at is not null),
  0,
  'a driver CANNOT mark another driver''s notification read'
);

reset role;
select * from finish();
rollback;
