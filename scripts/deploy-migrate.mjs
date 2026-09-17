// Frontend previews may intentionally have no account database configured.
// Production must fail closed rather than publish an API against an old schema.
if (process.env.VERCEL_ENV === 'preview' && !process.env.DATABASE_URL) {
  console.log('Preview has no database configured; skipping account migrations.');
} else {
  await import('./migrate.mjs');
}
