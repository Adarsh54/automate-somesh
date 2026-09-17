export function openProfile(account,onSaved,{onboarding=false}={}) {
 if(!account.user)return;
 document.querySelector('.user-profile-dialog')?.close();
 const dialog=document.createElement('dialog');dialog.className='resume-workspace user-profile-dialog';dialog.setAttribute('aria-labelledby','profile-heading');
 dialog.innerHTML=`<form><h2 id="profile-heading">${onboarding?'Welcome to Cuestamp':'Your profile'}</h2><p>${onboarding?'Tell us a little about yourself to finish setting up your account.':'Update how you appear in Cuestamp.'}</p><label for="profile-name">Name</label><input id="profile-name" name="name" autocomplete="name" maxlength="120" required><div class="profile-email"><span class="profile-email-label">Email</span><p data-email></p></div><label for="profile-occupation">Occupation</label><input id="profile-occupation" name="occupation" autocomplete="organization-title" placeholder="e.g. Composer, music supervisor, filmmaker" maxlength="120" required><p role="status" data-status></p><div class="button-row"><button class="primary" type="submit">${onboarding?'Save and continue':'Save profile'}</button><button type="button" data-close>${onboarding?'Do this later':'Cancel'}</button></div></form>`;
 const name=dialog.querySelector('[name=name]'),occupation=dialog.querySelector('[name=occupation]');name.value=account.profile?.name || account.user.firstName || '';occupation.value=account.profile?.occupation || '';dialog.querySelector('[data-email]').textContent=account.user.email;
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.querySelector('form').onsubmit=async event=>{
  event.preventDefault();const status=dialog.querySelector('[data-status]'),button=dialog.querySelector('[type=submit]');
  if(!name.value.trim() || !occupation.value.trim()){status.textContent='Enter your name and occupation.';return;}
  button.disabled=true;status.textContent='Saving…';
  try{
   const response=await fetch('/api/auth?action=profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.value.trim(),occupation:occupation.value.trim()}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error(response.status===401?'Your session expired. Sign in again; your entries are kept here.':'Could not save your profile. Please retry.');
   const {profile}=await response.json();account.profile=profile;onSaved();dialog.close();
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
 };
 dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();name.focus();
}
