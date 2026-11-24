// 欢乐运动会 · 多校总管理网关 (sports-gateway)
// 职责：/sports=总后台 | /sports/<slug>/*=分诊转发(过渡型) | 未注册=404
var CF_ACC = "1feeb9418369602b80a31685e412601f";
var ZONE = "e4f1a0aa568e1b30b5253ad5870a6269"; // 部署后回填

async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function j(data, status, cookie) {
  const h = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (cookie) h["Set-Cookie"] = cookie;
  return new Response(JSON.stringify(data), { status: status || 200, headers: h });
}
async function routes(env) {
  try { return JSON.parse(await env.GW_KV.get("gw_routes") || "[]"); } catch (e) { return []; }
}
async function saveRoutes(env, r) { await env.GW_KV.put("gw_routes", JSON.stringify(r)); }
async function myTok(env) {
  const ph = await env.GW_KV.get("pw_hash_gw");
  if (!ph) return null;
  return sha256Hex(ph + "-gw-session");
}
async function isAuthed(request, env) {
  const c = (request.headers.get("Cookie") || "").match(/gw_auth=([0-9a-f]{64})/);
  if (!c) return false;
  return c[1] === await myTok(env);
}
async function cf(method, path, body, ctype) {
  const h = { "Authorization": "Bearer " + env0.CF_API_TOKEN, "User-Agent": "sports-gw" };
  if (body !== undefined) {
    if (ctype === "form") {
      const fd = new FormData();
      fd.append("metadata", new Blob([JSON.stringify(body.meta)], { type: "application/json" }));
      fd.append("worker.js", new Blob([body.code], { type: "application/javascript+module" }), "worker.js");
      return fetch("https://api.cloudflare.com/client/v4" + path, { method, headers: h, body: fd });
    }
    h["Content-Type"] = ctype || "application/json";
    return fetch("https://api.cloudflare.com/client/v4" + path, { method, headers: h, body: JSON.stringify(body) });
  }
  return fetch("https://api.cloudflare.com/client/v4" + path, { method, headers: h });
}
var env0 = null;

