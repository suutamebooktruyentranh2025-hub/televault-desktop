# Google Drive Multi-Part Parallel Download Design

## Problem Statement
Downloading files via Google Drive REST API v3 using a single HTTP/1.1 stream is significantly slower than browser downloads. Google's API enforces per-connection bandwidth limits, and single-stream TCP performance degrades over high-latency networks due to Bandwidth-Delay Product (BDP) constraints.

## Proposed Solution
Implement a multi-part parallel range chunk downloader for files >= 20 MB, breaking large files into concurrent HTTP Range requests (`Range: bytes=start-end`), writing directly to preallocated files at specific byte offsets, while retaining single-stream download for small files (< 20 MB) or servers that reject Range requests.

## Architecture

### 1. Chunk Planning & Allocation
- Threshold: Files >= 20 MB trigger parallel download. Files < 20 MB use single stream.
- Default Concurrency: 4 parallel workers.
- Minimum Chunk Size: 5 MB per worker.
- Output file is pre-allocated to the exact size using `fs.ftruncateSync` via `allocateFile`.

### 2. Parallel Streaming & Disk I/O
- Each worker makes an authenticated GET request with `Range: bytes=${start}-${end}` to `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`.
- Each worker opens a write stream to the target file with `{ flags: 'r+', start: workerOffset }`.
- Live download progress is aggregated across all active workers and reported to the existing `onProgress` callback.
- If a server responds with HTTP 200 instead of HTTP 206 (Range not supported), the downloader transparently falls back to single-stream mode.

### 3. Error Recovery & Integrity
- Individual chunk failure/timeout: Worker retries the remaining byte range of that specific chunk up to 3 times without restarting other completed chunks.
- When all chunks finish, `verifyDownloadedFile({ filePath, expectedSize, expectedMd5 })` validates file size and checksum.
- Hashing (MD5 / SHA-256) is computed during stream or post-download verification.

### 4. Integration
- `gdriveApi.downloadFile` delegates to `_downloadParallelChunks` when `expectedSize >= 20 * 1024 * 1024`, maintaining complete API compatibility with `gdriveFileDownloader` and the UI.
