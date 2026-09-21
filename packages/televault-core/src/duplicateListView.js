/**
 * @param {{ members?: Array<{ size?: number }> }} group_item
 * @returns {number}
 */
function groupWastedBytes(group_item) {
  const members = group_item?.members || [];
  if (members.length < 2) return 0;
  let max_size = 0;
  for (const member_item of members) {
    const member_size = Number(member_item?.size) || 0;
    if (member_size > max_size) max_size = member_size;
  }
  return (members.length - 1) * max_size;
}

/**
 * @param {Array<{ originalPath?: string, members?: Array<{ path?: string }> }>} groups
 * @param {string} query_text
 */
function filterDuplicateGroups(groups, query_text) {
  const normalized_query = String(query_text || '')
    .trim()
    .toLowerCase();
  if (!normalized_query) return [...(groups || [])];

  return (groups || []).filter((group_item) => {
    const original_path = String(group_item.originalPath || '').toLowerCase();
    if (original_path.includes(normalized_query)) return true;
    for (const member_item of group_item.members || []) {
      const member_path = String(member_item.path || '').toLowerCase();
      if (member_path.includes(normalized_query)) return true;
      const file_name = member_path.slice(member_path.lastIndexOf('/') + 1);
      if (file_name.includes(normalized_query)) return true;
    }
    return false;
  });
}

/**
 * How much smaller the original is vs the largest conflict/other copy.
 * @param {{ members?: Array<{ size?: number, isOriginal?: boolean, isConflictName?: boolean, messageId?: number }> }} group_item
 * @returns {number}
 */
function originalSizeDeficit(group_item) {
  const member_list = group_item?.members || [];
  if (member_list.length < 2) return 0;

  const original_member =
    member_list.find((member_item) => member_item.isOriginal) || member_list[0];
  const original_size = Number(original_member?.size) || 0;

  const conflict_members = member_list.filter(
    (member_item) =>
      member_item.isConflictName && member_item.messageId !== original_member.messageId,
  );
  const compare_members =
    conflict_members.length > 0
      ? conflict_members
      : member_list.filter((member_item) => member_item.messageId !== original_member.messageId);

  let max_compare_size = 0;
  for (const member_item of compare_members) {
    const member_size = Number(member_item?.size) || 0;
    if (member_size > max_compare_size) max_compare_size = member_size;
  }

  return Math.max(0, max_compare_size - original_size);
}

/**
 * @param {{ members?: Array<{ size?: number, isOriginal?: boolean, isConflictName?: boolean, messageId?: number }> }} group_item
 * @returns {boolean}
 */
function isOriginalSmallerThanConflict(group_item) {
  return originalSizeDeficit(group_item) > 0;
}

/**
 * @param {Array<{ id?: string, originalPath?: string, members?: Array<{ size?: number }> }>} groups
 * @param {{ field?: 'count' | 'wasted' | 'path' | 'originalSmaller', direction?: 'asc' | 'desc' }} options
 */
function sortDuplicateGroups(groups, options = {}) {
  const sort_field = options.field || 'wasted';
  const sort_direction = options.direction === 'asc' ? 1 : -1;
  const sorted_groups = [...(groups || [])];

  sorted_groups.sort((left_group, right_group) => {
    let compare_value = 0;
    if (sort_field === 'count') {
      compare_value =
        (left_group.members?.length || 0) - (right_group.members?.length || 0);
    } else if (sort_field === 'path') {
      compare_value = String(left_group.originalPath || '').localeCompare(
        String(right_group.originalPath || ''),
      );
    } else if (sort_field === 'originalSmaller') {
      compare_value =
        originalSizeDeficit(left_group) - originalSizeDeficit(right_group);
    } else {
      compare_value = groupWastedBytes(left_group) - groupWastedBytes(right_group);
    }
    if (compare_value !== 0) return compare_value * sort_direction;
    return String(left_group.id || '').localeCompare(String(right_group.id || ''));
  });

  return sorted_groups;
}

module.exports = {
  groupWastedBytes,
  filterDuplicateGroups,
  sortDuplicateGroups,
  originalSizeDeficit,
  isOriginalSmallerThanConflict,
};
