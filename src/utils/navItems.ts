// Shared nav-item filter/normalize step, used by both App.tsx's own
// authoritative load-with-retry (applyNavItems) and DataLoader.tsx's fast
// first-paint preload (safeFetchNavItems) - these were two independent,
// byte-for-byte-identical copies of the same removedKeys set and field
// mapping (found in review, 2 Sep 2026), which meant a future change to
// either (a new item added to removedKeys, a new/renamed field) had to be
// applied twice by hand or the two copies would silently diverge. DataLoader's
// preload only needs to be "good enough for a fast first paint" - not itself
// exhaustively retried, that's still App.tsx's job - but the actual shape it
// produces should never differ from App.tsx's own, so the transform itself is
// shared while each caller keeps its own retry/failure handling.
export function normalizeNavItems(data: any[]): any[] {
  const removedKeys = new Set(['audit_logs_main', 'staff_activity_trail', 'errors']);
  const filtered = data.filter((dbItem: any) => !removedKeys.has(dbItem.uniqueKey));
  return filtered.map((dbItem: any, idx: number) => ({
    id: dbItem.id,
    title: dbItem.title,
    tabKey: dbItem.tabKey,
    uniqueKey: dbItem.uniqueKey,
    urlSlug: dbItem.urlSlug,
    category: dbItem.category,
    iconName: dbItem.iconName,
    order: idx + 1,
    roles: dbItem.roles || ['Super Admin'],
    isVisible: dbItem.isVisible,
    parentId: dbItem.parentId ?? null,
    customUrl: dbItem.customUrl || undefined,
    openInNewTab: dbItem.openInNewTab || false,
  }));
}
