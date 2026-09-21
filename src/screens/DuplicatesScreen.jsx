import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconDeleteForever, IconFolder, IconRename } from '../components/DriveIcons';
import {
  filterDuplicateGroups,
  groupWastedBytes,
  isOriginalSmallerThanConflict,
  sortDuplicateGroups,
} from '../utils/duplicateListView';
import { useDialog } from '../context/DialogContext';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';

const vault_api = window.televault?.vault;

function parent_folder_path(file_path) {
  const path_text = String(file_path || '');
  const slash_index = path_text.lastIndexOf('/');
  if (slash_index <= 0) return '/';
  return path_text.slice(0, slash_index + 1);
}

function open_vault_folder(folder_path) {
  window.dispatchEvent(new CustomEvent('gd-navigate', { detail: folder_path }));
}

function remove_members_from_groups(group_list, message_ids) {
  const removed_id_set = new Set(message_ids);
  const next_groups = [];
  for (const group_item of group_list) {
    const next_members = (group_item.members || []).filter(
      (member_item) => !removed_id_set.has(member_item.messageId),
    );
    if (next_members.length >= 2) {
      next_groups.push({ ...group_item, members: next_members });
    }
  }
  return next_groups;
}

function short_sha(sha_text) {
  if (!sha_text || sha_text.length < 12) return sha_text || '—';
  return `${sha_text.slice(0, 8)}…`;
}

function format_size(size_value) {
  if (!size_value) return '0 B';
  if (size_value < 1024) return `${size_value} B`;
  if (size_value < 1024 * 1024) return `${(size_value / 1024).toFixed(1)} KB`;
  return `${(size_value / (1024 * 1024)).toFixed(1)} MB`;
}

function build_summary(group_list) {
  return {
    groupCount: group_list.length,
    fileCount: group_list.reduce((total_count, group_item) => total_count + (group_item.members?.length || 0), 0),
  };
}

function get_duplicate_member_ids(group_item) {
  const member_list = group_item.members || [];
  const has_original = member_list.some((member_item) => member_item.isOriginal);
  return member_list
    .filter((member_item, member_index) =>
      has_original ? !member_item.isOriginal : member_index > 0,
    )
    .map((member_item) => member_item.messageId);
}

/** Pre-select duplicates (except original) for all groups — keep collapsed. */
function build_initial_selection_state(group_list) {
  const selected_id_set = new Set();
  for (const group_item of group_list || []) {
    for (const message_id of get_duplicate_member_ids(group_item)) {
      selected_id_set.add(message_id);
    }
  }
  return [...selected_id_set];
}

