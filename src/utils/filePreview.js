const PREVIEWABLE_TEXT_EXT = new Set(['txt', 'md', 'json']);

function fileExtension(fileName) {
  if (!fileName || !fileName.includes('.')) return '';
  return fileName.split('.').pop()?.toLowerCase() || '';
}

/** Whether double-click / open should show the in-app preview (images never open). */
export function shouldOpenFilePreview(fileName) {
  return PREVIEWABLE_TEXT_EXT.has(fileExtension(fileName));
}
