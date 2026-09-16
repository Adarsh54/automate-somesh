// Keep account entry points discoverable even when the API is unavailable.
export function authActions(account, {welcome = false} = {}) {
  const action = (name, label, className) => account.configured
    ? `<a class="${className}" href="/api/auth?action=${name}">${label}</a>`
    : `<button type="button" class="${className}" disabled title="Account access is not connected in this environment.">${label}</button>`;
  return welcome
    ? action('signup', 'Sign up', 'primary welcome-action') + action('login', 'Log in', 'welcome-action welcome-login')
    : action('login', 'Log in', 'account-login') + action('signup', 'Sign up', 'primary account-login');
}