export function DuplicatesScreen({ onBack, currentFolder }) {
  const { t } = useI18n();
  const { prompt, confirm } = useDialog();
  const { showToast } = useToast();
  const [group_list, set_group_list] = useState([]);
  const [summary_state, set_summary_state] = useState({ groupCount: 0, fileCount: 0 });
  const [loading_state, set_loading_state] = useState(false);
  const [error_text, set_error_text] = useState('');
  const [expanded_group_ids, set_expanded_group_ids] = useState([]);
  const [resolving_group_id, set_resolving_group_id] = useState(null);
  const [deleting_message_ids, set_deleting_message_ids] = useState([]);
  const [delete_progress, set_delete_progress] = useState(null);
  const [selected_message_ids, set_selected_message_ids] = useState([]);
  const [search_query, set_search_query] = useState('');
  const [sort_field, set_sort_field] = useState('wasted');
  const [sort_direction, set_sort_direction] = useState('desc');

  const selected_id_set = useMemo(() => new Set(selected_message_ids), [selected_message_ids]);
  const deleting_id_set = useMemo(() => new Set(deleting_message_ids), [deleting_message_ids]);
  const expanded_id_set = useMemo(() => new Set(expanded_group_ids), [expanded_group_ids]);
  const is_deleting = deleting_message_ids.length > 0;
  const actions_busy = resolving_group_id != null || is_deleting;
  const busy_ref = useRef(false);

  useEffect(() => {
    const api = window.televault?.vault || vault_api;
    const cleanup = api?.onDeleteProgress?.((progress) => {
      set_delete_progress(progress);
    });
    return () => cleanup?.();
  }, []);

  function toggle_group_expanded(group_item) {
    const group_id = group_item.id;
    const is_closing = expanded_id_set.has(group_id);

    set_expanded_group_ids((previous_ids) => {
      if (previous_ids.includes(group_id)) {
        return previous_ids.filter((id) => id !== group_id);
      }
      return [...previous_ids, group_id];
    });

    // When opening a group, pre-select every copy except the original (first / Gốc).
    if (!is_closing) {
      const duplicate_ids = get_duplicate_member_ids(group_item);
      if (duplicate_ids.length === 0) return;
      set_selected_message_ids((previous_ids) => {
        const next_id_set = new Set(previous_ids);
        for (const message_id of duplicate_ids) next_id_set.add(message_id);
        return [...next_id_set];
      });
    }
  }

  const run_scan = useCallback(async () => {
    set_loading_state(true);
    set_error_text('');
    try {
      const result_data = await vault_api?.scanDuplicates();
      if (!result_data?.ok) {
        set_group_list([]);
        set_summary_state({ groupCount: 0, fileCount: 0 });
        set_expanded_group_ids([]);
        set_selected_message_ids([]);
        set_error_text(result_data?.error || t('duplicatesError'));
        return;
      }

      const next_groups = result_data.groups || [];
      const initial_selected_ids = build_initial_selection_state(next_groups);
      set_group_list(next_groups);
      set_summary_state(result_data.summary || build_summary(next_groups));
      set_expanded_group_ids([]);
      set_selected_message_ids(initial_selected_ids);
    } catch (error_object) {
      set_group_list([]);
      set_summary_state({ groupCount: 0, fileCount: 0 });
      set_expanded_group_ids([]);
      set_selected_message_ids([]);
      set_error_text(String(error_object?.message || error_object || t('duplicatesError')));
    } finally {
      set_loading_state(false);
    }
  }, [t]);

  useEffect(() => {
    void run_scan();
  }, [run_scan]);

  const visible_groups = useMemo(() => {
    const filtered_groups = filterDuplicateGroups(group_list, search_query);
    return sortDuplicateGroups(filtered_groups, {
      field: sort_field,
      direction: sort_direction,
    });
  }, [group_list, search_query, sort_field, sort_direction]);

  const visible_summary = useMemo(() => build_summary(visible_groups), [visible_groups]);

  const visible_duplicate_ids = useMemo(() => {
    const ids = [];
    for (const group_item of visible_groups) {
      for (const message_id of get_duplicate_member_ids(group_item)) {
        ids.push(message_id);
      }
    }
    return ids;
  }, [visible_groups]);

  const are_all_visible_selected = useMemo(() => {
    if (visible_duplicate_ids.length === 0) return false;
    return visible_duplicate_ids.every((id) => selected_id_set.has(id));
  }, [visible_duplicate_ids, selected_id_set]);

  function select_all_visible_duplicates() {
    set_selected_message_ids((previous_ids) => {
      const next_set = new Set(previous_ids);
      for (const message_id of visible_duplicate_ids) next_set.add(message_id);
      return [...next_set];
    });
  }

  function deselect_all_visible_duplicates() {
    set_selected_message_ids((previous_ids) => {
      const visible_set = new Set(visible_duplicate_ids);
      return previous_ids.filter((id) => !visible_set.has(id));
    });
  }

  function toggle_member_selected(message_id) {
    set_selected_message_ids((previous_ids) => {
      if (previous_ids.includes(message_id)) {
        return previous_ids.filter((id) => id !== message_id);
      }
      return [...previous_ids, message_id];
    });
  }

  function set_group_selection(group_item, should_select) {
    const member_ids = (group_item.members || []).map((member_item) => member_item.messageId);
    set_selected_message_ids((previous_ids) => {
      const previous_set = new Set(previous_ids);
      if (should_select) {
        for (const message_id of member_ids) previous_set.add(message_id);
      } else {
        for (const message_id of member_ids) previous_set.delete(message_id);
      }
      return [...previous_set];
    });
  }

  function select_keep_oldest_in_group(group_item) {
    const sorted = [...(group_item.members || [])].sort((a, b) => {
      const timeA = new Date(a.mtime).getTime() || 0;
      const timeB = new Date(b.mtime).getTime() || 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.messageId - b.messageId;
    });
    const to_select = sorted.slice(1).map((m) => m.messageId);
    set_selected_message_ids((prev) => {
      const filtered = prev.filter((id) => !sorted.some((m) => m.messageId === id));
      return [...filtered, ...to_select];
    });
  }

  function select_keep_newest_in_group(group_item) {
    const sorted = [...(group_item.members || [])].sort((a, b) => {
      const timeA = new Date(a.mtime).getTime() || 0;
      const timeB = new Date(b.mtime).getTime() || 0;
      if (timeA !== timeB) return timeB - timeA;
      return b.messageId - a.messageId;
    });
    const to_select = sorted.slice(1).map((m) => m.messageId);
    set_selected_message_ids((prev) => {
      const filtered = prev.filter((id) => !sorted.some((m) => m.messageId === id));
      return [...filtered, ...to_select];
    });
  }

  async function run_rename(member_item) {
    if (actions_busy || member_item?.messageId == null) return;

    const current_name = String(member_item.path || '').split('/').pop() || '';
    const next_name = await prompt(t('newName'), current_name);
    const clean_name = String(next_name || '')
      .trim()
      .replace(/[/\\]/g, '');
    if (!clean_name || clean_name === current_name) return;

    set_error_text('');
    try {
      const result_data = await vault_api?.renameFile(member_item.messageId, clean_name);
      if (!result_data?.ok) {
        const error_message = result_data?.error || t('errorGeneric');
        set_error_text(error_message);
        showToast(error_message, { variant: 'error' });
        return;
      }

      const next_path = `${parent_folder_path(member_item.path)}${clean_name}`;
      set_group_list((previous_groups) =>
        previous_groups.map((group_item) => ({
          ...group_item,
          members: (group_item.members || []).map((group_member) =>
            group_member.messageId === member_item.messageId
              ? { ...group_member, path: next_path }
              : group_member,
          ),
        })),
      );
    } catch (error_object) {
      const error_message = String(error_object?.message || error_object || t('errorGeneric'));
      set_error_text(error_message);
      showToast(error_message, { variant: 'error' });
    }
  }

  // Temporary: skip confirm dialogs for faster duplicate cleanup.
  async function run_keep(group_id, keep_message_id, trash_message_ids) {
    if (actions_busy) return;
    set_resolving_group_id(group_id);
    set_error_text('');

    try {
      const result_data = await vault_api?.resolveDuplicateGroup({
        keepMessageId: keep_message_id,
        trashMessageIds: trash_message_ids,
      });
      if (!result_data?.ok) {
        set_error_text(result_data?.error || t('duplicatesError'));
        return;
      }

      const removed_ids = new Set(trash_message_ids);
      set_selected_message_ids((previous_ids) => previous_ids.filter((id) => !removed_ids.has(id)));
      set_group_list((previous_groups) => {
        const next_groups = previous_groups.filter((group_item) => group_item.id !== group_id);
        set_summary_state(build_summary(next_groups));
        return next_groups;
      });
      set_expanded_group_ids((previous_ids) => previous_ids.filter((id) => id !== group_id));
      showToast(t('duplicatesKeepSuccess', { count: trash_message_ids.length }), { variant: 'default' });
    } catch (error_object) {
      set_error_text(String(error_object?.message || error_object || t('duplicatesError')));
    } finally {
      set_resolving_group_id(null);
    }
  }

  async function run_delete_forever(message_ids) {
    const unique_ids = [...new Set(message_ids)].filter((message_id) => message_id != null);
    if (unique_ids.length === 0 || actions_busy || busy_ref.current) return;

    const confirmed = await confirm(
      unique_ids.length > 1
        ? `${t('duplicatesDeleteConfirmTitle')}\n${t('duplicatesDeleteConfirmBody')} (${unique_ids.length} file)`
        : `${t('duplicatesDeleteConfirmTitle')}\n${t('duplicatesDeleteConfirmBody')}`,
    );
    if (!confirmed) return;

    busy_ref.current = true;
    set_deleting_message_ids(unique_ids);
    set_delete_progress({ done: 0, total: unique_ids.length, percent: 0 });
    set_error_text('');

    try {
      const result_data = await vault_api?.deletePermanent(unique_ids, []);
      if (!result_data?.ok && (!result_data?.deletedCount || result_data.deletedCount === 0)) {
        set_error_text(result_data?.error || t('duplicatesError'));
        return;
      }

      const actually_deleted = result_data?.deletedIds || (result_data?.ok ? unique_ids : []);
      if (actually_deleted.length > 0) {
        const removed_id_set = new Set(actually_deleted);
        set_selected_message_ids((previous_ids) => previous_ids.filter((id) => !removed_id_set.has(id)));
        set_group_list((previous_groups) => {
          const next_groups = remove_members_from_groups(previous_groups, actually_deleted);
          set_summary_state(build_summary(next_groups));
          const remaining_id_set = new Set(next_groups.map((group_item) => group_item.id));
          set_expanded_group_ids((previous_ids) =>
            previous_ids.filter((id) => remaining_id_set.has(id)),
          );
          return next_groups;
        });
        showToast(t('duplicatesDeleteSuccess', { count: actually_deleted.length }), { variant: 'success' });
      }

      if (result_data?.failedCount > 0) {
        set_error_text(
          t('duplicatesDeletePartialSuccess', {
            deletedCount: result_data.deletedCount,
            total: unique_ids.length,
            failedCount: result_data.failedCount,
            error: result_data.error || t('duplicatesError'),
          }),
        );
      } else if (actually_deleted.length > 0) {
        set_delete_progress({ done: actually_deleted.length, total: unique_ids.length, percent: 100 });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error_object) {
      set_error_text(String(error_object?.message || error_object || t('duplicatesError')));
    } finally {
      busy_ref.current = false;
      set_deleting_message_ids([]);
      set_delete_progress(null);
    }
  }

  return (
    <div className="gd-settings flex min-h-0 flex-1 flex-col overflow-hidden p-4">
      <section className="gd-settings-group shrink-0 !mb-0">
        <div className="gd-settings-card">
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs font-medium text-[var(--gd-text-secondary)]">
                {search_query.trim()
                  ? t('duplicatesSummaryFiltered', {
                      shownGroups: visible_summary.groupCount,
                      shownFiles: visible_summary.fileCount,
                      groups: summary_state.groupCount,
                      files: summary_state.fileCount,
                    })
                  : t('duplicatesSummary', {
                      groups: summary_state.groupCount,
                      files: summary_state.fileCount,
                    })}
              </div>
              <button
                type="button"
                className="gd-settings-btn shrink-0"
                onClick={() => void run_scan()}
                disabled={loading_state || actions_busy}
              >
                {loading_state ? t('duplicatesScanning') : t('duplicatesScan')}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={search_query}
                onChange={(event_object) => set_search_query(event_object.target.value)}
                placeholder={t('duplicatesSearchPlaceholder')}
                className="gd-settings-path-field min-w-[200px] flex-1 px-3 py-2"
                aria-label={t('duplicatesSearchPlaceholder')}
              />
              <select
                value={sort_field}
                onChange={(event_object) => set_sort_field(event_object.target.value)}
                className="gd-settings-path-field w-auto px-3 py-2"
                aria-label={t('duplicatesSortLabel')}
              >
                <option value="wasted">{t('duplicatesSortWasted')}</option>
                <option value="count">{t('duplicatesSortCount')}</option>
                <option value="path">{t('duplicatesSortPath')}</option>
                <option value="originalSmaller">{t('duplicatesSortOriginalSmaller')}</option>
              </select>
              <button
                type="button"
                className="gd-settings-btn"
                onClick={() =>
                  set_sort_direction((previous_direction) =>
                    previous_direction === 'desc' ? 'asc' : 'desc',
                  )
                }
                title={
                  sort_direction === 'desc'
                    ? t('duplicatesSortDesc')
                    : t('duplicatesSortAsc')
                }
                aria-label={
                  sort_direction === 'desc'
                    ? t('duplicatesSortDesc')
                    : t('duplicatesSortAsc')
                }
              >
                {sort_direction === 'desc' ? '↓' : '↑'}
              </button>
            </div>

            {visible_duplicate_ids.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--gd-border)] pt-3">
                <span className="text-sm text-[var(--gd-text-secondary)]">
                  {selected_message_ids.length > 0
                    ? t('duplicatesSelectedRatio', {
                        selected: selected_message_ids.length,
                        total: visible_duplicate_ids.length,
                      })
                    : t('duplicatesNoneSelected')}
                </span>
                <div className="flex items-center gap-2">
                  {are_all_visible_selected ? (
                    <button
                      type="button"
                      className="gd-settings-btn"
                      onClick={deselect_all_visible_duplicates}
                      disabled={actions_busy}
                    >
                      {t('duplicatesClearSelection')}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="gd-settings-btn"
                        onClick={select_all_visible_duplicates}
                        disabled={actions_busy}
                      >
                        {t('duplicatesSelectAllCopies', { n: visible_duplicate_ids.length })}
                      </button>
                      {selected_message_ids.length > 0 ? (
                        <button
                          type="button"
                          className="gd-settings-btn"
                          onClick={() => set_selected_message_ids([])}
                          disabled={actions_busy}
                        >
                          {t('duplicatesClearSelection')}
                        </button>
                      ) : null}
                    </>
                  )}
                  <button
                    type="button"
                    className="gd-dialog-btn gd-dialog-btn--primary"
                    onClick={() => void run_delete_forever(selected_message_ids)}
                    disabled={actions_busy || selected_message_ids.length === 0}
                  >
                    {is_deleting
                      ? delete_progress?.total
                        ? `${delete_progress.done}/${delete_progress.total} (${delete_progress.percent}%)`
                        : t('duplicatesDeleting')
                      : t('duplicatesDeleteSelected', { n: selected_message_ids.length })}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="gd-settings-group mt-4 mb-0 min-h-0 flex-1 overflow-auto">
        {error_text ? <p className="mb-3 text-sm text-red-500">{error_text}</p> : null}
        {resolving_group_id ? (
          <p className="mb-3 text-sm text-[var(--gd-text-secondary)]">{t('duplicatesResolving')}</p>
        ) : null}
        {is_deleting ? (
          <div className="mb-3 rounded-lg border border-[var(--gd-border)] bg-[var(--gd-card)] p-3 shadow-sm">
            <div className="flex items-center justify-between text-xs text-[var(--gd-text)] mb-1.5 font-medium">
              <span className="flex items-center gap-2">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--gd-primary)] border-t-transparent" />
                {delete_progress?.total
                  ? t('duplicatesDeleteProgress', {
                      done: delete_progress.done,
                      total: delete_progress.total,
                      percent: delete_progress.percent,
                    })
                  : t('duplicatesDeleting')}
              </span>
              <span>{delete_progress?.percent ?? 0}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--gd-border)]">
              <div
                className="h-full bg-[var(--gd-primary)] transition-all duration-300 ease-out"
                style={{ width: `${delete_progress?.percent ?? 0}%` }}
              />
            </div>
          </div>
        ) : null}

        {loading_state && group_list.length === 0 ? (
          <div className="gd-settings-card p-4 text-sm text-[var(--gd-text-secondary)]">{t('duplicatesScanning')}</div>
        ) : null}

        {!loading_state && group_list.length === 0 ? (
          <div className="gd-settings-card p-4 text-sm text-[var(--gd-text-secondary)]">{t('duplicatesEmpty')}</div>
        ) : null}

        {!loading_state && group_list.length > 0 && visible_groups.length === 0 ? (
          <div className="gd-settings-card p-4 text-sm text-[var(--gd-text-secondary)]">
            {t('duplicatesSearchEmpty')}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          {visible_groups.map((group_item) => {
            const is_open = expanded_id_set.has(group_item.id);
            const is_resolving = resolving_group_id === group_item.id;
            const group_busy = is_resolving || is_deleting;
            const wasted_bytes = groupWastedBytes(group_item);
            const member_count = group_item.members?.length || 0;
            const group_member_ids = (group_item.members || []).map(
              (member_item) => member_item.messageId,
            );
            const selected_in_group = group_member_ids.filter((message_id) =>
              selected_id_set.has(message_id),
            ).length;
            const all_group_selected =
              group_member_ids.length > 0 && selected_in_group === group_member_ids.length;

            const has_group_selection = selected_in_group > 0;
            const original_undersized = isOriginalSmallerThanConflict(group_item);

            return (
              <div
                key={group_item.id}
                className={`gd-settings-card overflow-hidden ${
                  original_undersized
                    ? 'border-[var(--gd-danger)]'
                    : has_group_selection
                      ? 'border-[var(--gd-primary)]'
                      : ''
                } ${has_group_selection ? 'bg-[var(--gd-selected)]' : ''} ${
                  original_undersized && !has_group_selection
                    ? 'bg-[color-mix(in_srgb,var(--gd-danger)_10%,transparent)]'
                    : ''
                }`}
              >
                <div
                  className={`flex items-center gap-2 px-4 py-3 hover:bg-[var(--gd-hover)] ${
                    has_group_selection
                      ? 'bg-[var(--gd-selected)]'
                      : original_undersized
                        ? 'bg-[color-mix(in_srgb,var(--gd-danger)_10%,transparent)]'
                        : ''
                  }`}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
                    onClick={() => toggle_group_expanded(group_item)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            group_item.kind === 'same_hash'
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                              : group_item.kind === 'conflict_name'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {group_item.kind === 'same_hash'
                            ? t('duplicatesKindHash')
                            : group_item.kind === 'conflict_name'
                              ? t('duplicatesKindConflict')
                              : t('duplicatesKindExact')}
                        </span>
                        <span
                          className={`truncate text-sm font-medium ${
                            original_undersized
                              ? 'text-[var(--gd-danger)]'
                              : 'text-[var(--gd-text)]'
                          }`}
                        >
                          {group_item.originalPath}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[var(--gd-text-secondary)]">
                        {t('duplicatesGroupMeta', {
                          n: member_count,
                          wasted: format_size(wasted_bytes),
                        })}
                        {original_undersized ? (
                          <>
                            {' · '}
                            <span className="font-medium text-[var(--gd-danger)]">
                              {t('duplicatesOriginalSmaller')}
                            </span>
                          </>
                        ) : null}
                        {has_group_selection ? (
                          <>
                            {' · '}
                            <span className="font-medium text-[var(--gd-primary)]">
                              {t('duplicatesSelectedRatio', {
                                selected: selected_in_group,
                                total: member_count,
                              })}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-xs ${
                        has_group_selection
                          ? 'font-medium text-[var(--gd-primary)]'
                          : original_undersized
                            ? 'font-medium text-[var(--gd-danger)]'
                            : 'text-[var(--gd-text-secondary)]'
                      }`}
                    >
                      {has_group_selection
                        ? `${selected_in_group}/${member_count}`
                        : original_undersized
                          ? t('duplicatesOriginalSmaller')
                          : group_item.mixedContent
                            ? t('duplicatesMixedContent')
                            : t('duplicatesSameContent')}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="gd-row-action shrink-0"
                    title={t('duplicatesOpenFolder')}
                    aria-label={t('duplicatesOpenFolder')}
                    onClick={() => open_vault_folder(parent_folder_path(group_item.originalPath))}
                  >
                    <IconFolder className="h-5 w-5" />
                  </button>
                </div>

                {is_open ? (
                  <div className="border-t border-[var(--gd-border)]">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs text-[var(--gd-text-secondary)] bg-[var(--gd-card)]/50">
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="gd-duplicates-checkbox"
                            checked={all_group_selected}
                            onChange={(event_object) =>
                              set_group_selection(group_item, event_object.target.checked)
                            }
                            disabled={group_busy || group_member_ids.length === 0}
                          />
                          <span>{t('duplicatesSelectAllInGroup')}</span>
                        </label>
                        {group_item.kind === 'same_hash' && (group_item.members?.length || 0) > 1 ? (
                          <div className="flex items-center gap-1.5 border-l border-[var(--gd-border)] pl-3">
                            <button
                              type="button"
                              className="text-xs font-medium text-[var(--gd-primary)] hover:underline"
                              onClick={() => select_keep_oldest_in_group(group_item)}
                              disabled={group_busy}
                            >
                              {t('duplicatesKeepOldest')}
                            </button>
                            <span className="text-[var(--gd-border)]">·</span>
                            <button
                              type="button"
                              className="text-xs font-medium text-[var(--gd-primary)] hover:underline"
                              onClick={() => select_keep_newest_in_group(group_item)}
                              disabled={group_busy}
                            >
                              {t('duplicatesKeepNewest')}
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {selected_in_group > 0 ? (
                        <span>{t('duplicatesSelectedInGroup', { n: selected_in_group })}</span>
                      ) : null}
                    </div>
                    <ul className="divide-y divide-[var(--gd-border)]">
                      {(group_item.members || []).map((member_item) => {
                        const trash_message_ids = (group_item.members || [])
                          .map((group_member) => group_member.messageId)
                          .filter((message_id) => message_id !== member_item.messageId);
                        const can_keep = trash_message_ids.length > 0;
                        const member_selected = selected_id_set.has(member_item.messageId);
                        const member_deleting = deleting_id_set.has(member_item.messageId);
                        const is_undersized_original =
                          original_undersized &&
                          (member_item.isOriginal ||
                            (!(group_item.members || []).some((group_member) => group_member.isOriginal) &&
                              member_item.messageId === (group_item.members || [])[0]?.messageId));

                        return (
                          <li
                            key={member_item.messageId}
                            className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--gd-hover)] ${
                              is_undersized_original
                                ? 'bg-[color-mix(in_srgb,var(--gd-danger)_12%,transparent)]'
                                : member_selected
                                  ? 'bg-[var(--gd-selected)]'
                                  : ''
                            }`}
                            onClick={() => {
                              if (!group_busy) toggle_member_selected(member_item.messageId);
                            }}
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <input
                                type="checkbox"
                                className="gd-duplicates-checkbox mt-1"
                                checked={member_selected}
                                onChange={() => toggle_member_selected(member_item.messageId)}
                                onClick={(event_object) => event_object.stopPropagation()}
                                disabled={group_busy}
                                aria-label={t('duplicatesSelectMember')}
                              />
                              <div className="min-w-0">
                                <div
                                  className={`truncate text-sm font-medium ${
                                    is_undersized_original
                                      ? 'text-[var(--gd-danger)]'
                                      : 'text-[var(--gd-text)]'
                                  }`}
                                >
                                  {member_item.path?.split('/').pop() || member_item.path}
                                </div>
                                <div
                                  className={`mt-1 text-xs ${
                                    is_undersized_original
                                      ? 'text-[var(--gd-danger)]'
                                      : 'text-[var(--gd-text-secondary)]'
                                  }`}
                                >
                                  <div className="truncate">{member_item.path}</div>
                                  <div className="mt-0.5">
                                    {format_size(member_item.size)} · {short_sha(member_item.sha256)}
                                    {member_item.isOriginal ? ` · ${t('duplicatesBadgeOriginal')}` : ''}
                                    {member_item.isConflictName
                                      ? ` · ${t('duplicatesBadgeConflict')}`
                                      : ''}
                                    {is_undersized_original
                                      ? ` · ${t('duplicatesOriginalSmaller')}`
                                      : ''}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div
                              className="flex shrink-0 items-center gap-2"
                              onClick={(event_object) => event_object.stopPropagation()}
                            >
                              {group_item.kind === 'same_hash' ? (
                                <button
                                  type="button"
                                  className="gd-row-action"
                                  title={t('duplicatesOpenFolder')}
                                  aria-label={t('duplicatesOpenFolder')}
                                  onClick={() => open_vault_folder(parent_folder_path(member_item.path))}
                                  disabled={group_busy}
                                >
                                  <IconFolder className="h-4 w-4" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="gd-row-action"
                                title={t('rename')}
                                aria-label={t('rename')}
                                onClick={() => void run_rename(member_item)}
                                disabled={group_busy}
                              >
                                <IconRename className="h-5 w-5" />
                              </button>
                              <button
                                type="button"
                                className="gd-row-action text-[var(--gd-danger, #c5221f)]"
                                title={t('duplicatesDeleteForever')}
                                aria-label={t('duplicatesDeleteForever')}
                                onClick={() => void run_delete_forever([member_item.messageId])}
                                disabled={group_busy}
                              >
                                {member_deleting ? (
                                  <span
                                    className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
                                    role="status"
                                  />
                                ) : (
                                  <IconDeleteForever className="h-5 w-5" />
                                )}
                              </button>
                              {can_keep ? (
                                <button
                                  type="button"
                                  className="gd-dialog-btn gd-dialog-btn--primary"
                                  onClick={() =>
                                    void run_keep(
                                      group_item.id,
                                      member_item.messageId,
                                      trash_message_ids,
                                    )
                                  }
                                  disabled={group_busy}
                                >
                                  {t('duplicatesKeep')}
                                </button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