function adminPage(authed) {
  const css = `:root{--deep:#14213D;--deep2:#1B2A4A;--deep3:#2A4370;--gold:#D9A521;--goldL:#E8BC4F;--bg:#F4F6FA;--card:#fff;--line:#DFE4EC;--ink:#1A2233;--sub:#5B6577;--ok:#2E7D4F;--err:#B03A2E}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink)}
nav{background:rgba(20,33,61,.97);position:sticky;top:0;z-index:50;border-bottom:1px solid rgba(217,165,33,.3)}
.nav-in{max-width:960px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.brand{display:flex;align-items:center;gap:10px}
.brand .ic{font-size:22px;animation:br 2s infinite}
.brand b{color:var(--goldL);font-size:17px;letter-spacing:1px}
.brand span{color:rgba(255,255,255,.75);font-size:12px}
@keyframes br{50%{opacity:.35}}
.btn-out{background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);border:1.5px solid rgba(255,255,255,.5);border-radius:9px;font-size:13px;padding:6px 13px;cursor:pointer;font-family:inherit;font-weight:600}
.wrap{max-width:960px;margin:0 auto;padding:18px 16px 60px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-top:14px;box-shadow:0 2px 10px rgba(20,33,61,.06)}
h1{font-size:20px;color:var(--deep);margin-bottom:4px}
h2{font-size:15px;color:var(--deep2);margin-bottom:12px}
.sub{font-size:13px;color:var(--sub);line-height:1.7}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{background:var(--deep);color:#fff;padding:9px 10px;text-align:left;font-weight:600;white-space:nowrap}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:hover td{background:#FAFBFE}
.tag{display:inline-block;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:700}
.tag.on{background:#E5F3EA;color:var(--ok)}
.tag.off{background:#FBEAE8;color:var(--err)}
.tag.proxy{background:#FBF6E9;color:#8A6914}
input,select,textarea{font-family:inherit;font-size:14px;padding:8px 11px;border:1.5px solid var(--line);border-radius:8px;width:100%;background:#fff;color:var(--ink)}
input:focus{outline:none;border-color:var(--gold)}
label{font-size:12.5px;color:var(--sub);display:block;margin:10px 0 4px;font-weight:600}
button.p{background:linear-gradient(120deg,var(--gold),var(--goldL));color:#3D2E00;border:none;border-radius:9px;padding:9px 20px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}
button.p:hover{filter:brightness(1.06)}
button.g{background:#fff;border:1.5px solid var(--line);border-radius:8px;padding:6px 12px;font-size:12.5px;cursor:pointer;font-family:inherit;color:var(--ink);margin:1px}
button.g:hover{border-color:var(--gold);color:#8A6914}
.msg{font-size:13px;margin-top:8px;min-height:18px}
.msg.ok{color:var(--ok)}.msg.err{color:var(--err)}
.login-box{max-width:380px;margin:12vh auto 0}
.login-box .ic{font-size:44px;text-align:center;display:block;margin-bottom:10px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.field{flex:1;min-width:170px}
dialog{border:none;border-radius:14px;padding:22px 24px;max-width:420px;width:92vw;box-shadow:0 20px 60px rgba(20,33,61,.3)}
dialog::backdrop{background:rgba(10,16,30,.55)}
.url{font-size:12px;color:var(--deep3);text-decoration:none}
.url:hover{text-decoration:underline}
.fee{font-size:12px;color:var(--sub);margin-top:8px}
@media(max-width:640px){.hideM{display:none}td,th{padding:7px 6px;font-size:12.5px}}`;
  if (!authed) return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>运动会总管理登录</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2314233b'/%3E%3Ctext x='32' y='44' font-size='32' text-anchor='middle'%3E%F0%9F%8F%86%3C/text%3E%3C/svg%3E"><style>${css}</style></head><body>
<nav><div class="nav-in"><div class="brand"><span class="ic">🏆</span><div><b>运动会总管理</b><span>多校版 · 调度中枢</span></div></div></div></nav>
<div class="login-box"><div class="card" style="text-align:center">
<span class="ic">🏆</span><h1>总管理登录</h1><p class="sub" style="margin:6px 0 14px">输入总管理密码进入调度中枢</p>
<input type="password" id="pw" placeholder="总管理密码" autofocus style="text-align:center">
<button class="p" id="go" style="width:100%;margin-top:12px">登 录</button>
<div class="msg" id="msg"></div></div></div>
<script>
var go=function(){
fetch("/sports/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pwd:document.getElementById("pw").value})})
.then(function(r){return r.json()}).then(function(d){
if(d.ok){location.reload()}else{var m=document.getElementById("msg");m.className="msg err";m.textContent=d.msg||"密码不对"}
}).catch(function(){var m=document.getElementById("msg");m.className="msg err";m.textContent="网络异常"});
};
document.getElementById("go").onclick=go;
document.getElementById("pw").addEventListener("keydown",function(e){if(e.key==="Enter")go()});
</script></body></html>`;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>运动会总管理 · 多校调度</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2314233b'/%3E%3Ctext x='32' y='44' font-size='32' text-anchor='middle'%3E%F0%9F%8F%86%3C/text%3E%3C/svg%3E"><style>${css}</style></head><body>
<nav><div class="nav-in"><div class="brand"><span class="ic">🏆</span><div><b>运动会总管理</b><span>多校版 · 调度中枢</span></div></div></div><a class="btn-out" href="/sports/" style="text-decoration:none">🏠 主页</a><button class="btn-out" id="out">🚪 退出登录</button></div></nav>
<div class="wrap">
<div class="card"><h1>🏫 各校运动会程序</h1><p class="sub">每校独立程序+独立数据库 · 互不影响 · 点学校地址直达</p>
<div style="overflow-x:auto;margin-top:12px"><table id="tb"><thead><tr><th>学校名称</th><th>访问地址</th><th>状态</th><th class="hideM">建立时间</th><th class="hideM">密码提示</th><th>操作</th></tr></thead><tbody id="tbBody"><tr><td colspan="6" style="color:#5B6577">加载中…</td></tr></tbody></table></div>
<div class="msg" id="msgL"></div></div>

<div class="card"><h2>➕ 新建一个学校的运动会程序</h2>
<div class="row">
<div class="field"><label>学校名称</label><input id="nName" placeholder="如：实验小学"></div>
<div class="field"><label>拼音前缀（小写字母，作网址用）</label><input id="nSlug" placeholder="如：shixiao"></div>
</div>
<div class="row">
<div class="field"><label>该校总管理员初始密码（至少6位）</label><input id="nPw" type="text" placeholder="建议好记的长密码"></div>
<div class="field"><label>密码提示（备忘，不存明文）</label><input id="nHint" placeholder="如：学校简称+年份"></div>
</div>
<button class="p" id="btnNew" style="margin-top:14px">🚀 一键开通</button>
<div class="msg" id="msgN"></div>
<p class="fee">开通自动完成：建独立数据库 → 部署独立程序 → 绑定网址 <b>tl.efcc.cc/sports/拼音</b> → 写入初始密码。全程约 15 秒。</p></div>

<div class="card"><h2>🔑 总后台自身密码</h2>
<div class="row">
<div class="field"><label>原密码</label><input id="oPw" type="password"></div>
<div class="field"><label>新密码（至少6位）</label><input id="nPw2" type="password"></div>
<button class="p" id="btnPw" style="margin-top:30px">修改</button>
</div><div class="msg" id="msgP"></div></div>
</div>

<dialog id="dlg"><h2 id="dlgTitle"></h2><p class="sub" id="dlgText"></p>
<div id="dlgForm"></div>
<div class="row" style="justify-content:flex-end;margin-top:16px">
<button class="g" onclick="document.getElementById('dlg').close()">取消</button>
<button class="p" id="dlgOk">确认</button></div></dialog>
<script>
var api=function(p,d){return fetch("/sports/api/"+p,{method:d?"POST":"GET",headers:d?{"Content-Type":"application/json"}:{},body:d?JSON.stringify(d):undefined}).then(function(r){return r.json()})};
document.getElementById("out").onclick=function(){api("logout",{}).then(function(){location.reload()})};
function toast(m,id,ok){var e=document.getElementById(id);e.className="msg "+(ok?"ok":"err");e.textContent=m}
function load(){api("list").then(function(d){
if(!d.ok){toast(d.msg||"读取失败","msgL",0);return}
var b=document.getElementById("tbBody");b.innerHTML="";
if(!d.schools.length){b.innerHTML='<tr><td colspan="6" style="color:#5B6577">还没有学校，用下面表单开通第一所</td></tr>';return}
d.schools.forEach(function(s){
var tr=document.createElement("tr");
var url=s.type==="proxy"?"/sports/"+s.slug:"https://tl.efcc.cc/sports/"+s.slug;
tr.innerHTML='<td><b>'+esc(s.name)+'</b>'+(s.note?'<div style="font-size:12px;color:#5B6577">'+esc(s.note)+'</div>':'')+'</td>'+
'<td><a class="url" target="_blank" href="'+url+'">/sports/'+s.slug+'</a>'+(s.type==="proxy"?'<div style="font-size:11px;color:#8A6914">过渡期·数据在主机房</div>':'')+'</td>'+
'<td>'+(s.status==="active"?'<span class="tag on">运行中</span>':'<span class="tag off">已停用</span>')+'</td>'+
'<td class="hideM">'+(s.createdAt||"")+'</td><td class="hideM">'+esc(s.pwdHint||"—")+'</td>'+
'<td style="white-space:nowrap">'+
'<button class="g" onclick="rp(\\''+s.slug+'\\',\\''+esc(s.name)+'\\')">改总密码</button>'+
'<button class="g" onclick="tg(\\''+s.slug+'\\','+(s.status==="active")+')">'+(s.status==="active"?"停用":"启用")+'</button>'+
'<button class="g" onclick="ed(\\''+s.slug+'\\')">编辑</button>'+
(s.type==="proxy"?"":'<button class="g" onclick="dl(\\''+s.slug+'\\')">删除</button>')+'</td>';
b.appendChild(tr)})})}
function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}
load();
document.getElementById("btnNew").onclick=function(){
var name=document.getElementById("nName").value.trim(),slug=document.getElementById("nSlug").value.trim(),pw=document.getElementById("nPw").value,hint=document.getElementById("nHint").value.trim();
if(!name||!slug||pw.length<6){toast("名称、拼音、至少6位的初始密码都要填","msgN",0);return}
toast("⏳ 正在开通（建库→部署→绑网址）…","msgN",1);
api("create",{name:name,slug:slug,pwd:pw,hint:hint}).then(function(d){
if(d.ok){toast("✅ 开通成功！地址：tl.efcc.cc/sports/"+slug,"msgN",1);document.getElementById("nName").value="";document.getElementById("nSlug").value="";document.getElementById("nPw").value="";document.getElementById("nHint").value="";load()}
else toast(d.msg||"开通失败","msgN",0)}).catch(function(){toast("网络异常","msgN",0)})};
document.getElementById("btnPw").onclick=function(){api("change-pw",{old:document.getElementById("oPw").value,"new":document.getElementById("nPw2").value}).then(function(d){
if(d.ok){toast("✅ 已改，请重新登录","msgP",1);setTimeout(function(){location.reload()},1200)}
else toast(d.msg||"失败","msgP",0)})};
function rp(slug,name){var np=prompt("给「"+name+"」设新的总管理员密码（至少6位）：");
if(!np)return;if(np.length<6){alert("至少6位");return}
api("reset-pwd",{slug:slug,pwd:np}).then(function(d){alert(d.ok?"✅ 已改，该校旧密码即刻失效":"❌ "+(d.msg||"失败"))})}
function tg(slug,nowActive){if(!confirm(nowActive?"停用后该学校所有页面将无法访问（数据保留），确定？":"启用该学校程序？"))return;
api("update",{slug:slug,status:nowActive?"paused":"active"}).then(function(d){if(d.ok)load();else alert(d.msg||"失败")})}
function ed(slug){var d=document.getElementById("dlg");var cur=window.__S&&window.__S[slug]||{};
document.getElementById("dlgTitle").textContent="编辑信息";document.getElementById("dlgText").textContent="留空的项保持不变";
document.getElementById("dlgForm").innerHTML='<label>学校名称</label><input id="eName"><label>密码提示（备忘）</label><input id="eHint"><label>备注</label><input id="eNote">';
d.showModal();
document.getElementById("dlgOk").onclick=function(){
var body={slug:slug};if(document.getElementById("eName").value.trim())body.name=document.getElementById("eName").value.trim();
if(document.getElementById("eHint").value.trim())body.hint=document.getElementById("eHint").value.trim();
if(document.getElementById("eNote").value.trim())body.note=document.getElementById("eNote").value.trim();
api("update",body).then(function(r){d.close();if(r.ok)load();else alert(r.msg||"失败")})}}
function dl(slug){var c=prompt("删除将同时删除该学校的程序与数据库！\\n输入学校拼音「"+slug+"」确认：");
if(c!==slug)return;
api("del",{slug:slug,confirm:c}).then(function(d){if(d.ok)load();else alert(d.msg||"失败")})}
</script></body></html>`;
}

function html(body, status) {
  return new Response(body, { status: status || 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
function notePage(title, text) {
  return html(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="background:#14213D;font-family:system-ui,sans-serif"><div style="color:#E8BC4F;text-align:center;padding:38vh 20px 0;font-size:19px">${text}</div><div style="text-align:center;margin-top:18px"><a href="/sports" style="color:#8FA3C8;font-size:14px;text-decoration:none">← 返回运动会总管理</a></div></body></html>`);
}

async function doCreate(env, body) {
        const { name, slug, pwd, hint } = body || {};
  if (["admin", "api", "sports", "www", "reg", "login", "root", "home"].includes(slug)) return j({ ok: false, msg: "该拼音后缀是系统保留字，请换一个" });
        if (!name || !slug || !pwd) return j({ ok: false, msg: "信息不全" });
        if (!/^[a-z][a-z0-9-]{0,19}$/.test(slug)) return j({ ok: false, msg: "拼音前缀只能用小写字母/数字/短横线，2-20位" });
        if (pwd.length < 6) return j({ ok: false, msg: "初始密码至少 6 位" });
        const rs = await routes(env);
        if (rs.some((r) => r.slug === slug)) return j({ ok: false, msg: "这个拼音前缀已被使用" });
        const wName = "sports-app-" + slug;
        let routeId0 = null;
        // 1 建独立 KV
        let r = await (await cf("POST", `/accounts/${CF_ACC}/storage/kv/namespaces`, { title: "sports-" + slug })).json();
        const em = r.errors && r.errors[0] && r.errors[0].message || "";
        if (!r.success) return j({ ok: false, msg: em.includes("already exists") ? "拼音前缀「" + slug + "」已被占用（或上次残留同名库），换个前缀或先删除旧校" : "建库失败：" + em });
        const kvId = r.result.id;
        try {
          // 2 部署独立 Worker（代码=模板，KV 绑定 TL_CONFIG → 新库）
          const tpl = await env.GW_KV.get("SCHOOL_TPL");
          if (!tpl) throw new Error("模板缺失，请联系技术员重新写入 SCHOOL_TPL");
          const meta = { main_module: "worker.js", compatibility_date: "2024-09-23", bindings: [{ type: "kv_namespace", name: "TL_CONFIG", namespace_id: kvId }] };
          r = await (await cf("PUT", `/accounts/${CF_ACC}/workers/scripts/${wName}`, { meta, code: tpl }, "form")).json();
          if (!r.success) throw new Error("部署程序失败：" + (r.errors && r.errors[0] && r.errors[0].message));
          // 3 secrets
          if (env0.GH_TV_TOKEN) await cf("PUT", `/accounts/${CF_ACC}/workers/scripts/${wName}/secrets`, { name: "GH_TV_TOKEN", text: env0.GH_TV_TOKEN });
          if (env0.RESEND_API_KEY) await cf("PUT", `/accounts/${CF_ACC}/workers/scripts/${wName}/secrets`, { name: "RESEND_API_KEY", text: env0.RESEND_API_KEY });
          // 4 绑网址
          r = await (await cf("POST", `/zones/${env.ZONE_ID}/workers/routes`, { pattern: "tl.efcc.cc/sports/" + slug + "*", script: wName })).json();
          if (!r.success) throw new Error("绑网址失败：" + (r.errors && r.errors[0] && r.errors[0].message));
          const routeId = r.result.id; routeId0 = routeId;
          // 5 初始总密码写入该校 KV
          const pwHash = await sha256Hex(pwd);
          const pr = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/storage/kv/namespaces/${kvId}/values/pw_hash_sports`, { method: "PUT", headers: { "Authorization": "Bearer " + env0.CF_API_TOKEN }, body: pwHash });
          if (!pr.ok) throw new Error("写初始密码失败");
          // 6 报到登记
          rs.push({ slug, name, type: "worker", worker: wName, kvId, routeId, status: "active", createdAt: new Date().toISOString().slice(0, 10), pwdHint: hint || "", note: "" });
          await saveRoutes(env, rs);
          return j({ ok: true, msg: "已开通 tl.efcc.cc/sports/" + slug });
        } catch (e) {
          try { if (routeId0) await cf("DELETE", `/zones/${env.ZONE_ID}/workers/routes/${routeId0}`); } catch (e2) {}
          try { await cf("DELETE", `/accounts/${CF_ACC}/workers/scripts/${wName}`); } catch (e2) {}
          try { await cf("DELETE", `/accounts/${CF_ACC}/storage/kv/namespaces/${kvId}`); } catch (e2) {}
          return j({ ok: false, msg: "开通失败已回滚：" + (e.message || e) });
        }
      }
function landingPage() {
  const css = `
:root{--deep:#14213D;--deep2:#1D2D50;--gold:#E8BC4F;--bg:#F4F6FA;--card:#fff;--sub:#5B6577;--ok:#2E9E5B;--err:#D64545;--line:#DFE4EC}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:#22303F;min-height:100vh}
nav{background:var(--deep);color:#fff}
.nav-in{max-width:960px;margin:0 auto;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.brand{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700}
.brand .ic{font-size:22px}
.brand small{font-size:12px;opacity:.72;font-weight:400}
.btn-adm{background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);border:1.5px solid rgba(255,255,255,.5);border-radius:9px;font-size:13px;padding:6px 13px;cursor:pointer;text-decoration:none;font-weight:600;white-space:nowrap}
.wrap{max-width:960px;margin:0 auto;padding:24px 16px 30px}
.hero{text-align:center;margin-bottom:22px}
.hero h1{font-size:25px;color:var(--deep)}
.hero h1 em{color:var(--gold);font-style:normal}
.hero p{color:var(--sub);font-size:13.5px;margin-top:8px}
.feat{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:12px}
.feat span{font-size:12px;color:#1D2D50;background:rgba(232,188,79,.16);border:1px solid rgba(232,188,79,.45);border-radius:999px;padding:4px 12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:760px){.grid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px;box-shadow:0 2px 10px rgba(20,33,61,.04)}
.card h2{font-size:17px;color:var(--deep);display:flex;align-items:center;gap:8px}
.card .sub{font-size:12.5px;color:var(--sub);margin:4px 0 16px}
.field{margin-bottom:12px}
.field label{display:block;font-size:12.5px;color:var(--sub);margin-bottom:5px}
.field input,.field select{width:100%;padding:10px 12px;border:1.5px solid var(--line);border-radius:9px;font-size:14px;font-family:inherit;background:#fff;color:#22303F}
.field input:focus,.field select:focus{outline:none;border-color:var(--gold)}
.p{width:100%;background:var(--deep);color:var(--gold);border:none;border-radius:10px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
.p:hover{background:var(--deep2)}
.p.gold{background:var(--gold);color:var(--deep)}
.msg{font-size:13px;margin-top:10px;min-height:18px}
.msg.ok{color:var(--ok)}.msg.err{color:var(--err)}
.tea{font-size:12.5px;color:var(--sub);margin-top:12px;text-align:center}
.tea a{color:var(--deep);font-weight:600}
.foot{max-width:960px;margin:0 auto;padding:6px 16px 44px;text-align:center;font-size:13px;color:var(--sub)}
.foot a{color:var(--deep);text-decoration:none;font-weight:700}
.foot a:hover{color:var(--gold)}
`;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>运动会管理系统 · 多校版</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2314233b'/%3E%3Ctext x='32' y='44' font-size='32' text-anchor='middle'%3E🏃%3C/text%3E%3C/svg%3E"><style>${css}</style></head><body>
<nav><div class="nav-in">
  <div class="brand"><span class="ic">🏃</span><div>运动会管理系统 <small>多校版</small></div></div>
  <a class="btn-adm" href="/sports/admin">⚙️ 后台管理</a>
</div></nav>
<div class="wrap">
  <div class="hero">
    <h1>🏃 学校运动会 <em>一站式管理</em></h1>
    <p>报名、计分、汇总全自动 —— 每校独立程序、独立数据，互不影响</p>
    <div class="feat"><span>📝 班主任报名</span><span>✏️ 成绩录入</span><span>📊 实时积分榜</span><span>📦 学年归档复用</span></div>
  </div>
  <div class="grid">
    <div class="card">
      <h2>🔑 进入本校系统</h2>
      <p class="sub">选择学校 + 总管理员密码，直达您学校的运动会工作台</p>
      <form id="fL" method="POST" action="/soft/__auth">
        <div class="field"><label>选择学校</label><select id="sch"><option value="">加载中…</option></select></div>
        <div class="field"><label>总管理员密码</label><input type="password" name="password" placeholder="本校总管理员密码" required></div>
        <input type="hidden" name="rt" value="admin">
        <input type="hidden" name="next" value="/apps/sports/home.html">
        <button class="p" type="submit" id="go">进 入 →</button>
      </form>
      <div class="tea">班主任 / 成绩录入员：<a id="tea" href="/sports/">到学校登录页选身份</a></div>
      <div class="msg" id="msgL"></div>
    </div>
    <div class="card">
      <h2>🏫 开通新学校</h2>
      <p class="sub">填好信息即刻生成贵校专属系统（网址：tl.efcc.cc/sports/贵校拼音）</p>
      <div class="field"><label>学校名称</label><input id="rName" placeholder="如：实验小学"></div>
      <div class="field"><label>拼音后缀（小写字母，作网址用）</label><input id="rSlug" placeholder="如 shixiao → /sports/shixiao"></div>
      <div class="field"><label>本校总管理员密码（至少6位）</label><input id="rPw" type="password" placeholder="建议好记的长密码"></div>
      <div class="field"><label>密码提示（备忘，不存明文）</label><input id="rHint" placeholder="如：校名简称+年份"></div>
      <div class="field"><label>注册口令（防滥用，向站长索取）</label><input id="rCode" placeholder="凭口令开通"></div>
      <button class="p gold" id="btnReg" type="button">🚀 立即开通</button>
      <div class="msg" id="msgR"></div>
    </div>
  </div>
</div>
<div class="foot">← <a href="/">返回欢乐工具站</a> ｜ 运动会管理系统 · 欢乐出品</div>
<script>
var schSel=document.getElementById("sch");
function esc(x){return String(x).replace(/</g,"&lt;")}
function syncA(){var v=schSel.value;if(v){document.getElementById("fL").action="/sports/"+v+"/soft/__auth";document.getElementById("tea").href="/sports/"+v+"/"}}
fetch("/sports/api/schools").then(function(r){return r.json()}).then(function(d){
if(!d.ok||!d.schools.length){schSel.innerHTML='<option value="">暂无学校 · 请先在旁边开通</option>';document.getElementById("go").disabled=true;return}
schSel.innerHTML=d.schools.map(function(x){return '<option value="'+esc(x.slug)+'">'+esc(x.name)+"</option>"}).join("");
syncA();
}).catch(function(){schSel.innerHTML='<option value="">学校列表加载失败，刷新重试</option>'});
schSel.onchange=syncA;
document.getElementById("btnReg").onclick=function(){
var name=document.getElementById("rName").value.trim();
var slug=document.getElementById("rSlug").value.trim().toLowerCase();
var pw=document.getElementById("rPw").value;
var hint=document.getElementById("rHint").value.trim();
var code=document.getElementById("rCode").value.trim();
var m=document.getElementById("msgR");
if(!name||!slug||!pw||!code){m.className="msg err";m.textContent="请把学校名称、拼音后缀、密码、注册口令都填上";return}
m.className="msg";m.textContent="开通中，约需十几秒…";
fetch("/sports/api/reg",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name,slug:slug,pwd:pw,hint:hint,code:code})})
.then(function(r){return r.json()}).then(function(d){
if(d.ok){m.className="msg ok";m.textContent="✅ 已开通！地址 /sports/"+esc(slug)+"，正在带您前往…";setTimeout(function(){location.href="/sports/"+slug},1700)}
else{m.className="msg err";m.textContent=d.msg||"开通失败"}
}).catch(function(){m.className="msg err";m.textContent="网络异常，请重试"});
};
</script></body></html>`;
}

var worker_default = {
  async fetch(request, env) {
    env0 = env;
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/sports/admin" || pathname === "/sports/admin/") {
      const authed = await isAuthed(request, env);
      return html(adminPage(authed));
    }
    if (pathname === "/sports" || pathname === "/sports/") return html(landingPage());
    if (pathname.startsWith("/sports/api/")) {
      const ep = pathname.slice("/sports/api/".length);
      if (request.method === "POST" && ep === "login") {
        const { pwd } = await request.json().catch(() => ({}));
        const ph = await env.GW_KV.get("pw_hash_gw");
        if (!ph || !pwd || await sha256Hex(pwd) !== ph) return j({ ok: false, msg: "密码不对" }, 401);
        const tok = await sha256Hex(ph + "-gw-session");
        return j({ ok: true }, 200, "gw_auth=" + tok + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800");
      }
      if (ep === "schools" && request.method === "GET") {
        const rs = await routes(env);
        return j({ ok: true, schools: rs.filter((r) => r.status === "active").map((r) => ({ slug: r.slug, name: r.name })) });
      }
      if (ep === "reg" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const want = await env.GW_KV.get("reg_code");
        if (!want || !body.code || body.code !== want) return j({ ok: false, msg: "注册口令不对（开通请向站长索取口令）" }, 403);
        return doCreate(env, body);
      }
      if (!await isAuthed(request, env)) return j({ ok: false, msg: "未登录" }, 401);
      if (ep === "logout") return j({ ok: true }, 200, "gw_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
      if (ep === "set-reg-code" && request.method === "POST") {
        const { code } = await request.json().catch(() => ({}));
        if (!code || String(code).length < 4) return j({ ok: false, msg: "注册口令至少 4 位" });
        await env.GW_KV.put("reg_code", String(code).slice(0, 60));
        return j({ ok: true });
      }
      if (ep === "list") {
        const rs = await routes(env);
        return j({ ok: true, schools: rs.map((r) => ({ slug: r.slug, name: r.name, type: r.type, status: r.status, createdAt: r.createdAt, pwdHint: r.pwdHint || "", note: r.note || "" })) });
      }
      if (ep === "change-pw" && request.method === "POST") {
        const { old: oldPw, "new": newPw } = await request.json().catch(() => ({}));
        const ph = await env.GW_KV.get("pw_hash_gw");
        if (!ph || !oldPw || await sha256Hex(oldPw) !== ph) return j({ ok: false, msg: "原密码不对" });
        if (!newPw || newPw.length < 6) return j({ ok: false, msg: "新密码至少 6 位" });
        await env.GW_KV.put("pw_hash_gw", await sha256Hex(newPw));
        return j({ ok: true }, 200, "gw_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
      }
            if (ep === "create" && request.method === "POST") return doCreate(env, await request.json().catch(() => ({})));
      if (ep === "reset-pwd" && request.method === "POST") {
        const { slug, pwd } = await request.json().catch(() => ({}));
        if (!pwd || pwd.length < 6) return j({ ok: false, msg: "新密码至少 6 位" });
        const rs = await routes(env);
        const s = rs.find((r) => r.slug === slug);
        if (!s) return j({ ok: false, msg: "学校不存在" });
        if (s.type === "proxy") {
          const ph = await env.GW_KV.get("pw_hash_sports_main");
          if (ph) return j({ ok: false, msg: "过渡期学校请到原系统改密（后台-账号管理）" });
          return j({ ok: false, msg: "该校暂不支持远程改密" });
        }
        const pr = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/storage/kv/namespaces/${s.kvId}/values/pw_hash_sports`, { method: "PUT", headers: { "Authorization": "Bearer " + env0.CF_API_TOKEN }, body: await sha256Hex(pwd) });
        return pr.ok ? j({ ok: true }) : j({ ok: false, msg: "写入失败" });
      }
      if (ep === "update" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const rs = await routes(env);
        const s = rs.find((r) => r.slug === body.slug);
        if (!s) return j({ ok: false, msg: "学校不存在" });
        if (body.name) s.name = String(body.name).slice(0, 50);
        if (body.hint !== undefined) s.pwdHint = String(body.hint).slice(0, 100);
        if (body.note !== undefined) s.note = String(body.note).slice(0, 200);
        if (body.status === "paused" && s.status === "active") {
          if (s.type === "worker" && s.routeId) { const r = await (await cf("DELETE", `/zones/${env.ZONE_ID}/workers/routes/${s.routeId}`)).json(); const notFound0 = !r.success && r.errors && r.errors[0] && (r.errors[0].code === 10007 || String(r.errors[0].message || "").includes("does not exist")); if (!r.success && !notFound0) return j({ ok: false, msg: "停用失败" }); }
          s.status = "paused";
        } else if (body.status === "active" && s.status === "paused") {
          if (s.type === "worker") {
            const pat0 = "tl.efcc.cc/sports/" + s.slug + "*";
            let r = await (await cf("POST", `/zones/${env.ZONE_ID}/workers/routes`, { pattern: pat0, script: s.worker })).json();
            if (!r.success) {
              const lr = await (await cf("GET", `/zones/${env.ZONE_ID}/workers/routes`)).json();
              if (lr.success) { const ex0 = (lr.result || []).find((x) => x.pattern === pat0); if (ex0) { r = { success: true, result: ex0 }; } }
            }
            if (!r.success) return j({ ok: false, msg: "启用失败" });
            s.routeId = r.result.id;
          }
          s.status = "active";
        }
        await saveRoutes(env, rs);
        return j({ ok: true });
      }
      if (ep === "del" && request.method === "POST") {
        const { slug, confirm } = await request.json().catch(() => ({}));
        const rs = await routes(env);
        const s = rs.find((r) => r.slug === slug);
        if (!s) return j({ ok: false, msg: "学校不存在" });
        if (confirm !== slug) return j({ ok: false, msg: "确认码不对" });
        if (s.type === "proxy") return j({ ok: false, msg: "过渡期学校不支持删除" });
        let errs = [];
        if (s.routeId) { const r = await (await cf("DELETE", `/zones/${env.ZONE_ID}/workers/routes/${s.routeId}`)).json(); if (!r.success) errs.push("删网址"); }
        const r1 = await (await cf("DELETE", `/accounts/${CF_ACC}/workers/scripts/${s.worker}`)).json(); if (!r1.success) errs.push("删程序");
        const r2 = await (await cf("DELETE", `/accounts/${CF_ACC}/storage/kv/namespaces/${s.kvId}`)).json(); if (!r2.success) errs.push("删数据库");
        await saveRoutes(env, rs.filter((r) => r.slug !== slug));
        return errs.length ? j({ ok: false, msg: "部分资源删除失败：" + errs.join("/") + "，请稍后重试" }) : j({ ok: true });
      }
      return j({ ok: false, msg: "未知接口" }, 404);
    }
    // ===== /sports/<slug>/* 分诊 =====
    const m = pathname.match(/^\/sports\/([a-z0-9][a-z0-9-]{0,30})(\/.*)?$/);
    if (!m) return notePage("未找到", "🔍 这个地址不属于任何学校");
    const slug = m[1], rest = m[2] || "/";
    const rs = await routes(env);
    const s = rs.find((r) => r.slug === slug);
    if (!s) return notePage("学校未注册", "🏫「/" + slug + "」还没有登记<br><span style='font-size:13px;opacity:.7'>请到 <b>/sports</b> 总管理后台开通</span>", 200);
    if (s.status === "paused") return notePage("已停用", "⏸「" + s.name + "」的程序已停用<br><span style='font-size:13px;opacity:.7'>数据完整保留，启用请联系总管理</span>");
    if (s.type === "proxy") {
      let target;
      if (rest === "/" || rest === "") target = "/apps/sports/home.html";
      else if (rest.startsWith("/soft/")) target = rest;
      else target = "/apps/sports/" + rest.replace(/^\//, "");
      const u2 = new URL(target, url.origin);
      const req2 = new Request(u2.toString(), request);
      const resp = await env.TL.fetch(req2);
      const ct = resp.headers.get("Content-Type") || "";
      if (ct.includes("text/html")) {
        let t = await resp.text();
        t = t.replaceAll('"/soft/', '"/sports/' + slug + '/soft/').replaceAll('"/apps/sports/', '"/sports/' + slug + '/apps/sports/');
        const h = new Headers(resp.headers); h.set("Cache-Control", "no-store");
        return new Response(t, { status: resp.status, headers: h });
      }
      return resp;
    }
    return notePage("直达中", "⚙️ 正在前往「" + s.name + "」<br><span style='font-size:13px;opacity:.7'>正常应直接访问，若停留此页说明路由未生效</span>");
  }
};
export { worker_default as default };