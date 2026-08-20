import{c as s,r as l,j as e,aw as m,aD as k,ax as j}from"./index-q5RV35vr.js";/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=s("BarChart2",[["line",{x1:"18",x2:"18",y1:"20",y2:"10",key:"1xfpm4"}],["line",{x1:"12",x2:"12",y1:"20",y2:"4",key:"be30l9"}],["line",{x1:"6",x2:"6",y1:"20",y2:"14",key:"1r4le6"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const q=s("DollarSign",[["line",{x1:"12",x2:"12",y1:"2",y2:"22",key:"7eqyqh"}],["path",{d:"M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",key:"1b0p4s"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const D=s("Hash",[["line",{x1:"4",x2:"20",y1:"9",y2:"9",key:"4lhtct"}],["line",{x1:"4",x2:"20",y1:"15",y2:"15",key:"vyu0kd"}],["line",{x1:"10",x2:"8",y1:"3",y2:"21",key:"1ggp8o"}],["line",{x1:"16",x2:"14",y1:"3",y2:"21",key:"weycgp"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=s("LifeBuoy",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m4.93 4.93 4.24 4.24",key:"1ymg45"}],["path",{d:"m14.83 9.17 4.24-4.24",key:"1cb5xl"}],["path",{d:"m14.83 14.83 4.24 4.24",key:"q42g0n"}],["path",{d:"m9.17 14.83-4.24 4.24",key:"bqpfvv"}],["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _=s("PhoneIncoming",[["polyline",{points:"16 2 16 8 22 8",key:"1ygljm"}],["line",{x1:"22",x2:"16",y1:"2",y2:"8",key:"1xzwqn"}],["path",{d:"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",key:"foiqr5"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const v=s("PhoneMissed",[["line",{x1:"22",x2:"16",y1:"2",y2:"8",key:"1xzwqn"}],["line",{x1:"16",x2:"22",y1:"2",y2:"8",key:"13zxdn"}],["path",{d:"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",key:"foiqr5"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const M=s("Send",[["path",{d:"m22 2-7 20-4-9-9-4Z",key:"1q3vgg"}],["path",{d:"M22 2 11 13",key:"nzbqef"}]]),S={ringing:"Ringing",accepted:"Connecting",connected:"Connected",ended:"Connected",rejected:"Declined",missed:"Missed",failed:"Failed",cancelled:"Cancelled"},u={caller_ended:"Customer hung up",receiver_ended:"Agent hung up",rejected:"Declined by agent",timeout:"No answer",connection_failed:"Connection failed",permission_denied:"Microphone blocked",network_failure:"Network failure"};function C(t,r){return t==="ended"||t==="connected"?r.green:t==="failed"?r.red:r.sub}function L({status:t,size:r=13}){return t==="missed"||t==="cancelled"?e.jsx(v,{size:r}):t==="rejected"||t==="failed"?e.jsx(j,{size:r}):e.jsx(_,{size:r})}const b=t=>{if(!t)return"";try{return new Date(t).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}};function z({fetcher:t,apiBase:r,endpoint:o,theme:i=m,refreshKey:f=0,emptyText:p="No calls on this conversation yet",title:g="Call history"}){const[c,d]=l.useState([]),[h,y]=l.useState(!0),x=l.useCallback(async()=>{if(o)try{const n=await t(`${r}${o}`);if(!(n!=null&&n.ok)){d([]);return}const a=await n.json();d(Array.isArray(a)?a:(a==null?void 0:a.results)||[])}catch{d([])}finally{y(!1)}},[t,r,o]);return l.useEffect(()=>{y(!0),x()},[x,f]),h?null:c.length?e.jsxs("div",{children:[e.jsx("div",{style:{fontSize:9.5,letterSpacing:"0.11em",textTransform:"uppercase",color:i.muted,fontWeight:700,marginBottom:7},children:g}),e.jsx("div",{style:{display:"flex",flexDirection:"column",gap:5},children:c.map(n=>{const a=C(n.status,i);return e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:9,padding:"7px 10px",borderRadius:8,border:`1px solid ${i.border}`,background:i.surface2},children:[e.jsx("span",{style:{color:a,display:"flex",flexShrink:0},children:e.jsx(L,{status:n.status})}),e.jsxs("div",{style:{flex:1,minWidth:0},children:[e.jsxs("div",{style:{fontSize:11.5,fontWeight:600,color:i.text,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"},children:[e.jsx("span",{style:{color:a},children:S[n.status]||n.status}),n.duration_seconds>0&&e.jsxs("span",{style:{color:i.sub,fontVariantNumeric:"tabular-nums"},children:["· ",k(n.duration_seconds)]}),e.jsxs("span",{style:{color:i.muted,fontWeight:500},children:["· Ticket #",n.ticket_id]})]}),e.jsxs("div",{style:{fontSize:10,color:i.muted,marginTop:1},children:[b(n.started_at),n.caller_name&&e.jsxs(e.Fragment,{children:[" · ",n.caller_name]}),n.receiver_name&&e.jsxs(e.Fragment,{children:[" → ",n.receiver_name]}),n.end_reason&&u[n.end_reason]&&e.jsxs(e.Fragment,{children:[" · ",u[n.end_reason]]})]})]})]},n.id)})})]}):e.jsx("div",{style:{fontSize:11,color:i.muted,padding:"8px 2px"},children:p})}export{w as B,z as C,q as D,D as H,E as L,M as S};
