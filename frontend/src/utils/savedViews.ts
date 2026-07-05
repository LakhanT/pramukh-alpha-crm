export type BoardView = 'kanban' | 'list' | 'calendar' | 'gantt';
export type TaskScope = 'mine' | 'team' | 'all';

export interface BoardFilters {
  status?: string;
  priority?: string;
  assigneeId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SavedView {
  id: string;
  name: string;
  view: BoardView;
  scope: TaskScope;
  filters: BoardFilters;
}

const KEY = 'pramukh_alpha_saved_views';

export function loadSavedViews(userId: string): SavedView[] {
  try {
    const raw = localStorage.getItem(`${KEY}_${userId}`);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function persistSavedViews(userId: string, views: SavedView[]) {
  localStorage.setItem(`${KEY}_${userId}`, JSON.stringify(views));
}

export function addSavedView(userId: string, view: Omit<SavedView, 'id'>): SavedView[] {
  const views = loadSavedViews(userId);
  const next = [...views, { ...view, id: crypto.randomUUID() }];
  persistSavedViews(userId, next);
  return next;
}

export function removeSavedView(userId: string, id: string): SavedView[] {
  const next = loadSavedViews(userId).filter((v) => v.id !== id);
  persistSavedViews(userId, next);
  return next;
}
