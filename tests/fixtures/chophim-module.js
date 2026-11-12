// Functional excerpt; see ATTRIBUTION.md.
function observedPopunder(){
let r=e=>{if(0===e.button){try{let e=Number(window.localStorage.getItem(B)||"0");if(Number.isFinite(e)&&Date.now()-e<18e5)return;window.localStorage.setItem(B,String(Date.now()))}catch{}e.preventDefault(),e.stopImmediatePropagation(),window.open(window.location.href,"_blank","noopener,noreferrer"),window.location.assign("https://tinyurl.com/2wrb84c7")}};return document.addEventListener("click",r,{capture:!0});
}
