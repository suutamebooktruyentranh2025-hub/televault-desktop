/** Serialize hashing so large-folder uploads do not spike RAM. */
let pendingChain = Promise.resolve();

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withHashLock(fn) {
  let release;
  const previous = pendingChain;
  pendingChain = new Promise((resolve) => {
    release = resolve;
  });
  return previous
    .catch(() => {})
    .then(() => fn())
    .finally(() => {
      release();
    });
}

module.exports = { withHashLock };
