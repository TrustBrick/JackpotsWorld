import{c,a3 as e}from"./index-49zYU1B7.js";/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const r=c("Activity",[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",key:"169zse"}]]),i="https://jackpotsworld.vip";async function h(o,s){const t=e(o),a=e(s);if(!(!t||!a))try{await fetch(`${i}/api/auth/logout/`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({refresh:a})})}catch{}}export{r as A,h as r};
