// Guest selection is a UI preference, never an authenticated identity.
export async function enterWorkspace(account) {
  const failed=new URLSearchParams(location.search).has('authError');
  let guest=false;
  try {guest=sessionStorage.getItem('cuebook-guest')==='yes';} catch {}
  if(account.user || (guest && !failed))return;
  const app=document.querySelector('#app');
  app.innerHTML=`<main class="welcome-page"><a class="welcome-brand" href="${import.meta.env.BASE_URL}" aria-label="Cuebook home"><span aria-hidden="true">▥</span> Cuebook</a>
    <div class="welcome-layout"><section class="welcome-intro"><p class="eyebrow">FROM SOUNDTRACK TO CUE SHEET</p><h1>Every cue.<br>Every credit.<br>All together.</h1><p>Find the music, refine your timings, and turn your credits into a finished cue sheet.</p><div class="welcome-steps"><span>01 &nbsp; Add your media</span><span>02 &nbsp; Review your cues</span><span>03 &nbsp; Export your sheet</span></div></section>
    <section class="welcome-card" aria-labelledby="welcome-title"><span class="eyebrow">YOUR MUSIC WORKSPACE</span><h2 id="welcome-title">Welcome to Cuebook</h2><p>Create an account to save projects, audio, and video—and pick up where you left off.</p>
    ${failed?'<p class="notice" role="alert">Login could not finish. Please try again, or continue as a guest.</p>':''}
    ${account.configured?'<a class="primary welcome-action" href="/api/auth?action=signup">Sign up</a><a class="welcome-action welcome-login" href="/api/auth?action=login">Log in</a>':'<p class="notice" role="status">Account access is currently unavailable. You can still work as a guest.</p>'}
    <div class="welcome-divider"><span>or</span></div><button id="continue-guest" class="welcome-action">Continue as guest</button><p class="welcome-footnote">No account needed to create and export a cue sheet. Sign up whenever you’re ready to save your projects.</p></section></div><footer class="welcome-footer">CUEBOOK / MADE FOR THE PEOPLE BEHIND THE MUSIC</footer></main>`;
  await new Promise(resolve=>{
    document.querySelector('#continue-guest').onclick=()=>{
      try {sessionStorage.setItem('cuebook-guest','yes');} catch {}
      if(failed){const url=new URL(location.href);url.searchParams.delete('authError');history.replaceState(null,'',url);}
      resolve();
    };
  });
}
