const CONTENT_NAME='Curso Reparo Caixa Direcao Palio';
const VALUE=79;
const CURRENCY='BRL';

function eventId(){
  return typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2,11)}`;
}

function trackMeta(name,custom={},userData={}){
  const id=eventId();
  if(typeof window.fbq==='function'){
    window.fbq('track',name,custom,{eventID:id});
  }
  fetch('/api/track',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      event_name:name,
      event_id:id,
      event_source_url:location.href,
      custom_data:custom,
      user_data:userData
    }),
    keepalive:true
  }).catch(()=>{});
  return id;
}

async function initMeta(){
  try{
    const response=await fetch('/config.js',{cache:'no-store'});
    if(!response.ok)return;
    const js=await response.text();
    new Function(js)();
    const pixelId=window.OE_CONFIG?.metaPixelId;
    if(!pixelId)return;

    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;
      n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
      t=b.createElement(e);t.async=!0;t.src=v;
      s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);
    }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

    window.fbq('set','autoConfig',false,pixelId);
    window.fbq('init',pixelId);
    trackMeta('PageView');
    trackMeta('ViewContent',{content_name:CONTENT_NAME,value:VALUE,currency:CURRENCY});
  }catch(error){
    console.warn('Meta tracking init skipped',error);
  }
}

function initRioOneModal(){
  const formHost=document.querySelector('.rio-one-form');
  if(!formHost)return null;

  const style=document.createElement('style');
  style.textContent=`
    .rio-modal{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.76);backdrop-filter:blur(6px)}
    .rio-modal.is-open{display:flex}
    .rio-modal__panel{position:relative;width:min(100%,620px);max-height:min(90vh,850px);overflow:auto;border:1px solid #4a4322;border-radius:20px;background:#0d1114;box-shadow:0 30px 100px #000;padding:30px 26px}
    .rio-modal__close{position:absolute;top:12px;right:12px;width:38px;height:38px;border:1px solid #39424a;border-radius:999px;background:#171d23;color:#fff;font-size:24px;line-height:1;cursor:pointer}
    .rio-modal__eyebrow{display:block;padding-right:48px;color:#ffc400;font-size:.75rem;font-weight:950;letter-spacing:.12em;text-transform:uppercase}
    .rio-modal__title{margin:8px 0 8px;font-size:clamp(1.65rem,5vw,2.35rem);line-height:1.03;letter-spacing:-.04em}
    .rio-modal__text{margin:0 0 20px;color:#a7b0b8}
    .rio-modal .rio-one-form{display:block;width:100%;min-height:120px}
    body.rio-modal-open{overflow:hidden}
    @media(max-width:560px){.rio-modal{padding:10px}.rio-modal__panel{padding:26px 16px 20px;border-radius:16px}}
  `;
  document.head.appendChild(style);

  const modal=document.createElement('div');
  modal.className='rio-modal';
  modal.setAttribute('aria-hidden','true');
  modal.innerHTML=`
    <div class="rio-modal__panel" role="dialog" aria-modal="true" aria-labelledby="rio-modal-title">
      <button class="rio-modal__close" type="button" aria-label="Fechar formulário">×</button>
      <span class="rio-modal__eyebrow">Antes de ir para o pagamento</span>
      <h2 class="rio-modal__title" id="rio-modal-title">Preencha seus dados para continuar</h2>
      <p class="rio-modal__text">É rápido. Depois do cadastro, você continua para o checkout do treinamento.</p>
      <div class="rio-modal__form-slot"></div>
    </div>
  `;
  modal.querySelector('.rio-modal__form-slot').appendChild(formHost);
  document.body.appendChild(modal);

  const close=()=>{
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden','true');
    document.body.classList.remove('rio-modal-open');
  };
  const open=()=>{
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('rio-modal-open');
    setTimeout(()=>modal.querySelector('input,button,select,textarea')?.focus(),120);
  };

  modal.querySelector('.rio-modal__close').addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal.classList.contains('is-open'))close();});

  return {open,close};
}

const rioOneModal=initRioOneModal();
const checkoutButtons=document.querySelectorAll('[data-checkout]');
checkoutButtons.forEach(button=>{
  button.addEventListener('click',event=>{
    event.preventDefault();
    const label=button.dataset.label||'checkout';
    if(typeof gtag==='function'){
      gtag('event','click_checkout',{event_category:'cta',event_label:label});
    }
    trackMeta('InitiateCheckout',{content_name:CONTENT_NAME,value:VALUE,currency:CURRENCY,cta_label:label});
    if(rioOneModal){
      rioOneModal.open();
      return;
    }
    const href=button.getAttribute('href');
    if(href)location.href=href;
  });
});

const legacySource='https://raw.githubusercontent.com/OficinaEficente/site_palio/main/index.html';
const imageRanges={0:{start:13235,end:193826,mime:'image/jpeg'},1:{start:194744,end:287319,mime:'image/jpeg'}};
const imageCache=new Map();
async function loadLegacyImage(index){const sourceIndex=index===2?0:index;if(imageCache.has(sourceIndex))return imageCache.get(sourceIndex);const range=imageRanges[sourceIndex];if(!range)return null;const promise=fetch(legacySource,{headers:{Range:`bytes=${range.start}-${range.end}`}}).then(async response=>{if(!response.ok||response.status!==206)return null;const base64=(await response.text()).trim();return `data:${range.mime};base64,${base64}`;}).catch(()=>null);imageCache.set(sourceIndex,promise);return promise;}

const lazyPhotos=[...document.querySelectorAll('[data-legacy-img]')];
const loadPhoto=async img=>{if(img.dataset.loaded)return;img.dataset.loaded='1';const src=await loadLegacyImage(Number(img.dataset.legacyImg));if(src)img.src=src;else img.closest('.legacy-photo')?.classList.add('photo-unavailable');};
if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){loadPhoto(entry.target);observer.unobserve(entry.target);}});},{rootMargin:'350px'});lazyPhotos.forEach(img=>observer.observe(img));}else{lazyPhotos.forEach(loadPhoto);}

initMeta();
