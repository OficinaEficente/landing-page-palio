const checkoutButtons=document.querySelectorAll('[data-checkout]');checkoutButtons.forEach(button=>{button.addEventListener('click',()=>{if(typeof gtag==='function'){gtag('event','click_checkout',{event_category:'cta',event_label:button.dataset.label||'checkout'});}});});

const legacySource='https://raw.githubusercontent.com/OficinaEficente/site_palio/main/index.html';
const imageRanges={0:{start:13235,end:193826,mime:'image/jpeg'},1:{start:194744,end:287319,mime:'image/jpeg'}};
const imageCache=new Map();
async function loadLegacyImage(index){const sourceIndex=index===2?0:index;if(imageCache.has(sourceIndex))return imageCache.get(sourceIndex);const range=imageRanges[sourceIndex];if(!range)return null;const promise=fetch(legacySource,{headers:{Range:`bytes=${range.start}-${range.end}`}}).then(async response=>{if(!response.ok||response.status!==206)return null;const base64=(await response.text()).trim();return `data:${range.mime};base64,${base64}`;}).catch(()=>null);imageCache.set(sourceIndex,promise);return promise;}

const lazyPhotos=[...document.querySelectorAll('[data-legacy-img]')];
const loadPhoto=async img=>{if(img.dataset.loaded)return;img.dataset.loaded='1';const src=await loadLegacyImage(Number(img.dataset.legacyImg));if(src)img.src=src;else img.closest('.legacy-photo')?.classList.add('photo-unavailable');};
if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){loadPhoto(entry.target);observer.unobserve(entry.target);}});},{rootMargin:'350px'});lazyPhotos.forEach(img=>observer.observe(img));}else{lazyPhotos.forEach(loadPhoto);}