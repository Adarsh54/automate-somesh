const mobile = window.matchMedia('(max-width: 720px)');
const preference = {desktop: false, mobile: true};
for (const size of Object.keys(preference)) {
  try { const saved = localStorage.getItem(`cuestamp-sidebar-${size}`); if(saved !== null) preference[size] = saved === 'collapsed'; } catch {}
}

const paths = {
  shared: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4v3"/>',
  library: '<path d="M5 8v8m5-12v16m5-13v10m4-7v4"/>',
  cues: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  production: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7"/>',
  review: '<path d="M9 4H5v17h14V4h-4M9 3h6v4H9zM8 14l3 3 5-6"/>',
  settings: '<path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .1 1.8 1.8 0 0 0-.3 1v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3.3-1l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-1-3.3H3a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 1-3.3l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3.3-1V3a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3.3 1l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 1 3.3h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-1 1.4Z"/>'
};
export const sidebarIcon = key => `<svg class="nav-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[key]}</svg>`;
export const sidebarToggle = `<button id="sidebar-toggle" type="button" aria-controls="sidebar-nav"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path class="desktop-arrow" d="m14 7-5 5 5 5"/><path class="mobile-arrow" d="m7 14 5-5 5 5"/></svg></button>`;

function applySidebar() {
  const collapsed = preference[mobile.matches ? 'mobile' : 'desktop'];
  document.querySelector('#app')?.classList.toggle('sidebar-collapsed', collapsed);
  const toggle = document.querySelector('#sidebar-toggle');
  if (!toggle) return;
  const label = `${collapsed ? 'Expand' : 'Collapse'} ${mobile.matches ? 'navigation' : 'sidebar'}`;
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('title', label);
  toggle.setAttribute('aria-expanded', String(!collapsed));
}
export function bindSidebar() {
  const toggle = document.querySelector('#sidebar-toggle');
  toggle.onclick = () => {
    const size = mobile.matches ? 'mobile' : 'desktop';
    preference[size] = !preference[size];
    try { localStorage.setItem(`cuestamp-sidebar-${size}`, preference[size] ? 'collapsed' : 'expanded'); } catch {}
    applySidebar();
  };
  applySidebar();
}
mobile.addEventListener('change', applySidebar);
