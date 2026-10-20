const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Trích xuất nội dung ghi chú phát hành cho tag hiện tại.
 * - Ưu tiên 1: Đọc từ RELEASE_NOTES.md của phiên bản tương ứng.
 * - Ưu tiên 2: Fallback lấy danh sách git commit giữa tag trước và tag hiện tại.
 * @param {string} [tagName]
 * @returns {string}
 */
function extractReleaseNotes(tagName) {
  const rootDir = path.resolve(__dirname, '..');
  const tag = tagName || process.env.TAG_NAME || process.env.GITHUB_REF_NAME || '';
  const version = tag ? tag.replace(/^v/, '') : require(path.join(rootDir, 'package.json')).version;

  // 1. Thử tìm trong RELEASE_NOTES.md
  const notesPath = path.join(rootDir, 'RELEASE_NOTES.md');
  if (fs.existsSync(notesPath)) {
    const raw = fs.readFileSync(notesPath, 'utf8');
    const sections = raw.split(/^# Release Notes/m);
    for (const sec of sections) {
      if (!sec.trim()) continue;
      const firstLine = sec.trim().split('\n')[0];
      if (firstLine.includes(version)) {
        return ('# Release Notes' + sec).trim();
      }
    }
  }

  // 2. Fallback: Lấy git commit logs giữa tag trước và HEAD
  try {
    let prevTag = '';
    try {
      prevTag = execSync('git describe --tags --abbrev=0 HEAD^ 2>/dev/null', {
        cwd: rootDir,
        encoding: 'utf8',
      }).trim();
    } catch {
      prevTag = '';
    }

    const range = prevTag ? `${prevTag}..HEAD` : 'HEAD~10..HEAD';
    const rawLog = execSync(`git log ${range} --pretty=format:"- %s"`, {
      cwd: rootDir,
      encoding: 'utf8',
    }).trim();

    if (rawLog) {
      // Lọc bỏ commit merge hoặc release bump tự động
      const cleaned = rawLog
        .split('\n')
        .filter((line) => !/-\s*(?:Merge branch|release:?\s*\d)/i.test(line))
        .join('\n')
        .trim();

      if (cleaned) {
        return `## 🌟 Thay đổi trong ${tag || 'v' + version}\n\n${cleaned}`;
      }
    }
  } catch {}

  // 3. Fallback cuối cùng
  return `## 🌟 TeleVault Desktop ${tag || 'v' + version}\n\n- Bản cập nhật mới cho TeleVault Desktop.`;
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const notes = extractReleaseNotes();
  const outputPath = path.join(rootDir, 'RELEASE_BODY.md');
  fs.writeFileSync(outputPath, notes, 'utf8');
  console.log(`Generated release notes at ${outputPath}:\n\n${notes}`);
}

if (require.main === module) {
  main();
}

module.exports = { extractReleaseNotes };
