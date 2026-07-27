// Sends N items through `worker` at a time rather than fully sequentially or
// all-at-once — bulk SMS/email to hundreds of recipients would otherwise
// take minutes one-by-one, or risk tripping the provider's rate limit if
// fired all at once. No queue/worker process exists in this app, so this is
// an in-request concurrency limiter, not a background job system.
async function runWithConcurrency(items, limit, worker) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    // eslint-disable-next-line no-await-in-loop
    const chunkResults = await Promise.all(chunk.map((item) => worker(item)));
    results.push(...chunkResults);
  }
  return results;
}

module.exports = { runWithConcurrency };
