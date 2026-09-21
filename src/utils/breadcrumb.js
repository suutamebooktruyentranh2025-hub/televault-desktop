/**
 * Resolves visible, collapsed, and tail crumbs for breadcrumb navigation.
 * Standardizes collapsing logic to prevent horizontal overflow in top bar.
 *
 * @param {Array<{ label: string, path: string }>} crumbs
 * @param {number} [collapseThreshold=4]
 * @returns {{
 *   isCollapsed: boolean,
 *   firstCrumb: { label: string, path: string } | null,
 *   collapsedCrumbs: Array<{ label: string, path: string }>,
 *   tailCrumbs: Array<{ label: string, path: string }>
 * }}
 */
export function resolveBreadcrumbs(crumbs = [], collapseThreshold = 4) {
  if (!crumbs || crumbs.length === 0) {
    return {
      isCollapsed: false,
      firstCrumb: null,
      collapsedCrumbs: [],
      tailCrumbs: [],
    };
  }

  const isCollapsed = crumbs.length >= collapseThreshold;
  const firstCrumb = crumbs[0];
  const collapsedCrumbs = isCollapsed ? crumbs.slice(1, -2) : [];
  const tailCrumbs = isCollapsed ? crumbs.slice(-2) : crumbs.slice(1);

  return {
    isCollapsed,
    firstCrumb,
    collapsedCrumbs,
    tailCrumbs,
  };
}
