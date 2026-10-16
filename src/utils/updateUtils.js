/**
 * Chuẩn hóa chuỗi phiên bản (loại bỏ tiền tố 'v', khoảng trắng).
 * @param {string|null|undefined} version
 * @returns {string}
 */
export function cleanVersion(version) {
  if (!version || typeof version !== 'string') return '0.0.0';
  const trimmed = version.trim().replace(/^[vV]/, '');
  return trimmed || '0.0.0';
}

/**
 * Phân tách chuỗi semver thành [major, minor, patch, prerelease].
 * @param {string} v
 * @returns {{ major: number, minor: number, patch: number, pre: string }}
 */
function parseSemver(v) {
  const cleaned = cleanVersion(v);
  const [core, ...preParts] = cleaned.split('-');
  const pre = preParts.join('-');
  const parts = core.split('.').map((p) => parseInt(p, 10) || 0);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    pre,
  };
}

/**
 * Kiểm tra xem phiên bản remote có mới hơn phiên bản hiện tại không.
 * @param {string} remote
 * @param {string} current
 * @returns {boolean}
 */
export function isNewerVersion(remote, current) {
  if (!remote) return false;
  if (!current) return true;

  const r = parseSemver(remote);
  const c = parseSemver(current);

  if (r.major !== c.major) return r.major > c.major;
  if (r.minor !== c.minor) return r.minor > c.minor;
  if (r.patch !== c.patch) return r.patch > c.patch;

  // Nếu bằng core version, kiểm tra prerelease nếu có
  if (r.pre && !c.pre) return false; // release bình thường mới hơn prerelease
  if (!r.pre && c.pre) return true;
  return false;
}

/**
 * Bóc tách nội dung Markdown release notes thành danh sách mục phân loại.
 * @param {string} markdown
 * @returns {Array<{ type: 'new' | 'fix' | 'improve' | 'other', text: string }>}
 */
export function parseChangelog(markdown) {
  if (!markdown || typeof markdown !== 'string') return [];

  const lines = markdown.split(/\r?\n/);
  /** @type {Array<{ type: 'new' | 'fix' | 'improve' | 'other', text: string }>} */
  const results = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    // Bỏ qua các tiêu đề markdown (## ...)
    if (line.startsWith('#')) continue;

    // Loại bỏ gạch đầu dòng Markdown (- hoặc *)
    let cleanLine = line.replace(/^[-*•]\s+/, '').trim();
    if (!cleanLine) continue;

    let type = 'other';

    if (
      /^\[?(?:Mới|New|Feature)\]?[:\s]*/i.test(cleanLine) ||
      /^feat(?:\(.*?\))?:\s*/i.test(cleanLine)
    ) {
      type = 'new';
      cleanLine = cleanLine.replace(/^\[?(?:Mới|New|Feature)\]?[:\s]*/i, '').replace(/^feat(?:\(.*?\))?:\s*/i, '');
    } else if (
      /^\[?(?:Sửa|Fix|Bugfix)\]?[:\s]*/i.test(cleanLine) ||
      /^fix(?:\(.*?\))?:\s*/i.test(cleanLine)
    ) {
      type = 'fix';
      cleanLine = cleanLine.replace(/^\[?(?:Sửa|Fix|Bugfix)\]?[:\s]*/i, '').replace(/^fix(?:\(.*?\))?:\s*/i, '');
    } else if (
      /^\[?(?:Cải tiến|Improve|Enhancement|Tối ưu)\]?[:\s]*/i.test(cleanLine) ||
      /^(?:perf|refactor)(?:\(.*?\))?:\s*/i.test(cleanLine)
    ) {
      type = 'improve';
      cleanLine = cleanLine
        .replace(/^\[?(?:Cải tiến|Improve|Enhancement|Tối ưu)\]?[:\s]*/i, '')
        .replace(/^(?:perf|refactor)(?:\(.*?\))?:\s*/i, '');
    }

    results.push({
      type,
      text: cleanLine.trim(),
    });
  }

  return results;
}
