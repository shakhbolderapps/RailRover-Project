import { groupInbox, toPushPermission, type InboxItem } from './notifications';

const at = (iso: string, overrides: Partial<InboxItem> = {}): InboxItem => ({
  id: `n-${iso}`,
  kind: 'route_alert',
  title: 'Blocked crossing ahead',
  body: 'Central Ave is blocked',
  crossing_id: 'c1',
  created_at: iso,
  read_at: null,
  ...overrides,
});

describe('toPushPermission', () => {
  it('M1-Notifications-AC4: separates "not asked" from "denied and cannot ask again"', () => {
    // Same distinction as location: when we can still prompt, the settings toggle should prompt;
    // when we cannot, it has to send the driver to system settings instead.
    expect(toPushPermission({ granted: true, canAskAgain: false })).toBe('granted');
    expect(toPushPermission({ granted: false, canAskAgain: true })).toBe('undetermined');
    expect(toPushPermission({ granted: false, canAskAgain: false })).toBe('denied');
  });
});

describe('groupInbox', () => {
  it('M1-Notifications edge case: groups notifications that arrived together', () => {
    const groups = groupInbox([
      at('2026-09-21T12:00:00Z'),
      at('2026-09-21T12:00:20Z'),
      at('2026-09-21T12:00:40Z'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(3);
  });

  it('does not group notifications that are far apart in time', () => {
    const groups = groupInbox([at('2026-09-21T12:00:00Z'), at('2026-09-21T14:00:00Z')]);
    expect(groups).toHaveLength(2);
  });

  it('does not group across kinds, even when they arrive in the same minute', () => {
    // A broadcast landing in the same minute as two route alerts is not part of that event, and
    // folding them together would misrepresent what happened.
    const groups = groupInbox([
      at('2026-09-21T12:00:00Z'),
      at('2026-09-21T12:00:10Z', { kind: 'broadcast', id: 'b1' }),
      at('2026-09-21T12:00:20Z'),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['route_alert', 'broadcast', 'route_alert']);
  });

  it('counts unread items per group, so a badge can be shown without re-scanning', () => {
    const groups = groupInbox([
      at('2026-09-21T12:00:00Z'),
      at('2026-09-21T12:00:10Z', { id: 'read', read_at: '2026-09-21T12:05:00Z' }),
      at('2026-09-21T12:00:20Z'),
    ]);
    expect(groups[0]?.items).toHaveLength(3);
    expect(groups[0]?.unread).toBe(2);
  });

  it('returns an empty list for an empty inbox rather than a group of nothing', () => {
    expect(groupInbox([])).toEqual([]);
  });

  it('keeps every item — grouping is presentation, never a filter', () => {
    const items = [
      at('2026-09-21T12:00:00Z'),
      at('2026-09-21T12:00:10Z'),
      at('2026-09-21T13:00:00Z', { kind: 'broadcast', id: 'b' }),
      at('2026-09-21T15:00:00Z'),
    ];
    const total = groupInbox(items).reduce((sum, group) => sum + group.items.length, 0);
    expect(total).toBe(items.length);
  });
});
