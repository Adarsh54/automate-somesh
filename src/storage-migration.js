// Preserve drafts and preferences created before the product was renamed.
// Storage is origin-scoped; cloud projects remain available on either domain.
for (const name of ['localStorage', 'sessionStorage']) {
  try {
    const storage = window[name];
    for (const key of Object.keys(storage)) {
      if (!key.startsWith('cuebook-')) continue;
      const renamed = key.replace(/^cuebook-/, 'cuestamp-');
      if (storage.getItem(renamed) === null) storage.setItem(renamed, storage.getItem(key));
    }
  } catch { /* Private browsing may disable storage. */ }
}
