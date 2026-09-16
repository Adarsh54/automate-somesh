const key = 'cuebook-theme';
const system = window.matchMedia('(prefers-color-scheme: dark)');
let preference;
try { preference = localStorage.getItem(key); } catch {}
if (!['light', 'dark'].includes(preference)) preference = null;
const currentTheme = () => preference || (system.matches ? 'dark' : 'light');

function applyTheme() {
  document.documentElement.dataset.theme = currentTheme();
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
    button.title = `Switch to ${currentTheme() === 'dark' ? 'light' : 'dark'} mode`;
  });
}
export function themeToggle() {
  return `<button type="button" class="theme-toggle" data-theme-toggle aria-label="Dark mode" aria-pressed="${currentTheme() === 'dark'}" title="Switch to ${currentTheme() === 'dark' ? 'light' : 'dark'} mode"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/></svg></button>`;
}
applyTheme();
document.addEventListener('click', event => {
  if (!event.target.closest('[data-theme-toggle]')) return;
  preference = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(key, preference); } catch {}
  applyTheme();
});
system.addEventListener('change', applyTheme);
window.addEventListener('storage', event => {
  if (event.key !== key && event.key !== null) return;
  preference = ['light', 'dark'].includes(event.newValue) ? event.newValue : null;
  applyTheme();
});
