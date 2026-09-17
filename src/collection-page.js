// Shared layout for account collections. HTML slots must contain escaped content.
export function collectionPage({title, description, action='', summary='', body}) {
  return `<div class="collection-page"><div class="heading collection-heading"><div><div class="eyebrow">YOUR LIBRARY</div><h1>${title}</h1><p>${description}</p></div>${action}</div>${summary?`<div class="section-title collection-summary"><span class="muted">${summary}</span></div>`:''}<div class="collection-body">${body}</div></div>`;
}
export function collectionCreateButton({label, attributes='', disabled=false}) {
  return `<button class="primary collection-create" ${attributes} ${disabled?'disabled':''}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>${label}</button>`;
}
export function collectionRow({title, detail, icon, actions}) {
  return `<article class="collection-row"><span class="collection-icon" aria-hidden="true">${icon}</span><div class="collection-info"><strong>${title}</strong><small>${detail}</small></div><div class="collection-actions">${actions}</div></article>`;
}
