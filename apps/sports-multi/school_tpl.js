var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var UPSTREAMS = [
  /* 【2026-11-14 IP工具日】主货源升级：api contents 通道（带令牌，今晚实测最稳）
     保险绳：tl raw → 33 仓 raw → cnb 镜像 */
  "https://api.github.com/repos/zhufenghua313/tl/contents/",
  "https://raw.githubusercontent.com/zhufenghua313/tl/main/",
  "https://raw.githubusercontent.com/zhufenghua313/33/main/"
  /* 【2026-11-15 01:00 cnb 镜像已踢除：其内容是分家前旧版（带 tv.efcc.cc 旧字样）——
     回退到它=给用户看错版页面，宁可 502 让用户重试。站长实测抓到现行 */
];
var DEFAULT_EVENTS = [
  { name: "60\u7C73", type: "\u5F84\u8D5B", grades: "all" },
  { name: "200\u7C73", type: "\u5F84\u8D5B", grades: "all" },
  { name: "400\u7C73", type: "\u5F84\u8D5B", grades: "3-5" },
  { name: "4\xD7100\u7C73\u6DF7\u5408\u63A5\u529B", type: "\u5F84\u8D5B", grades: "3-5", team: true },
  { name: "\u8DF3\u9AD8", type: "\u7530\u8D5B", grades: "all" },
  { name: "\u8DF3\u8FDC", type: "\u7530\u8D5B", grades: "all" },
  { name: "\u94C5\u7403", type: "\u7530\u8D5B", grades: "3-5" }
];
var enc = new TextEncoder();
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hmacHex, "hmacHex");
function davSeg(dir) {
  return String(dir || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
}
__name(davSeg, "davSeg");
async function davCreds(env) {
  try {
    return JSON.parse(await TVKV.get("share_webdav_creds") || "null");
  } catch (e) {
    return null;
  }
}
__name(davCreds, "davCreds");
async function davPropfind(env, dir) {
  const creds = await davCreds(env);
  if (!creds || !creds.account || !creds.password) return { err: "\u540E\u53F0\u672A\u914D\u7F6E 123 \u7F51\u76D8\u51ED\u636E" };
  const auth = btoa(creds.account + ":" + creds.password);
  const r = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(dir), { method: "PROPFIND", headers: { "Authorization": "Basic " + auth, "Depth": "1" } });
  if (r.status !== 207) return { err: "123 \u7F51\u76D8\u8FDE\u63A5\u5931\u8D25\uFF08" + r.status + "\uFF09" };
  const xml = await r.text();
  const entries = [];
  for (const b of xml.split("<D:response>").slice(1)) {
    const nm = (b.match(/<D:displayname>([^<]*)<\/D:displayname>/) || [])[1] || "";
    const sz = parseInt((b.match(/<D:getcontentlength>(\d+)<\/D:getcontentlength>/) || [])[1] || "0", 10);
    const isDir = b.indexOf("<D:collection") >= 0;
    const mt = Date.parse((b.match(/<D:getlastmodified>([^<]+)<\/D:getlastmodified>/) || [])[1] || "") || 0;
    if (nm) entries.push({ name: decodeURIComponent(nm), size: sz, isDir, mt, auth });
  }
  return { entries, auth };
}
__name(davPropfind, "davPropfind");
async function davCopyAny(auth, from, dest) {
  const H = { "Authorization": "Basic " + auth };
  const isDir = await (async () => {
    const r2 = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(from), { method: "PROPFIND", headers: { ...H, "Depth": "0" } });
    if (r2.status !== 207) return false;
    const t = await r2.text();
    return t.indexOf("<D:collection") >= 0 || t.indexOf("<collection") >= 0;
  })();
  if (!isDir) {
    const g = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(from), { headers: H });
    if (!g.ok && g.status !== 302) return "\u8BFB\u53D6\u6E90\u6587\u4EF6\u5931\u8D25\uFF08" + g.status + "\uFF09";
    const p = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(dest), { method: "PUT", headers: H, body: g.body });
    if (p.status !== 201 && p.status !== 204 && p.status !== 200) return "\u5199\u5165\u76EE\u6807\u5931\u8D25\uFF08" + p.status + "\uFF09";
    return null;
  }
  const mk = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(dest) + "/", { method: "MKCOL", headers: H });
  if (mk.status !== 201 && mk.status !== 405 && mk.status !== 200) return "\u5EFA\u76EE\u5F55\u5931\u8D25\uFF08" + mk.status + "\uFF09";
  const r = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(from) + "/", { method: "PROPFIND", headers: { ...H, "Depth": "1" } });
  if (r.status !== 207) return "\u5217\u76EE\u5F55\u5931\u8D25\uFF08" + r.status + "\uFF09";
  const xml = await r.text();
  const selfName = from.split("/").pop();
  for (const b of xml.split("<D:response>").slice(1)) {
    const nm = (b.match(/<D:displayname>([^<]*)<\/D:displayname>/) || [])[1] || "";
    if (!nm || nm === selfName) continue;
    const sub = decodeURIComponent(nm);
    const isSubDir = b.indexOf("<D:collection") >= 0;
    const err = await davCopyAny(auth, from + "/" + sub, dest + "/" + sub);
    if (err) return err;
  }
  return null;
}
__name(davCopyAny, "davCopyAny");
async function davList(env) {
  const root = await davPropfind(env, "");
  if (root.err) return { err: root.err, files: [], auth: null };
  const files = [];
  for (const e of root.entries) {
    if (!e.isDir) files.push({ name: e.name, size: e.size, path: "", mt: e.mt });
    else if (/^20\d{2}$/.test(e.name)) {
      const yr = await davPropfind(env, e.name);
      if (yr.err) continue;
      for (const m of yr.entries) {
        if (!m.isDir) files.push({ name: m.name, size: m.size, path: e.name, mt: m.mt });
        else if (/^\d{2}$/.test(m.name) && parseInt(m.name, 10) >= 1 && parseInt(m.name, 10) <= 12) {
          const mf = await davPropfind(env, e.name + "/" + m.name);
          if (mf.err) continue;
          for (const f of mf.entries) if (!f.isDir) files.push({ name: f.name, size: f.size, path: e.name + "/" + m.name, mt: f.mt });
          else if (f.isDir && f.name.indexOf(".") !== 0) {
            const bf = await davPropfind(env, e.name + "/" + m.name + "/" + f.name);
            if (bf.err) continue;
            for (const b of bf.entries) if (!b.isDir) files.push({ name: b.name, size: b.size, path: e.name + "/" + m.name + "/" + f.name, mt: b.mt });
          }
        }
      }
    }
  }
  files.sort((a, b) => (b.mt || 0) - (a.mt || 0));
  return { err: null, files, auth: root.auth };
}
__name(davList, "davList");
async function davEnsureMonth(env) {
  const now = new Date(Date.now() + 8 * 3600 * 1e3);
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const creds = await davCreds(env);
  if (!creds) return { err: "\u540E\u53F0\u672A\u914D\u7F6E" };
  const auth = btoa(creds.account + ":" + creds.password);
  for (const d of [year, year + "/" + month]) {
    const r = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(d), { method: "MKCOL", headers: { "Authorization": "Basic " + auth } });
    if (r.status !== 201 && r.status !== 405 && r.status !== 200 && r.status !== 301) return { err: "\u5EFA\u6708\u76EE\u5F55\u5931\u8D25\uFF08" + r.status + "\uFF09" };
  }
  return { err: null, dir: year + "/" + month, auth };
}
__name(davEnsureMonth, "davEnsureMonth");
var COOKIE_OF = { station: "station_auth", platform: "platform_auth", sports: "sports_auth" };
var DOOR_NAME = { station: "\u5DE5\u5177\u7AD9\u540E\u53F0", platform: "\u7A0B\u5E8F\u5236\u4F5C\u5E73\u53F0", sports: "\u8FD0\u52A8\u4F1A\u7BA1\u7406\u5458" };
function doorOfPath(p) {
  if (p.indexOf("station-admin") >= 0) return "station";
  if (p.indexOf("platform") >= 0) return "platform";
  return "sports";
}
__name(doorOfPath, "doorOfPath");
async function getPwHash(env, door) {
  let h = await TVKV.get("pw_hash_" + door);
  if (!h) h = await TVKV.get("pw_hash");
  if (!h) {
    h = await sha256Hex(env.SPORTS_PASSWORD || "huanle-yundonghui-2026");
    await TVKV.put("pw_hash", h);
  }
  return h;
}
__name(getPwHash, "getPwHash");
async function tokenOf(env, door) {
  const dom = door === "sports" ? "sports-auth-v1" : "auth:" + door + "-v1";
  return hmacHex(await getPwHash(env, door), dom);
}
__name(tokenOf, "tokenOf");
function randomToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(randomToken, "randomToken");
function forgotPage(msg, door) {
  door = door === "station" || door === "sports" ? door : "platform";
  const backLink = door === "station" ? "/apps/station-admin/index.html" : door === "platform" ? "/apps/platform/index.html" : "/apps/sports/index.html";
  return withPrefix(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>\u6B22\u4E50\u5DE5\u5177\u7AD9 \xB7 \u627E\u56DE\u5BC6\u7801</title><style>
:root{--deep:#14213D;--gold:#D9A521;--goldL:#E8BC4F;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:"Microsoft YaHei",sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:linear-gradient(160deg,#14213D 0%,#1B2A4A 55%,#2A4370 100%);}
.box{background:rgba(255,255,255,.06);border:1px solid rgba(217,165,33,.35);border-radius:16px;
padding:38px 34px;width:min(92vw,380px);backdrop-filter:blur(8px);text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.4);}
h1{color:#fff;font-size:21px;margin-bottom:6px;}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--goldL);margin-right:8px;animation:br 2s infinite;}
@keyframes br{50%{opacity:.25;}}
p{color:rgba(255,255,255,.55);font-size:13px;margin-bottom:20px;line-height:1.7;}
input{width:100%;padding:13px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.2);
background:rgba(255,255,255,.08);color:#fff;font-size:15px;margin-bottom:14px;outline:none;text-align:center;}
button{width:100%;padding:13px;border:none;border-radius:10px;font-size:15px;font-weight:bold;cursor:pointer;
background:linear-gradient(135deg,var(--gold),var(--goldL));color:#14213D;}
.msg{font-size:13.5px;margin-bottom:14px;border-radius:8px;padding:10px;}
.msg.ok{color:#7FE0A8;background:rgba(46,125,79,.15);}
.msg.err{color:#E88;background:rgba(176,58,46,.15);}
a{color:var(--goldL);font-size:12.5px;text-decoration:none;display:inline-block;margin-top:16px;opacity:.8;}
</style></head><body><a href="/share/admin.html" style="position:fixed;top:12px;right:14px;font-size:14px;color:rgba(255,255,255,.55);text-decoration:none;border:1px solid rgba(255,255,255,.2);padding:7px 14px;border-radius:99px;background:rgba(255,255,255,.07)">\u2699\uFE0F \u540E\u53F0\u7BA1\u7406</a><div class="box">
<h1><span class="dot"></span>\u627E\u56DE\u5BC6\u7801</h1>
<p>\u8F93\u5165\u60A8\u6CE8\u518C\u7684\u90AE\u7BB1<br>\u8FD9\u6B21\u91CD\u7F6E\u7684\u662F <b style="color:#E8BC4F">${DOOR_NAME[door]}</b> \u7684\u8FDB\u5165\u5BC6\u7801</p>
${msg ? `<div class="msg ${msg.ok ? "ok" : "err"}">${msg.text}</div>` : ""}
<form method="POST" action="/soft/__auth/forgot">
<input type="hidden" name="door" value="${door}">
<input type="email" name="email" placeholder="\u60A8\u7684\u90AE\u7BB1" required autofocus>
<button type="submit">\u53D1\u9001\u627E\u56DE\u90AE\u4EF6</button></form>
<a href="${backLink}">\u2190 \u8FD4\u56DE\u767B\u5F55</a>
</div></body></html>`);
}
__name(forgotPage, "forgotPage");
function resetPage(token, msg, door) {
  door = door === "station" || door === "sports" ? door : "platform";
  const backLink = door === "station" ? "/apps/station-admin/index.html" : door === "platform" ? "/apps/platform/index.html" : "/apps/sports/index.html";
  return withPrefix(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>\u6B22\u4E50\u5DE5\u5177\u7AD9 \xB7 \u8BBE\u7F6E\u65B0\u5BC6\u7801</title><style>
:root{--deep:#14213D;--gold:#D9A521;--goldL:#E8BC4F;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:"Microsoft YaHei",sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:linear-gradient(160deg,#14213D 0%,#1B2A4A 55%,#2A4370 100%);}
.box{background:rgba(255,255,255,.06);border:1px solid rgba(217,165,33,.35);border-radius:16px;
padding:38px 34px;width:min(92vw,380px);backdrop-filter:blur(8px);text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.4);}
h1{color:#fff;font-size:21px;margin-bottom:6px;}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--goldL);margin-right:8px;animation:br 2s infinite;}
@keyframes br{50%{opacity:.25;}}
p{color:rgba(255,255,255,.55);font-size:13px;margin-bottom:20px;}
input{width:100%;padding:13px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.2);
background:rgba(255,255,255,.08);color:#fff;font-size:15px;margin-bottom:14px;outline:none;text-align:center;}
button{width:100%;padding:13px;border:none;border-radius:10px;font-size:15px;font-weight:bold;cursor:pointer;
background:linear-gradient(135deg,var(--gold),var(--goldL));color:#14213D;}
.msg{font-size:13.5px;margin-bottom:14px;border-radius:8px;padding:10px;}
.msg.ok{color:#7FE0A8;background:rgba(46,125,79,.15);}
.msg.err{color:#E88;background:rgba(176,58,46,.15);}
a{color:var(--goldL);font-size:12.5px;text-decoration:none;display:inline-block;margin-top:16px;opacity:.8;}
</style></head><body><a href="/share/admin.html" style="position:fixed;top:12px;right:14px;font-size:14px;color:rgba(255,255,255,.55);text-decoration:none;border:1px solid rgba(255,255,255,.2);padding:7px 14px;border-radius:99px;background:rgba(255,255,255,.07)">\u2699\uFE0F \u540E\u53F0\u7BA1\u7406</a><div class="box">
<h1><span class="dot"></span>\u8BBE\u7F6E\u65B0\u5BC6\u7801</h1>
<p>\u6765\u81EA\u90AE\u4EF6\u7684\u91CD\u7F6E\u94FE\u63A5 \xB7 15\u5206\u949F\u5185\u6709\u6548<br>\u8FD9\u628A\u65B0\u94A5\u5319\u5F00\u7684\u662F <b style="color:#E8BC4F">${DOOR_NAME[door]}</b> \u7684\u95E8</p>
${msg ? `<div class="msg ${msg.ok ? "ok" : "err"}">${msg.text}</div>` : ""}
<form method="POST" action="/soft/__auth/reset">
<input type="hidden" name="token" value="${token.replace(/"/g, "&quot;")}">
<input type="password" name="newpw" placeholder="\u65B0\u5BC6\u7801\uFF08\u5EFA\u8BAE6\u4F4D\u4EE5\u4E0A\uFF09" required>
<button type="submit">\u4FDD\u5B58\u65B0\u5BC6\u7801</button></form>
<a href="${backLink}">\u2190 \u8FD4\u56DE\u767B\u5F55</a>
</div></body></html>`);
}
__name(resetPage, "resetPage");
function loginPage(next, wrong, wrongMsg) {
  const isStation = (next || "").indexOf("station-admin") >= 0;
  const isPlatform = (next || "").indexOf("platform") >= 0;
  const icon = isStation ? "%F0%9F%9B%A0" : isPlatform ? "%F0%9F%A7%B1" : "%F0%9F%8F%83";
  const _favEmoji = /* @__PURE__ */ __name((e) => "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2316233b'/%3E%3Ctext x='32' y='42' font-size='32' text-anchor='middle'%3E" + e + "%3C/text%3E%3C/svg%3E", "_favEmoji");
  const _favPlat = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='5' fill='%2314213D'/%3E%3Cg fill='none' stroke='%23E8BC4F' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 8l8-4 8 4-8 4-8-4z'/%3E%3Cpath d='M4 8v8l8 4 8-4V8'/%3E%3Cpath d='M12 12v8'/%3E%3C/g%3E%3C/svg%3E";
  const _favCross = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2316233b'/%3E%3Cg stroke-linecap='round' fill='none'%3E%3Cpath d='M19 17L45 43' stroke='%23E8BC4F' stroke-width='6'/%3E%3Cpath d='M45 43l7 7' stroke='%23E8BC4F' stroke-width='10'/%3E%3Cpath d='M45 17L19 43' stroke='%239FB2D6' stroke-width='6'/%3E%3Ccircle cx='45' cy='17' r='7' stroke='%239FB2D6' stroke-width='5'/%3E%3Cpath d='M19 43l-6 6' stroke='%239FB2D6' stroke-width='10'/%3E%3C/g%3E%3C/svg%3E";
  const favURI = isPlatform ? _favPlat : isStation ? _favCross : _favEmoji("%F0%9F%8F%83");
  const title = isStation ? "\u6B22\u4E50\u5DE5\u5177\u7AD9\u540E\u53F0\u767B\u5F55" : isPlatform ? "\u7A0B\u5E8F\u5236\u4F5C\u5E73\u53F0\u767B\u5F55" : "\u8FD0\u52A8\u4F1A\u7BA1\u7406\u7CFB\u7EDF\u767B\u5F55";
  const pwName = isStation ? "pw_station" : isPlatform ? "pw_factory" : "pw_sports";
  const nextVal = (next || "/apps/sports/home.html").replace(/"/g, "&quot;");
  return withPrefix(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title><link rel="icon" href="${favURI}"><style>
:root{--deep:#14213D;--gold:#D9A521;--goldL:#E8BC4F;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:"Microsoft YaHei",sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:linear-gradient(160deg,#14213D 0%,#1B2A4A 55%,#2A4370 100%);}
.box{background:rgba(255,255,255,.06);border:1px solid rgba(217,165,33,.35);border-radius:16px;
padding:38px 34px;width:min(92vw,380px);backdrop-filter:blur(8px);text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.4);}
h1{color:#fff;font-size:22px;margin-bottom:6px;}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--goldL);margin-right:8px;
animation:br 2s infinite;}
@keyframes br{50%{opacity:.25;}}
p{color:rgba(255,255,255,.55);font-size:13.5px;margin-bottom:24px;}
input{width:100%;padding:13px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.2);
background:rgba(255,255,255,.08);color:#fff;font-size:15px;margin-bottom:14px;outline:none;text-align:center;letter-spacing:1px;}
input:focus{border-color:var(--gold);}
button{width:100%;padding:13px;border:none;border-radius:10px;cursor:pointer;font-size:15px;font-weight:bold;
background:linear-gradient(135deg,var(--gold),var(--goldL));color:#14213D;}
.err{color:#E88;margin-bottom:12px;font-size:13.5px;}
a{color:var(--goldL);font-size:12.5px;text-decoration:none;display:inline-block;margin-top:18px;opacity:.8;}
.tabs{display:flex;gap:6px;margin-bottom:16px;}
.tab{flex:1;padding:10px 4px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:rgba(255,255,255,.6);font-size:13px;cursor:pointer;font-family:inherit;font-weight:600;}
.tab.on{background:linear-gradient(135deg,var(--gold),var(--goldL));color:var(--deep);border-color:var(--gold);}
form.pane{display:none;}form.pane.on{display:block;}
.hint{color:rgba(255,255,255,.4);font-size:12px;margin-top:6px;line-height:1.6;}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2314213D'/%3E%3Ctext x='32' y='44' font-size='34' text-anchor='middle' fill='%23E8BC4F'%3E${icon}%3C/text%3E%3C/svg%3E">
</style></head><body>${isStation ? '<a href="/apps/station-admin/index.html" style="position:fixed;top:12px;right:14px;font-size:14px;color:rgba(255,255,255,.55);text-decoration:none;border:1px solid rgba(255,255,255,.2);padding:7px 14px;border-radius:99px;background:rgba(255,255,255,.07)">\u{1F6E0} \u540E\u53F0\u7BA1\u7406</a>' : ""}<div class="box">
<h1><span class="dot"></span>${title}</h1>
<p>${isStation || isPlatform ? "\u8BF7\u8F93\u5165\u8FDB\u5165\u5BC6\u7801" : "\u8BF7\u9009\u62E9\u8EAB\u4EFD\u767B\u5F55"}</p>
${wrong ? '<div class="err">' + (wrongMsg || "\u5BC6\u7801\u4E0D\u5BF9\uFF0C\u8BF7\u91CD\u8BD5") + "</div>" : ""}
${isStation || isPlatform ? `
<form method="POST" action="/soft/__auth" id="huanleForm" onsubmit="try{var c=document.getElementById('rpChk'),i=document.getElementById('huanlePw'),K='${isStation ? "rp-station" : "rp-platform"}';if(c&&c.checked){localStorage.setItem(K,i.value)}else{localStorage.removeItem(K)}}catch(e){}return true;">
<div style="position:relative">
<input type="password" name="${pwName}" placeholder="\u8FDB\u5165\u5BC6\u7801" autocomplete="section-${isStation ? "station" : "platform"} new-password" data-form-id="${isStation ? "station-admin" : "platform"}" id="huanlePw" autofocus required style="padding-right:56px;text-align:left">
<button type="button" id="eyeBtn" tabindex="-1" onclick="var e=document.getElementById('huanlePw');e.type=e.type==='password'?'text':'password';this.textContent=e.type==='password'?'\u{1F441}':'\u{1F648}';e.focus()" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:18px;padding:4px 2px;color:rgba(255,255,255,.55);line-height:1">\u{1F441}</button>
</div>
<label style="display:flex;align-items:flex-start;justify-content:flex-start;gap:8px;color:rgba(255,255,255,.55);font-size:12.5px;margin-bottom:10px;cursor:pointer;text-align:left"><input type="checkbox" id="rpChk" style="width:15px;height:15px;margin:1px 0 0;flex-shrink:0;cursor:pointer"> \u8BB0\u4F4F\u5BC6\u7801\uFF08\u672C\u673A\xB7\u4E0B\u6B21\u81EA\u52A8\u586B\u597D\uFF09</label>
<input type="hidden" name="next" value="${nextVal}">
<button type="submit">\u8FDB \u5165</button></form>
<div style="margin-top:8px"><a href="/soft/__auth/forgot?door=${isStation ? "station" : "platform"}" style="font-size:12.5px">\u5FD8\u8BB0\u5BC6\u7801\uFF1F\u7528\u90AE\u7BB1\u91CD\u7F6E</a></div>
<a href="/">\u2190 \u8FD4\u56DE\u6B22\u4E50\u5DE5\u5177\u7AD9</a>
</div>
<script>
/* v4.27f \u7AD9\u957F\u65B9\u6848\uFF1A\u81EA\u5DF1\u7BA1\u8BB0\u4F4F\u5BC6\u7801\uFF08\u4E0D\u52FE=\u6E05\u5E72\u51C0\uFF09\uFF0C\u4E0D\u9760\u6D4F\u89C8\u5668 */
(function(){
  var K='${isStation ? "rp-station" : "rp-platform"}';
  var i=document.getElementById('huanlePw'),c=document.getElementById('rpChk');
  var saved=null;try{saved=localStorage.getItem(K)}catch(e){}
  if(saved){i.value=saved;c.checked=true;}
  document.getElementById('huanleForm').addEventListener('submit',function(){
    try{ if(c.checked) localStorage.setItem(K,i.value); else localStorage.removeItem(K); }catch(e){}
  });
})();
<\/script>
</body></html>` : `
<div class="tabs">
<button type="button" class="tab on" data-t="class" onclick="sw('class')">\u{1F9D1}\u200D\u{1F3EB} \u73ED\u4E3B\u4EFB</button>
<button type="button" class="tab" data-t="scorer" onclick="sw('scorer')">\u{1F4CB} \u6210\u7EE9\u5F55\u5165\u5458</button>
<button type="button" class="tab" data-t="admin" onclick="sw('admin')">\u{1F6E0} \u7BA1\u7406\u5458</button>
</div>
<form method="POST" action="/soft/__auth" class="pane on" id="p-class">
<input type="text" name="username" placeholder="\u7528\u6237\u540D\uFF08\u5982 11=\u4E00\u5E74\u7EA7\u4E00\u73ED\uFF09" autocomplete="section-sports username" style="margin-bottom:8px" id="clsUser">
<input type="password" name="pw_user" placeholder="\u8D26\u53F7\u5BC6\u7801" autocomplete="section-sports new-password" id="clsPw">
<label style="display:flex;align-items:center;justify-content:center;gap:6px;color:rgba(255,255,255,.55);font-size:12px;margin:6px 0 10px;cursor:pointer"><input type="checkbox" id="rpCls" style="width:14px;height:14px;margin:0;flex-shrink:0;cursor:pointer"> \u8BB0\u4F4F\u8D26\u53F7\u5BC6\u7801\uFF08\u672C\u673A\uFF09</label>
<input type="hidden" name="rt" value="class">
<input type="hidden" name="next" value="${nextVal}">
<button type="submit">\u8FDB \u5165</button>
<div class="hint">\u672C\u73ED\u62A5\u540D\u8868\u586B\u5199 \xB7 \u67E5\u770B\u6210\u7EE9\u4E0E\u5404\u79CD\u8868\u683C</div>
</form>
<form method="POST" action="/soft/__auth" class="pane" id="p-scorer">
<input type="text" name="username" placeholder="\u7528\u6237\u540D\uFF08\u5982 luquyuan1\uFF09" autocomplete="section-sports username" style="margin-bottom:8px" id="scrUser">
<input type="password" name="pw_user" placeholder="\u8D26\u53F7\u5BC6\u7801" autocomplete="section-sports new-password" id="scrPw">
<label style="display:flex;align-items:center;justify-content:center;gap:6px;color:rgba(255,255,255,.55);font-size:12px;margin:6px 0 10px;cursor:pointer"><input type="checkbox" id="rpScr" style="width:14px;height:14px;margin:0;flex-shrink:0;cursor:pointer"> \u8BB0\u4F4F\u8D26\u53F7\u5BC6\u7801\uFF08\u672C\u673A\uFF09</label>
<input type="hidden" name="rt" value="scorer">
<input type="hidden" name="next" value="${nextVal}">
<button type="submit" style="background:linear-gradient(135deg,#4A6DA7,#5B7EC4);color:#fff">\u8FDB \u5165</button>
<div class="hint">\u6BD4\u8D5B\u5F53\u5929\u5F55\u5165\u5404\u573A\u6B21\u6210\u7EE9\u4E0E\u540D\u6B21</div>
</form>
<form method="POST" action="/soft/__auth" class="pane" id="p-admin">
<input type="text" name="username" placeholder="\u7BA1\u7406\u8D26\u53F7\uFF08\u603B\u7BA1\u7406\u5458\u7559\u7A7A\uFF09" autocomplete="off" style="margin-bottom:8px">
<input type="password" name="${pwName}" placeholder="\u5BC6\u7801 / \u8FDB\u5165\u5BC6\u7801" autocomplete="section-sports new-password" id="admPw">
<label style="display:flex;align-items:center;justify-content:center;gap:6px;color:rgba(255,255,255,.55);font-size:12px;margin:6px 0 10px;cursor:pointer"><input type="checkbox" id="rpAdm" style="width:14px;height:14px;margin:0;flex-shrink:0;cursor:pointer"> \u8BB0\u4F4F\u5BC6\u7801\uFF08\u672C\u673A\xB7\u8FD0\u52A8\u4F1A\u7BA1\u7406\u5458\u4E13\u7528\uFF09</label>
<input type="hidden" name="rt" value="admin">
<input type="hidden" name="next" value="${nextVal}">
<button type="submit">\u8FDB \u5165</button>
<div class="hint">\u603B\u7BA1\u7406\u5458\uFF1A\u53EA\u586B\u8FDB\u5165\u5BC6\u7801\uFF08\u5FD8\u8BB0\u53EF\u7528\u90AE\u7BB1\u91CD\u7F6E\uFF09<br>\u7A0B\u5E8F\u7BA1\u7406\u5458\uFF1A\u586B\u8D26\u53F7+\u5BC6\u7801\uFF08\u5FD8\u8BB0\u5BC6\u7801\u8BF7\u8054\u7CFB\u603B\u7BA1\u7406\u5458\u91CD\u7F6E\uFF09</div>
<div style="margin-top:8px"><a href="/soft/__auth/forgot?door=sports" style="font-size:12px;margin-top:0">\u603B\u7BA1\u7406\u5458\u5FD8\u8BB0\u5BC6\u7801\uFF1F\u7528\u90AE\u7BB1\u91CD\u7F6E</a></div>
</form>
<a href="/">\u2190 \u8FD4\u56DE\u6B22\u4E50\u5DE5\u5177\u7AD9</a>
</div>
<script>
function sw(t){
  var tabs=document.querySelectorAll('.tab');
  for(var i=0;i<tabs.length;i++){tabs[i].className='tab'+(tabs[i].getAttribute('data-t')===t?' on':'');}
  var panes=document.querySelectorAll('form.pane');
  for(var j=0;j<panes.length;j++){panes[j].className='pane'+(('p-'+t)===panes[j].id?' on':'');}
}
/* v4.27f \u7AD9\u957F\u65B9\u6848\uFF1A\u8BB0\u4F4F\u5BC6\u7801\u81EA\u5DF1\u505A\u4E3B\uFF08\u52FE=\u672C\u673A\u8BB0\u4F4F\u81EA\u52A8\u586B\uFF0C\u4E0D\u52FE=\u6E05\u5E72\u51C0\uFF09 */
(function(){
  function gid(x){return document.getElementById(x)}
  function rd(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function wr(k,v){try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}}
  var s1=rd('rp-sports-class'),s2=rd('rp-sports-scorer'),s3=rd('rp-sports');
  if(s1){try{var o=JSON.parse(s1);gid('clsUser').value=o.u||'';gid('clsPw').value=o.p||'';gid('rpCls').checked=true;}catch(e){}}
  if(s2){try{var o2=JSON.parse(s2);gid('scrUser').value=o2.u||'';gid('scrPw').value=o2.p||'';gid('rpScr').checked=true;}catch(e){}}
  if(s3){gid('admPw').value=s3;gid('rpAdm').checked=true;}
  gid('p-class').addEventListener('submit',function(){
    wr('rp-sports-class',gid('rpCls').checked?JSON.stringify({u:gid('clsUser').value,p:gid('clsPw').value}):null);
  });
  gid('p-scorer').addEventListener('submit',function(){
    wr('rp-sports-scorer',gid('rpScr').checked?JSON.stringify({u:gid('scrUser').value,p:gid('scrPw').value}):null);
  });
  gid('p-admin').addEventListener('submit',function(){
    wr('rp-sports',gid('rpAdm').checked?gid('admPw').value:null);
  });
})();
<\/script>
</body></html>`}
`);
}
__name(loginPage, "loginPage");
function kvSafe(env) {
  if (env && env.TL_CONFIG && typeof env.TL_CONFIG.get === "function") return env.TL_CONFIG;
  const mem = /* @__PURE__ */ new Map();
  return {
    async get(k) {
      return mem.has(k) ? mem.get(k) : null;
    },
    async put(k, v) {
      mem.set(k, String(v));
    },
    async delete(k) {
      mem.delete(k);
    }
  };
}
__name(kvSafe, "kvSafe");
var SLUG = "";
function withPrefix(html) {
  if (!SLUG || typeof html !== "string") return html;
  return html.replaceAll('"/soft/', '"/sports/' + SLUG + '/soft/').replaceAll('"/apps/sports/', '"/sports/' + SLUG + '/apps/sports/');
}
__name(withPrefix, "withPrefix");
var TVKV = null;
var worker_default = {
  async fetch(request, env) {
    TVKV = kvSafe(env);
    const url = new URL(request.url);
    let { pathname } = url;
    SLUG = "";
    const mSlug = pathname.match(/^\/sports\/([a-z0-9][a-z0-9-]{0,30})(\/.*)?$/);
    if (mSlug) { SLUG = mSlug[1]; pathname = mSlug[2] || "/"; }
    if (pathname === "/" || pathname === "/soft/sports" || pathname === "/soft/sports/") pathname = "/apps/sports/home.html";
    const cookies = request.headers.get("Cookie") || "";
    let door = doorOfPath(pathname);
    if (pathname.startsWith("/soft/__admin/")) {
      const ep = pathname.slice("/soft/__admin/".length);
      if (ep === "get-config" || ep === "set-nav" || ep === "set-about" || ep === "set-password") door = "station";
      else if (ep === "publish") door = "platform";
    }
    const myToken = cookies.match(new RegExp(COOKIE_OF[door] + "=([0-9a-f]{64})"));
    const hasPass = myToken && myToken[1] === await tokenOf(env, door);
    async function whoAmI() {
      if (!myToken) return null;
      if (myToken[1] === await tokenOf(env, door)) return { username: "\u7AD9\u957F", role: "master" };
      if (door !== "sports") return null;
      let accs = {};
      try {
        accs = JSON.parse(await TVKV.get("accounts_json") || "{}");
      } catch (e) {
        accs = {};
      }
      for (const [u, a] of Object.entries(accs)) {
        const expect = await hmacHex(await getPwHash(env, "sports"), "user:" + u + ":" + a.role);
        if (myToken[1] === expect) return { username: u, role: a.role, note: a.note || "", className: a.className || "" };
      }
      return null;
    }
    __name(whoAmI, "whoAmI");
    const session = await whoAmI();
    const isAdmin = session && (session.role === "master" || session.role === "admin");
    if (pathname === "/soft/__admin/get-config" && request.method === "GET") {
      if (!isAdmin) return new Response(loginPage(pathname, false), { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
      const nav = JSON.parse(await TVKV.get("nav_json") || "null");
      const about = await TVKV.get("about_text");
      return new Response(JSON.stringify({ nav: nav || null, about: about || "" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/__admin/set-about" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const text = (fd.get("about") || "").trim();
      if (!text) return new Response(JSON.stringify({ ok: false, msg: "\u4ECB\u7ECD\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      if (text.length > 3e3) return new Response(JSON.stringify({ ok: false, msg: "\u5185\u5BB9\u592A\u957F\uFF08\u4E0A\u96503000\u5B57\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      await TVKV.put("about_text", text);
      return new Response(JSON.stringify({ ok: true, msg: "\u7AD9\u70B9\u4ECB\u7ECD\u5DF2\u66F4\u65B0\uFF0C/about \u9875\u9762\u7ACB\u5373\u751F\u6548" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/__admin/publish" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      let card;
      try {
        card = JSON.parse(fd.get("card") || "null");
      } catch (e) {
        card = null;
      }
      if (!card || !card.title || !card.href) return new Response(JSON.stringify({ ok: false, msg: "\u5361\u7247\u6570\u636E\u4E0D\u5168" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let shelf = [];
      try {
        shelf = JSON.parse(await TVKV.get("shelf_cards") || "[]");
      } catch (e) {
        shelf = [];
      }
      shelf = shelf.filter((c) => c.title !== card.title);
      shelf.push(card);
      await TVKV.put("shelf_cards", JSON.stringify(shelf));
      return new Response(JSON.stringify({ ok: true, msg: "\u5DF2\u53D1\u5E03\u5230\u5DE5\u5177\u7AD9\u9996\u9875" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/__admin/accounts" && request.method === "GET") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let accs = {};
      try {
        accs = JSON.parse(await TVKV.get("accounts_json") || "{}");
      } catch (e) {
        accs = {};
      }
      const safe = {};
      for (const [u, a] of Object.entries(accs)) safe[u] = { role: a.role, note: a.note || "", createdAt: a.createdAt || "" };
      return new Response(JSON.stringify({ ok: true, accounts: safe }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/__admin/account-save" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const username = (fd.get("username") || "").trim();
      const role = fd.get("role") || "";
      const note = (fd.get("note") || "").trim();
      const password = (fd.get("password") || "").trim();
      if (!/^[a-zA-Z0-9_-]{1,30}$/.test(username)) return new Response(JSON.stringify({ ok: false, msg: "\u7528\u6237\u540D\u987B\u4E3A 1-30 \u4F4D\u5B57\u6BCD/\u6570\u5B57/\u6A2A\u7EBF" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      if (!["class", "scorer", "admin"].includes(role)) return new Response(JSON.stringify({ ok: false, msg: "\u89D2\u8272\u987B\u4E3A class / scorer / admin" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      if (note.length > 50) return new Response(JSON.stringify({ ok: false, msg: "\u5907\u6CE8\u592A\u957F\uFF08\u4E0A\u965050\u5B57\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let accs = {};
      try {
        accs = JSON.parse(await TVKV.get("accounts_json") || "{}");
      } catch (e) {
        accs = {};
      }
      const isNew = !accs[username];
      if (isNew && password.length < 1) return new Response(JSON.stringify({ ok: false, msg: "\u65B0\u5EFA\u8D26\u53F7\u5FC5\u987B\u8BBE\u5BC6\u7801\uFF08\u5EFA\u8BAE6\u4F4D\u4EE5\u4E0A\uFF0C\u53EF\u81EA\u5B9A\u4E49\u77ED\u5BC6\u7801\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      if (password && password.length < 1) return new Response(JSON.stringify({ ok: false, msg: "\u5BC6\u7801\u81F3\u5C11 1 \u4F4D\uFF08\u5EFA\u8BAE 6 \u4F4D\u4EE5\u4E0A\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      if (!accs[username]) accs[username] = {};
      accs[username].role = role;
      accs[username].note = note;
      if (password) accs[username].pw = await sha256Hex(password);
      if (!accs[username].createdAt) accs[username].createdAt = (/* @__PURE__ */ new Date()).toISOString();
      await TVKV.put("accounts_json", JSON.stringify(accs));
      return new Response(JSON.stringify({ ok: true, msg: (isNew ? "\u8D26\u53F7\u5DF2\u521B\u5EFA\uFF1A" : "\u8D26\u53F7\u5DF2\u66F4\u65B0\uFF1A") + username }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/__admin/account-del" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const username = (fd.get("username") || "").trim();
      let accs = {};
      try {
        accs = JSON.parse(await TVKV.get("accounts_json") || "{}");
      } catch (e) {
        accs = {};
      }
      if (!accs[username]) return new Response(JSON.stringify({ ok: false, msg: "\u8D26\u53F7\u4E0D\u5B58\u5728\uFF1A" + username }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      delete accs[username];
      await TVKV.put("accounts_json", JSON.stringify(accs));
      return new Response(JSON.stringify({ ok: true, msg: "\u8D26\u53F7\u5DF2\u5220\u9664\uFF1A" + username }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/events" && request.method === "GET") {
      if (!session) return new Response(JSON.stringify({ ok: false, msg: "\u672A\u767B\u5F55" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let evs;
      try {
        evs = JSON.parse(await TVKV.get("events_json") || "null");
      } catch (e) {
        evs = null;
      }
      return new Response(JSON.stringify({ ok: true, events: evs || DEFAULT_EVENTS }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/entry-data" && request.method === "GET") {
      if (!session) return new Response(JSON.stringify({ ok: false, msg: "\u672A\u767B\u5F55" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let entries = {};
      try {
        entries = JSON.parse(await TVKV.get("entries_json") || "{}");
      } catch (e) {
        entries = {};
      }
      const locked = await TVKV.get("entry_locked") === "1";
      let accs = {};
      try {
        accs = JSON.parse(await TVKV.get("accounts_json") || "{}");
      } catch (e) {
        accs = {};
      }
      const classList = Object.entries(accs).filter(([u, a]) => a.role === "class").map(([u, a]) => ({ username: u, className: a.className || a.note || u }));
      if (isAdmin) return new Response(JSON.stringify({ ok: true, entries, locked, classList }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const mine = {};
      if (entries[session.username]) mine[session.username] = entries[session.username];
      return new Response(JSON.stringify({ ok: true, entries: mine, locked, me: session.username, myClass: (accs[session.username] || {}).className || (accs[session.username] || {}).note || session.username, classList: [] }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/entry-save" && request.method === "POST") {
      if (!session) return new Response(JSON.stringify({ ok: false, msg: "\u672A\u767B\u5F55" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const locked = await TVKV.get("entry_locked") === "1";
      let target = session.username, className = session.className || session.note || session.username;
      if (isAdmin) {
        target = (fd.get("class") || "").trim();
        className = (fd.get("className") || target).trim();
        if (!target) return new Response(JSON.stringify({ ok: false, msg: "\u7F3A\u5C11\u73ED\u7EA7\u53C2\u6570" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      } else if (session.role !== "class") {
        return new Response(JSON.stringify({ ok: false, msg: "\u53EA\u6709\u73ED\u7EA7\u8D26\u53F7\u53EF\u4EE5\u62A5\u540D" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (locked && !isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u62A5\u540D\u5DF2\u9501\u5B9A\uFF0C\u5982\u6709\u95EE\u9898\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let students;
      try {
        students = JSON.parse(fd.get("students") || "[]");
      } catch (e) {
        students = null;
      }
      if (!Array.isArray(students)) return new Response(JSON.stringify({ ok: false, msg: "\u540D\u5355\u6570\u636E\u683C\u5F0F\u9519\u8BEF" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let boys = 0, girls = 0;
      for (const s of students) {
        if (!s || typeof s.name !== "string" || !s.name.trim() || s.name.trim().length > 20) return new Response(JSON.stringify({ ok: false, msg: "\u5B66\u751F\u59D3\u540D\u987B\u4E3A1-20\u4E2A\u5B57" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        if (s.gender === "\u7537") boys++;
        else if (s.gender === "\u5973") girls++;
        else return new Response(JSON.stringify({ ok: false, msg: "\u6027\u522B\u987B\u4E3A\u7537\u6216\u5973" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        if (!Array.isArray(s.events) || s.events.length < 1 || s.events.length > 2) return new Response(JSON.stringify({ ok: false, msg: s.name + "\uFF1A\u6BCF\u4EBA\u987B\u62A5 1-2 \u4E2A\u9879\u76EE" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        for (const ev of s.events) if (typeof ev !== "string" || ev.length > 20) return new Response(JSON.stringify({ ok: false, msg: "\u9879\u76EE\u540D\u4E0D\u5408\u6CD5" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (boys > 4 || girls > 4) return new Response(JSON.stringify({ ok: false, msg: "\u6BCF\u73ED\u6700\u591A 4 \u7537 + 4 \u5973\uFF08\u5F53\u524D\u7537" + boys + "\u5973" + girls + "\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let entries = {};
      try {
        entries = JSON.parse(await TVKV.get("entries_json") || "{}");
      } catch (e) {
        entries = {};
      }
      entries[target] = { className, students: students.map((s) => ({ name: s.name.trim(), gender: s.gender, events: s.events })), updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await TVKV.put("entries_json", JSON.stringify(entries));
      return new Response(JSON.stringify({ ok: true, msg: "\u62A5\u540D\u5DF2\u4FDD\u5B58\uFF1A" + className + "\uFF08" + students.length + " \u4EBA\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/entry-lock" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const lock = fd.get("lock") === "1";
      await TVKV.put("entry_locked", lock ? "1" : "0");
      return new Response(JSON.stringify({ ok: true, msg: lock ? "\u62A5\u540D\u5DF2\u9501\u5B9A\uFF0C\u5404\u73ED\u4E0D\u80FD\u518D\u4FEE\u6539" : "\u62A5\u540D\u5DF2\u89E3\u9501" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/numbers-gen" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let entries = {};
      try {
        entries = JSON.parse(await TVKV.get("entries_json") || "{}");
      } catch (e) {
        entries = {};
      }
      let accs = {};
      try {
        accs = JSON.parse(await TVKV.get("accounts_json") || "{}");
      } catch (e) {
        accs = {};
      }
      const classAccs = Object.entries(accs).filter(([u, a]) => a.role === "class").map(([u, a]) => ({ username: u, className: a.className || a.note || u }));
      if (!classAccs.length) return new Response(JSON.stringify({ ok: false, msg: "\u8FD8\u6CA1\u6709\u73ED\u7EA7\u8D26\u53F7\u2014\u2014\u5148\u5728 M2 \u5EFA\u53F7\u5E76\u5B8C\u6210\u62A5\u540D" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const gradeMap = { "\u4E00": 1, "\u4E8C": 2, "\u4E09": 3, "\u56DB": 4, "\u4E94": 5, "\u516D": 6 };
      const sortKey = /* @__PURE__ */ __name((cn) => {
        const gm = cn.match(/([一二三四五六])年级/) || cn.match(/(\d+)\s*年级/);
        const bm = cn.match(/(\d+)\s*班/) || cn.match(/([一二三四五六])\s*班/);
        let g = gm ? /^\d+$/.test(gm[1]) ? parseInt(gm[1], 10) : gradeMap[gm[1]] || 0 : 0;
        let c = bm ? /^\d+$/.test(bm[1]) ? parseInt(bm[1], 10) : gradeMap[bm[1]] || 0 : 0;
        return g * 100 + c;
      }, "sortKey");
      classAccs.sort((a, b) => sortKey(a.className) - sortKey(b.className));
      const numbers = {};
      let n = 0, used = 0;
      for (const c of classAccs) {
        const rec = entries[c.username];
        if (rec && Array.isArray(rec.students) && rec.students.length) {
          const arr = rec.students.map((s) => {
            n++;
            return { no: String(n).padStart(3, "0"), name: s.name, gender: s.gender, events: s.events || [] };
          });
          numbers[c.username] = { className: rec.className || c.className, coach: c.note && c.note !== "\u73ED\u4E3B\u4EFB" && c.note !== "\u6210\u7EE9\u5F55\u5165\u5458" && c.note !== "\u7BA1\u7406\u5458" ? c.note : "", students: arr };
          used++;
        }
      }
      if (!n) return new Response(JSON.stringify({ ok: false, msg: "\u8FD8\u6CA1\u6709\u4EFB\u4F55\u62A5\u540D\u6570\u636E\u2014\u2014\u5148\u8BA9\u73ED\u4E3B\u4EFB\u5B8C\u6210\u62A5\u540D" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      await TVKV.put("numbers_json", JSON.stringify(numbers));
      await TVKV.put("numbers_meta", JSON.stringify({ total: n, classes: used, generatedAt: (/* @__PURE__ */ new Date()).toISOString() }));
      return new Response(JSON.stringify({ ok: true, msg: "\u53F7\u7801\u5DF2\u751F\u6210\uFF1A\u5171 " + n + " \u540D\u8FD0\u52A8\u5458\uFF0C\u8986\u76D6 " + used + " \u4E2A\u73ED\uFF08001-" + String(n).padStart(3, "0") + "\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/numbers" && request.method === "GET") {
      if (!session) return new Response(JSON.stringify({ ok: false, msg: "\u672A\u767B\u5F55" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let numbers = {}, meta = null;
      try {
        numbers = JSON.parse(await TVKV.get("numbers_json") || "{}");
      } catch (e) {
        numbers = {};
      }
      try {
        meta = JSON.parse(await TVKV.get("numbers_meta") || "null");
      } catch (e) {
        meta = null;
      }
      if (isAdmin || session.role === "scorer") return new Response(JSON.stringify({ ok: true, numbers, meta }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const mine = {};
      if (numbers[session.username]) mine[session.username] = numbers[session.username];
      return new Response(JSON.stringify({ ok: true, numbers: mine, meta, me: session.username }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/program-data" && request.method === "GET") {
      if (!session) return new Response(JSON.stringify({ ok: false, msg: "\u672A\u767B\u5F55" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let events = null;
      try {
        events = JSON.parse(await TVKV.get("events_json") || "null");
      } catch (e) {
        events = null;
      }
      let numbers = {}, meta = null, pmeta = null;
      try {
        numbers = JSON.parse(await TVKV.get("numbers_json") || "{}");
      } catch (e) {
        numbers = {};
      }
      try {
        meta = JSON.parse(await TVKV.get("numbers_meta") || "null");
      } catch (e) {
        meta = null;
      }
      try {
        pmeta = JSON.parse(await TVKV.get("program_meta") || "null");
      } catch (e) {
        pmeta = null;
      }
      let schedule = null;
      try {
        schedule = JSON.parse(await TVKV.get("schedule_json") || "null");
      } catch (e) {
        schedule = null;
      }
      return new Response(JSON.stringify({ ok: true, events: events || DEFAULT_EVENTS, numbers, meta, program: pmeta || {}, schedule }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/program-meta" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const pick = /* @__PURE__ */ __name((k, len) => (fd.get(k) || "").trim().slice(0, len || 60), "pick");
      const pmeta = { school: pick("school"), meetName: pick("meetName"), date1: pick("date1", 30), date2: pick("date2", 30), place: pick("place"), notice: pick("notice", 2e3) };
      await TVKV.put("program_meta", JSON.stringify(pmeta));
      return new Response(JSON.stringify({ ok: true, msg: "\u7A0B\u5E8F\u518C\u4FE1\u606F\u5DF2\u4FDD\u5B58" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/me" && request.method === "GET") {
      if (!session) return new Response(JSON.stringify({ ok: false, msg: "\u672A\u767B\u5F55" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let className = "";
      if (session.role === "class") {
        try {
          const accs = JSON.parse(await TVKV.get("accounts_json") || "{}");
          className = (accs[session.username] || {}).className || "";
        } catch (e) {
          className = "";
        }
      }
      return new Response(JSON.stringify({ ok: true, username: session.username, role: session.role, className }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/my-pass" && request.method === "POST") {
      if (!session) return new Response(JSON.stringify({ ok: false, msg: "\u672A\u767B\u5F55" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const oldpw = (fd.get("oldpw") || "").trim();
      const newpw = (fd.get("newpw") || "").trim();
      if (newpw.length < 1 || newpw.length > 64) return new Response(JSON.stringify({ ok: false, msg: "\u65B0\u5BC6\u7801\u987B 1-64 \u4F4D\uFF08\u5EFA\u8BAE 6 \u4F4D\u4EE5\u4E0A\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let accs = {};
      try {
        accs = JSON.parse(await TVKV.get("accounts_json") || "{}");
      } catch (e) {
        accs = {};
      }
      /* 【v4.83】总管理员(master/admin)=站密码身份：密码存 pw_hash_sports 门钥匙，不走班主任账号表 */
      if (isAdmin) {
        const cur = await getPwHash(env, "sports");
        if (await sha256Hex(oldpw) !== cur) return new Response(JSON.stringify({ ok: false, msg: "\u539F\u5BC6\u7801\u4E0D\u5BF9" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        await TVKV.put("pw_hash_sports", await sha256Hex(newpw));
        return new Response(JSON.stringify({ ok: true, msg: "\u5BC6\u7801\u5DF2\u6539\uFF0C\u8BF7\u7528\u65B0\u5BC6\u7801\u91CD\u65B0\u767B\u5F55" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      }
      const me = accs[session.username];
      if (!me) return new Response(JSON.stringify({ ok: false, msg: "\u8D26\u53F7\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u5220\u9664" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      if (await sha256Hex(oldpw) !== me.pw) return new Response(JSON.stringify({ ok: false, msg: "\u539F\u5BC6\u7801\u4E0D\u5BF9" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      me.pw = await sha256Hex(newpw);
      await TVKV.put("accounts_json", JSON.stringify(accs));
      return new Response(JSON.stringify({ ok: true, msg: "\u5BC6\u7801\u5DF2\u6539\uFF0C\u8BF7\u7528\u65B0\u5BC6\u7801\u91CD\u65B0\u767B\u5F55" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/schedule" && request.method === "GET") {
      if (!session) return new Response(JSON.stringify({ ok: false, msg: "\u672A\u767B\u5F55" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let sched = null;
      try {
        sched = JSON.parse(await TVKV.get("schedule_json") || "null");
      } catch (e) {
        sched = null;
      }
      return new Response(JSON.stringify({ ok: true, schedule: sched }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/schedule-save" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      let sched;
      try {
        sched = JSON.parse(fd.get("schedule") || "null");
      } catch (e) {
        sched = null;
      }
      if (!sched || !Array.isArray(sched.days) || !sched.days.length) return new Response(JSON.stringify({ ok: false, msg: "\u8D5B\u7A0B\u6570\u636E\u4E0D\u5408\u6CD5" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      for (const day of sched.days) {
        if (!day.title || !Array.isArray(day.items)) return new Response(JSON.stringify({ ok: false, msg: "\u6BCF\u4E2A\u6BD4\u8D5B\u65E5\u987B\u6709\u6807\u9898\u548C\u573A\u6B21" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        for (const it of day.items) {
          if (!it.name || String(it.name).length > 40) return new Response(JSON.stringify({ ok: false, msg: "\u573A\u6B21\u540D\u4E0D\u5408\u6CD5" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
          if (it.remark && String(it.remark).length > 60) return new Response(JSON.stringify({ ok: false, msg: "\u5907\u6CE8\u592A\u957F" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        }
      }
      await TVKV.put("schedule_json", JSON.stringify(sched));
      return new Response(JSON.stringify({ ok: true, msg: "\u8D5B\u7A0B\u5DF2\u4FDD\u5B58\uFF08" + sched.days.length + " \u4E2A\u6BD4\u8D5B\u65E5\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/me" && request.method === "GET") {
      if (!session) return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      return new Response(JSON.stringify({ ok: true, role: session.role, username: session.username, className: session.className || "" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    /* =====【v4.84】新学年归档：本届数据快照进 archive_json（历届数组），年度键清空；配置/校纪录/账号/密码全保留 ===== */
    const ARCH_KEYS = ["entries_json","entry_locked","numbers_json","numbers_meta","results_json","schedule_json","program_meta"];
    if (pathname === "/soft/api/archive-list" && request.method === "GET") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u4EC5\u603B\u7BA1\u7406\u5458\u53EF\u7528" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let arr = [];
      try { arr = JSON.parse((await TVKV.get("archive_json")) || "[]"); } catch (e) { arr = []; }
      const items = arr.map(function(a, i) { return { i: i, archivedAt: a.archivedAt || "", meetName: a.meetName || "", size: JSON.stringify(a.data || {}).length }; });
      return new Response(JSON.stringify({ ok: true, items: items }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/archive-get" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u4EC5\u603B\u7BA1\u7406\u5458\u53EF\u7528" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const idx = parseInt(fd.get("index"), 10);
      let arr = [];
      try { arr = JSON.parse((await TVKV.get("archive_json")) || "[]"); } catch (e) { arr = []; }
      if (!(idx >= 0 && idx < arr.length)) return new Response(JSON.stringify({ ok: false, msg: "\u5F52\u6863\u53F7\u4E0D\u5B58\u5728" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      return new Response(JSON.stringify({ ok: true, item: arr[idx] }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/archive-new" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u4EC5\u603B\u7BA1\u7406\u5458\u53EF\u7528" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const data = {};
      for (const k of ARCH_KEYS) data[k] = await TVKV.get(k);
      let meetName = "";
      try { const cfg = JSON.parse((await TVKV.get("sports_config")) || "null"); meetName = (cfg && cfg.school && cfg.school.meetName) || ""; } catch (e) {}
      let arr = [];
      try { arr = JSON.parse((await TVKV.get("archive_json")) || "[]"); } catch (e) { arr = []; }
      arr.push({ archivedAt: new Date().toISOString().slice(0, 10), meetName: meetName, data: data });
      await TVKV.put("archive_json", JSON.stringify(arr));
      await TVKV.put("entries_json", "[]");
      await TVKV.put("entry_locked", "no");
      await TVKV.put("numbers_json", "null");
      await TVKV.delete("numbers_meta");
      await TVKV.put("results_json", "{}");
      await TVKV.delete("schedule_json");
      await TVKV.delete("program_meta");
      return new Response(JSON.stringify({ ok: true, msg: "\u5DF2\u5F52\u6863\u300C" + meetName + "\u300D\uFF1A\u62A5\u540D\u3001\u53F7\u7801\u3001\u6210\u7EE9\u3001\u8D5B\u7A0B\u5DF2\u6E05\u7A7A\uFF0C\u8BF7\u53BB\u57FA\u7840\u914D\u7F6E\u628A\u5E74\u4EFD\u6539\u6210\u65B0\u5B66\u5E74" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/archive-restore" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u4EC5\u603B\u7BA1\u7406\u5458\u53EF\u7528" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const idx = parseInt(fd.get("index"), 10);
      let arr = [];
      try { arr = JSON.parse((await TVKV.get("archive_json")) || "[]"); } catch (e) { arr = []; }
      if (!(idx >= 0 && idx < arr.length)) return new Response(JSON.stringify({ ok: false, msg: "\u5F52\u6863\u53F7\u4E0D\u5B58\u5728" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const data = arr[idx].data || {};
      for (const k of ARCH_KEYS) { if (data[k] == null) await TVKV.delete(k); else await TVKV.put(k, data[k]); }
      return new Response(JSON.stringify({ ok: true, msg: "\u5DF2\u6062\u590D\u300C" + (arr[idx].meetName || "") + "\u300D\u7684\u6570\u636E\uFF08\u6CE8\u610F\uFF1A\u5F53\u524D\u672A\u5F52\u6863\u7684\u6570\u636E\u88AB\u8986\u76D6\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/archive-del" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u4EC5\u603B\u7BA1\u7406\u5458\u53EF\u7528" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const idx = parseInt(fd.get("index"), 10);
      let arr = [];
      try { arr = JSON.parse((await TVKV.get("archive_json")) || "[]"); } catch (e) { arr = []; }
      if (!(idx >= 0 && idx < arr.length)) return new Response(JSON.stringify({ ok: false, msg: "\u5F52\u6863\u53F7\u4E0D\u5B58\u5728" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      arr.splice(idx, 1);
      await TVKV.put("archive_json", JSON.stringify(arr));
      return new Response(JSON.stringify({ ok: true, msg: "\u5F52\u6863\u5DF2\u5220\u9664" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/archive-upload" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u4EC5\u603B\u7BA1\u7406\u5458\u53EF\u7528" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const f = fd.get("file");
      if (!f) return new Response(JSON.stringify({ ok: false, msg: "\u8BF7\u9009\u62E9\u5907\u4EFD JSON \u6587\u4EF6" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let item = null;
      try { item = JSON.parse(await f.text()); } catch (e) { item = null; }
      if (!item || typeof item !== "object" || !item.data || typeof item.data !== "object") return new Response(JSON.stringify({ ok: false, msg: "\u6587\u4EF6\u683C\u5F0F\u4E0D\u5BF9\uFF1A\u987B\u662F\u672C\u7CFB\u7EDF\u5BFC\u51FA\u7684\u5F52\u6863 JSON\uFF08\u542B data \u5B57\u6BB5\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let arr = [];
      try { arr = JSON.parse((await TVKV.get("archive_json")) || "[]"); } catch (e) { arr = []; }
      const name = String(item.meetName || "");
      let hit = -1;
      if (name) hit = arr.findIndex(function(a) { return a.meetName === name; });
      const rec = { archivedAt: String(item.archivedAt || new Date().toISOString().slice(0, 10)), meetName: name, data: item.data };
      if (hit >= 0) { arr[hit] = rec; } else { arr.push(rec); }
      await TVKV.put("archive_json", JSON.stringify(arr));
      return new Response(JSON.stringify({ ok: true, msg: (hit >= 0 ? "\u5DF2\u66FF\u6362" : "\u5DF2\u5BFC\u5165") + "\u300C" + name + "\u300D\uFF08\u7B2C " + (hit >= 0 ? hit + 1 : arr.length) + " \u5C4A\u6863\u6848\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/results" && request.method === "GET") {
      if (!session) return new Response(JSON.stringify({ ok: false, msg: "\u672A\u767B\u5F55" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let results = {}, wins = null;
      try {
        results = JSON.parse(await TVKV.get("results_json") || "{}");
      } catch (e) {
        results = {};
      }
      try {
        wins = JSON.parse(await TVKV.get("meet_windows") || "null");
      } catch (e) {
        wins = null;
      }
      return new Response(JSON.stringify({ ok: true, results, windows: wins }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/meet-windows" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const wins = { meetStart: (fd.get("meetStart") || "").trim().slice(0, 30), publicityEnd: (fd.get("publicityEnd") || "").trim().slice(0, 30) };
      await TVKV.put("meet_windows", JSON.stringify(wins));
      return new Response(JSON.stringify({ ok: true, msg: "\u5F55\u5165\u7A97\u53E3\u5DF2\u8BBE\u7F6E" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/result-save" && request.method === "POST") {
      if (!session || session.role !== "scorer" && session.role !== "admin" && session.role !== "master") {
        return new Response(JSON.stringify({ ok: false, msg: "\u53EA\u6709\u6210\u7EE9\u5F55\u5165\u5458\u548C\u7BA1\u7406\u5458\u53EF\u4EE5\u5F55\u5165\u6210\u7EE9" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      }
      let wins = null;
      try {
        wins = JSON.parse(await TVKV.get("meet_windows") || "null");
      } catch (e) {
        wins = null;
      }
      if (wins && wins.meetStart && wins.publicityEnd && session.role === "scorer") {
        const now = Date.now();
        const st = Date.parse(wins.meetStart), en = Date.parse(wins.publicityEnd);
        if (!isNaN(st) && !isNaN(en)) {
          if (now < st) return new Response(JSON.stringify({ ok: false, msg: "\u8FD0\u52A8\u4F1A\u8FD8\u6CA1\u5F00\u59CB\uFF08" + wins.meetStart + " \u8D77\uFF09" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
          if (now > en) return new Response(JSON.stringify({ ok: false, msg: "\u6210\u7EE9\u516C\u793A\u671F\u5DF2\u7ED3\u675F\uFF08" + wins.publicityEnd + "\uFF09\uFF0C\u5F55\u5165\u901A\u9053\u5173\u95ED" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        }
      }
      const fd = await request.formData();
      const eventName = (fd.get("event") || "").trim().slice(0, 40);
      if (!eventName) return new Response(JSON.stringify({ ok: false, msg: "\u7F3A\u5C11\u573A\u6B21\u540D" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let entries;
      try {
        entries = JSON.parse(fd.get("entries") || "[]");
      } catch (e) {
        entries = null;
      }
      if (!Array.isArray(entries)) return new Response(JSON.stringify({ ok: false, msg: "\u6210\u7EE9\u6570\u636E\u683C\u5F0F\u9519\u8BEF" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      for (const e of entries) {
        if (e.no && String(e.no).length > 10) return new Response(JSON.stringify({ ok: false, msg: "\u53F7\u7801\u4E0D\u5408\u6CD5" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        if (e.result && String(e.result).length > 30) return new Response(JSON.stringify({ ok: false, msg: "\u6210\u7EE9\u6587\u672C\u592A\u957F" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        if (e.rank != null && e.rank !== "" && !/^[1-8]$/.test(String(e.rank))) return new Response(JSON.stringify({ ok: false, msg: "\u540D\u6B21\u987B\u4E3A 1-8\uFF08" + (e.name || e.no || "?") + "\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        if (e.note && String(e.note).length > 60) return new Response(JSON.stringify({ ok: false, msg: "\u5907\u6CE8\u592A\u957F" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      }
      let results = {};
      try {
        results = JSON.parse(await TVKV.get("results_json") || "{}");
      } catch (e) {
        results = {};
      }
      try {
        let recTable = {};
        try {
          recTable = JSON.parse(await TVKV.get("sports_records") || "{}");
        } catch (e2) {
          recTable = {};
        }
        let townTable = {};
        try {
          townTable = JSON.parse(await TVKV.get("sports_records_town") || "{}");
        } catch (e2) {
          townTable = {};
        }
        const stdName = String(eventName).match(/^(.*?)年级(男子|女子)?(.+?)(预决赛|决赛)?$/) ? RegExp.$2 + RegExp.$3 : String(eventName).replace(/预决赛|决赛/g, "");
        const fEv = /跳高|跳远|铅球|垒球|实心球|沙包|标枪|掷|投掷|立定/.test(stdName);
        const toNum = /* @__PURE__ */ __name((s) => {
          if (fEv) return parseFloat(String(s).replace(/[^0-9.]/g, ""));
          const t = String(s).replace(/[^0-9.]/g, "");
          const p = t.split(".");
          if (!t) return NaN;
          if (p.length === 1) return parseFloat(p[0]);
          if (p.length === 2) return parseFloat(p[0] + "." + p[1]);
          return parseFloat(p[0]) * 60 + parseFloat(p[1] + "." + p[2]);
        }, "toNum");
        const schV = recTable[stdName] && recTable[stdName].value ? toNum(recTable[stdName].value) : NaN;
        const townV = townTable[stdName] && townTable[stdName].value ? toNum(townTable[stdName].value) : NaN;
        if (!isNaN(schV) && isFinite(schV) || !isNaN(townV) && isFinite(townV)) for (const e of entries) {
          if (e.recPending === 0) continue;
          if (!e.result) continue;
          const v = toNum(e.result);
          if (isNaN(v) || !isFinite(v)) continue;
          const beatTown = !isNaN(townV) && isFinite(townV) && (fEv ? v > townV : v < townV);
          const beatSch = !isNaN(schV) && isFinite(schV) && (fEv ? v > schV : v < schV);
          if (beatTown) {
            e.recPending = 1;
            e.recLevel = "town";
          } else if (beatSch) {
            e.recPending = 1;
            e.recLevel = "school";
          } else {
            delete e.recPending;
            delete e.recLevel;
          }
        }
      } catch (e3) {
      }
      results[eventName] = { entries, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), by: session.username };
      await TVKV.put("results_json", JSON.stringify(results));
      return new Response(JSON.stringify({ ok: true, msg: "\u6210\u7EE9\u5DF2\u4FDD\u5B58\uFF1A" + eventName + "\uFF08" + entries.length + " \u6761\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/config" && request.method === "GET") {
      let cfg = null;
      try {
        cfg = JSON.parse(await TVKV.get("sports_config") || "null");
      } catch (e) {
        cfg = null;
      }
      return new Response(JSON.stringify({ ok: true, config: cfg }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/config-save" && request.method === "POST") {
      if (!session || session.role !== "admin" && session.role !== "master") return new Response(JSON.stringify({ ok: false, msg: "\u53EA\u6709\u7BA1\u7406\u5458\u53EF\u4EE5\u4FDD\u5B58\u7CFB\u7EDF\u914D\u7F6E" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      let cfg;
      try {
        cfg = JSON.parse(fd.get("config") || "null");
      } catch (e) {
        cfg = null;
      }
      if (!cfg || typeof cfg !== "object") return new Response(JSON.stringify({ ok: false, msg: "\u914D\u7F6E\u6570\u636E\u683C\u5F0F\u9519\u8BEF" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const raw = JSON.stringify(cfg);
      if (raw.length > 2e5) return new Response(JSON.stringify({ ok: false, msg: "\u914D\u7F6E\u592A\u5927\uFF08\u8D85\u8FC7200KB\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      await TVKV.put("sports_config", raw);
      return new Response(JSON.stringify({ ok: true, msg: "\u914D\u7F6E\u5DF2\u4FDD\u5B58\u5230\u4E91\u7AEF\uFF08\u6362\u6D4F\u89C8\u5668/\u6362\u7535\u8111\u90FD\u5728\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/records" && request.method === "GET") {
      let rt = {};
      try {
        rt = JSON.parse(await TVKV.get("sports_records") || "{}");
      } catch (e) {
        rt = {};
      }
      let tw = {};
      try {
        tw = JSON.parse(await TVKV.get("sports_records_town") || "{}");
      } catch (e) {
        tw = {};
      }
      return new Response(JSON.stringify({ ok: true, records: rt, town: tw }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/records-save" && request.method === "POST") {
      if (!session || session.role !== "admin" && session.role !== "master") return new Response(JSON.stringify({ ok: false, msg: "\u53EA\u6709\u7BA1\u7406\u5458\u53EF\u4EE5\u7EF4\u62A4\u8BB0\u5F55\u8868" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const level = String(fd.get("level") || "school") === "town" ? "town" : "school";
      const merge = String(fd.get("merge") || "") === "1";
      let items;
      try {
        items = JSON.parse(fd.get("items") || "[]");
      } catch (e) {
        items = null;
      }
      if (!Array.isArray(items) || !items.length) return new Response(JSON.stringify({ ok: false, msg: "\u6570\u636E\u683C\u5F0F\u9519\u8BEF" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const kvKey = level === "town" ? "sports_records_town" : "sports_records";
      const rt = merge ? await (async () => {
        let old = {};
        try {
          old = JSON.parse(await TVKV.get(kvKey) || "{}");
        } catch (e) {
          old = {};
        }
        return old;
      })() : {};
      for (const it of items) {
        const std = String(it.std || "").trim().slice(0, 30), value = String(it.value || "").trim().slice(0, 30);
        if (!std || !value) continue;
        rt[std] = { value, holder: String(it.holder || "").trim().slice(0, 20), unit: String(it.unit || "").trim().slice(0, 30), place: String(it.place || "").trim().slice(0, 40), date: String(it.date || "").trim().slice(0, 20) };
      }
      await TVKV.put(kvKey, JSON.stringify(rt));
      return new Response(JSON.stringify({ ok: true, msg: (level === "town" ? "\u9547\u8BB0\u5F55" : "\u6821\u8BB0\u5F55") + "\u5DF2\u4FDD\u5B58\uFF08\u5171 " + Object.keys(rt).length + " \u6761\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/standings" && request.method === "GET") {
      if (!session) return new Response(JSON.stringify({ ok: false, msg: "\u672A\u767B\u5F55" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let results = {}, numbers = {}, config = null, recCfg = null;
      try {
        results = JSON.parse(await TVKV.get("results_json") || "{}");
      } catch (e) {
        results = {};
      }
      try {
        numbers = JSON.parse(await TVKV.get("numbers_json") || "{}");
      } catch (e) {
        numbers = {};
      }
      try {
        config = JSON.parse(await TVKV.get("sports_config") || "null");
      } catch (e) {
        config = null;
      }
      let ranks = [7, 5, 4, 3, 2, 1], recMode = "uniform", recPts = 10, recTown = 10, recDistrict = 20;
      try {
        const m1 = JSON.parse(await TVKV.get("m1_config") || "null");
        if (m1) {
          if (Array.isArray(m1.scoringRanks) && m1.scoringRanks.length === 6) ranks = m1.scoringRanks.map(Number);
          if (m1.record && m1.record.mode) {
            recMode = m1.record.mode;
            recPts = Number(m1.record.uniform) || 10;
            recTown = Number(m1.record.town) || 10;
            recDistrict = Number(m1.record.district) || 20;
          }
        }
      } catch (e) {
      }
      const no2class = {};
      for (const [u, c] of Object.entries(numbers)) for (const s of c.students || []) no2class[String(s.no)] = c.className;
      const detail = {};
      const classTotals = {};
      const recLog = [];
      for (const [evName, rec] of Object.entries(results)) {
        const isRelay = evName.indexOf("\u63A5\u529B") >= 0;
        const items = [];
        for (const e of rec.entries || []) {
          let pts = 0, rp = 0;
          const rank = parseInt(e.rank, 10);
          if (rank >= 1 && rank <= 6) pts = (isRelay ? ranks.map((x) => x * 2) : ranks)[rank - 1];
          const note = String(e.note || "");
          if (/破.{0,2}纪录|破.{0,2}记录/.test(note) && note.indexOf("\u5DF2\u786E\u8BA4") >= 0) {
            if (recMode === "off") rp = 0;
            else if (recMode === "tiered") rp = note.indexOf("\u533A") >= 0 ? recDistrict : recTown;
            else rp = recPts;
            if (rp > 0) recLog.push({ event: evName, no: e.no, name: e.name, extra: rp, note: note.slice(0, 30) });
          }
          const cls = isRelay ? e.name || "" : no2class[String(e.no)] || "";
          items.push({ no: e.no || "", name: e.name || "", rank: e.rank || "", pts, recPts: rp, className: cls });
          if (pts + rp > 0) classTotals[cls] = (classTotals[cls] || 0) + pts + rp;
        }
        detail[evName] = items;
      }
      let evList = null;
      try {
        evList = JSON.parse(await TVKV.get("events_json") || "null");
      } catch (e) {
        evList = null;
      }
      const eventNames = Array.isArray(evList) ? evList.map((e) => e && e.name || e).filter(Boolean) : Object.keys(detail);
      let accs2 = {};
      try {
        accs2 = JSON.parse(await TVKV.get("accounts_json") || "{}");
      } catch (e) {
        accs2 = {};
      }
      const classNames = Object.values(accs2).filter((a) => a.role === "class").map((a) => a.className || a.note || "").filter(Boolean);
      const gradeTotals = {};
      for (const [cls, pts] of Object.entries(classTotals)) {
        const gm = String(cls).match(/([一二三四五六])年级/);
        const gk = gm ? gm[1] + "\u5E74\u7EA7" : "\u5176\u4ED6";
        gradeTotals[gk] = gradeTotals[gk] || [];
        gradeTotals[gk].push({ className: cls, pts });
      }
      for (const gk of Object.keys(gradeTotals)) gradeTotals[gk].sort((a, b) => b.pts - a.pts);
      return new Response(JSON.stringify({
        ok: true,
        config: { ranks, relayDouble: true, recMode, recPts, recTown, recDistrict },
        detail,
        classTotals,
        gradeTotals,
        recLog,
        eventNames,
        classNames
      }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/api/classes-setup" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      let counts;
      try {
        counts = JSON.parse(fd.get("counts") || "{}");
      } catch (e) {
        counts = null;
      }
      if (!counts) return new Response(JSON.stringify({ ok: false, msg: "\u73ED\u7EA7\u6570\u6570\u636E\u4E0D\u5408\u6CD5" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const PIN = ["", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
      const PY = ["", "yinianji", "ernianji", "sanjianji", "sinianji", "wunianji", "liunianji"];
      let accounts = null;
      try {
        accounts = JSON.parse(await TVKV.get("accounts_json") || "{}");
      } catch (e) {
        accounts = {};
      }
      const created = [], existed = [];
      let total = 0;
      for (const [gs, cnt] of Object.entries(counts)) {
        const g = parseInt(gs, 10);
        if (!(g >= 1 && g <= 6)) continue;
        const n = parseInt(cnt, 10) || 0;
        if (n < 1 || n > 15) return new Response(JSON.stringify({ ok: false, msg: PIN[g] + "\u5E74\u7EA7\u73ED\u7EA7\u6570\u987B\u57281-15\u4E4B\u95F4" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        for (let c = 1; c <= n; c++) {
          const user = g + "" + c;
          const clsName = PIN[g] + "\u5E74\u7EA7" + ["", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u4E03", "\u516B", "\u4E5D", "\u5341", "\u5341\u4E00", "\u5341\u4E8C", "\u5341\u4E09", "\u5341\u56DB", "\u5341\u4E94"][c] + "\u73ED";
          if (accounts[user]) {
            existed.push(user);
            continue;
          }
          const defPwd = user;
          accounts[user] = { role: "class", className: clsName, pw: await sha256Hex(defPwd), note: "\u73ED\u4E3B\u4EFB", createdAt: (/* @__PURE__ */ new Date()).toISOString() };
          created.push({ user, className: clsName, pwd: defPwd });
          total++;
        }
      }
      if (!total && !existed.length) return new Response(JSON.stringify({ ok: false, msg: "\u6CA1\u6709\u53EF\u521B\u5EFA\u7684\u73ED\u7EA7\uFF08\u68C0\u67E5\u73ED\u7EA7\u6570\u8BBE\u7F6E\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      await TVKV.put("accounts_json", JSON.stringify(accounts));
      return new Response(JSON.stringify({ ok: true, msg: "\u5DF2\u65B0\u5EFA " + total + " \u4E2A\u73ED\u4E3B\u4EFB\u8D26\u53F7\uFF08" + existed.length + " \u4E2A\u5DF2\u5B58\u5728\u8DF3\u8FC7\uFF09", created }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/__auth/forgot") {
      if (request.method === "GET") {
        const q = new URL(request.url).searchParams;
        return new Response(forgotPage(null, q.get("door")), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      const fd = await request.formData();
      const email = (fd.get("email") || "").trim().toLowerCase();
      const saved = (await TVKV.get("recovery_email") || "197576@163.com").toLowerCase();
      if (email !== saved) return new Response(forgotPage({ ok: false, text: "\u8FD9\u4E2A\u90AE\u7BB1\u4E0D\u662F\u672C\u7AD9\u7684\u627E\u56DE\u90AE\u7BB1" }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      if (!env.RESEND_API_KEY) return new Response(forgotPage({ ok: false, text: "\u90AE\u4EF6\u670D\u52A1\u8FD8\u6CA1\u914D\u7F6E\u597D\uFF08\u7B49\u7AD9\u957F\u7684 Resend \u94A5\u5319\u63D2\u4E0A\u5373\u901A\uFF09" }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      const tok = randomToken();
      const door2 = fd.get("door") === "station" || fd.get("door") === "sports" ? fd.get("door") : "platform";
      await TVKV.put("reset_" + tok, door2, { expirationTtl: 900 });
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "HuanLe Tools <onboarding@resend.dev>",
          to: [saved],
          subject: "\u3010\u6B22\u4E50\u5DE5\u5177\u7AD9\u3011\u627E\u56DE" + DOOR_NAME[door2] + "\u5BC6\u7801",
          html: `<div style="font-family:sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #DFE4EC;border-radius:12px">
<h2 style="color:#14213D">\u6B22\u4E50\u5DE5\u5177\u7AD9 \xB7 \u627E\u56DE\u5BC6\u7801</h2>
<p style="color:#5B6577;font-size:14px">\u60A8\uFF08\u6216\u6709\u4EBA\uFF09\u7533\u8BF7\u627E\u56DE tl.efcc.cc ${DOOR_NAME[door2]}\u7684\u8FDB\u5165\u5BC6\u7801\u3002</p>
<p style="font-size:13px;color:#5B6577">\u70B9\u51FB\u4E0B\u9762\u7684\u94FE\u63A5\u8BBE\u7F6E\u65B0\u5BC6\u7801\uFF0815\u5206\u949F\u5185\u6709\u6548\uFF0C\u7528\u4E00\u6B21\u5373\u4F5C\u5E9F\uFF09\uFF1A</p>
<p><a href="https://tl.efcc.cc${SLUG ? "/sports/" + SLUG : ""}/soft/__auth/reset?token=${tok}" style="display:inline-block;background:#D9A521;color:#14213D;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">\u70B9\u6B64\u8BBE\u7F6E\u65B0\u5BC6\u7801</a></p>
<p style="font-size:12px;color:#909090">\u5982\u679C\u8FD9\u4E0D\u662F\u60A8\u672C\u4EBA\u7684\u64CD\u4F5C\uFF0C\u65E0\u89C6\u8FD9\u5C01\u90AE\u4EF6\u5373\u53EF\uFF0C\u5BC6\u7801\u4E0D\u4F1A\u53D8\u3002</p></div>`
        })
      });
      if (r.ok) return new Response(forgotPage({ ok: true, text: "\u90AE\u4EF6\u5DF2\u53D1\u9001\u5230 " + saved + "\uFF0C\u8BF7\u67E5\u6536\uFF08\u4E5F\u770B\u770B\u5783\u573E\u90AE\u4EF6\u7BB1\uFF09" }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      return new Response(forgotPage({ ok: false, text: "\u90AE\u4EF6\u53D1\u9001\u5931\u8D25\uFF0C\u7A0D\u540E\u518D\u8BD5\u6216\u8054\u7CFB\u7BA1\u7406\u5458" }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (pathname === "/soft/__auth/reset") {
      const url2 = new URL(request.url);
      let token = url2.searchParams.get("token") || "";
      if (request.method === "POST") {
        const fd = await request.formData();
        token = fd.get("token") || "";
        const nw = fd.get("newpw") || "";
        if (nw.length < 6) return new Response(resetPage(token, { ok: false, text: "\u65B0\u5BC6\u7801\u81F3\u5C11 2 \u4F4D\uFF08\u5EFA\u8BAE 6 \u4F4D\u4EE5\u4E0A\uFF09" }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
        const savedDoor = await TVKV.get("reset_" + token) || "platform";
        const door2 = savedDoor === "station" || savedDoor === "sports" ? savedDoor : "platform";
        if (!await TVKV.get("reset_" + token)) return new Response(resetPage("", { ok: false, text: "\u94FE\u63A5\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u7533\u8BF7\u627E\u56DE\u90AE\u4EF6" }, door2), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
        await TVKV.delete("reset_" + token);
        await TVKV.put("pw_hash_" + door2, await sha256Hex(nw));
        return new Response(loginPage("/apps/" + (door2 === "station" ? "station-admin/index" : door2 === "platform" ? "platform/index" : "sports/index") + ".html", false), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": COOKIE_OF[door2] + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" } });
      }
      if (!token || !await TVKV.get("reset_" + token)) return new Response(resetPage(token, { ok: false, text: "\u94FE\u63A5\u65E0\u6548\u6216\u5DF2\u8FC7\u671F" }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      {
        const gd = await TVKV.get("reset_" + token);
        return new Response(resetPage(token, null, gd), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    }
    if (pathname === "/soft/__auth/logout" && request.method === "POST") {
      const ck = "Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
      const hh = new Headers({ "Content-Type": "application/json; charset=utf-8" });
      for (const n of ["station_auth", "platform_auth", "sports_auth"]) hh.append("Set-Cookie", n + "=; " + ck);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: hh });
    }
    if (pathname === "/soft/__auth" && request.method === "POST") {
      const fd = await request.formData();
      let pw = fd.get("password") || "";
      if (!pw) {
        for (const [k, v] of fd.entries()) {
          if (k.startsWith("pw_") && v) {
            pw = v;
            break;
          }
        }
      }
      const username = (fd.get("username") || "").trim();
      const rt = (fd.get("rt") || "").trim();
      const ROLE_NAME = { class: "\u73ED\u4E3B\u4EFB", scorer: "\u6210\u7EE9\u5F55\u5165\u5458", admin: "\u7BA1\u7406\u5458", master: "\u603B\u7BA1\u7406\u5458" };
      const next = fd.get("next") || "/apps/sports/home.html";
      const door2 = doorOfPath(next);
      if (!username && (rt === "admin" || !rt) && await sha256Hex(pw) === await getPwHash(env, door2)) {
        const tok1 = await tokenOf(env, door2);
        const cN = COOKIE_OF[door2];
        const nIsSportsModule = next.startsWith("/apps/sports/") && next !== "/apps/sports/home.html" || next.startsWith("/soft/sports/");
        const dest1 = nIsSportsModule ? "/apps/sports/home.html" : next.startsWith("/soft/") || next.startsWith("/apps/") ? next : "/apps/sports/home.html";
        return new Response('<!DOCTYPE html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="background:#14213D"><p style="color:#E8BC4F;font-family:sans-serif;text-align:center;padding:40vh 0 0">\u6B63\u5728\u8FDB\u5165\u2026</p><script>document.cookie="' + cN + "=" + tok1 + '; Path=/; Secure; Max-Age=2592000; SameSite=Lax";location.replace("' + ((SLUG ? "/sports/" + SLUG : "") + dest1) + '");<\/script>', {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": cN + "=" + tok1 + "; Path=/; HttpOnly; Secure; SameSite=Lax" }
        });
      }
      if (!username && rt && rt !== "admin") {
        return new Response(loginPage(next, true, "\u8BF7\u5728\u300C" + (ROLE_NAME[rt] || "\u6240\u9009\u8EAB\u4EFD") + "\u300D\u9875\u7B7E\u586B\u5199\u7528\u6237\u540D\u548C\u8D26\u53F7\u5BC6\u7801"), { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      if (username) {
        let accs = {};
        try {
          accs = JSON.parse(await TVKV.get("accounts_json") || "{}");
        } catch (e) {
          accs = {};
        }
        const a = accs[username];
        if (a && a.pw && await sha256Hex(pw) === a.pw) {
          if (rt && rt !== a.role) {
            return new Response(loginPage(next, true, "\u8EAB\u4EFD\u4E0D\u5339\u914D\uFF1A\u8D26\u53F7\u300C" + username + "\u300D\u662F\u300C" + (ROLE_NAME[a.role] || a.role) + "\u300D\uFF0C\u8BF7\u5207\u6362\u5230\u5BF9\u5E94\u9875\u7B7E\u767B\u5F55"), { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
          }
          const tok = await hmacHex(await getPwHash(env, "sports"), "user:" + username + ":" + a.role);
          const nIsSportsMod2 = next.startsWith("/apps/sports/") && next !== "/apps/sports/home.html" || next.startsWith("/soft/sports/");
          const dest2 = nIsSportsMod2 ? "/apps/sports/home.html" : next.startsWith("/soft/") || next.startsWith("/apps/") ? next : "/apps/sports/home.html";
          return new Response('<!DOCTYPE html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="background:#14213D"><p style="color:#E8BC4F;font-family:sans-serif;text-align:center;padding:40vh 0 0">\u6B63\u5728\u8FDB\u5165\u2026</p><script>document.cookie="sports_auth=' + tok + '; Path=/; Secure; Max-Age=2592000; SameSite=Lax";location.replace("' + ((SLUG ? "/sports/" + SLUG : "") + dest2) + '");<\/script>', {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": "sports_auth=" + tok + "; Path=/; HttpOnly; Secure; SameSite=Lax" }
          });
        }
        return new Response(loginPage(next, true), { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      return new Response(loginPage(next, true), { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (pathname.startsWith("/soft/__admin/") && !pathname.startsWith("/soft/__auth")) {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname.startsWith("/soft/") && !pathname.startsWith("/soft/__admin") && pathname !== "/soft/__auth" || (pathname.startsWith("/apps/sports/") || pathname.startsWith("/apps/platform/") || pathname.startsWith("/apps/station-admin/"))) {
      if (!session) return new Response(loginPage(pathname, false), { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      if ((/^\/soft\/sports\/(index|accounts)\.html$/.test(pathname) || /^\/apps\/sports\/(index|accounts)\.html$/.test(pathname)) && !isAdmin) {
        if (session) {
          return Response.redirect(new URL((SLUG ? "/sports/" + SLUG : "") + "/apps/sports/home.html", url.origin).toString(), 302);
        }
        return new Response(loginPage(pathname, false), { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      }
    }
    const APPS_MAP = [
      [/^\/soft\/sports\/(.+\.html?)$/, "/apps/sports/$1"],
      [/^\/soft\/platform\/(.+\.html?)$/, "/apps/platform/$1"],
      [/^\/soft\/station-admin\/(.+\.html?)$/, "/apps/station-admin/$1"],
      [/^\/share\/(admin\.html?)$/, "/apps/share/$1"],
      [/^\/tool\/(admin\.html?)$/, "/apps/github/$1"]
      /* 注：直播源txt保留根目录原位（影视仓/欢乐直播现役直连，站长09:50叫停迁移） */
    ];
    for (const [re, to] of APPS_MAP) {
      const m = pathname.match(re);
      if (m) {
        const newUrl = pathname.replace(re, to);
        const u2 = new URL(request.url);
        if (SLUG) newUrl = "/sports/" + SLUG + newUrl;
        u2.pathname = newUrl;
        return Response.redirect(u2.toString(), 302);
      }
    }
    if (pathname === "/favicon.ico" || pathname === "/favicon.svg") {
      const _fav = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#16233b'/><g stroke-linecap='round' fill='none'><path d='M19 17L45 43' stroke='#E8BC4F' stroke-width='6'/><path d='M45 43l7 7' stroke='#E8BC4F' stroke-width='10'/><path d='M45 17L19 43' stroke='#9FB2D6' stroke-width='6'/><circle cx='45' cy='17' r='7' stroke='#9FB2D6' stroke-width='5'/><path d='M19 43l-6 6' stroke='#9FB2D6' stroke-width='10'/></g></svg>`;
      return new Response(_fav, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
    }
    if (pathname === "/ip/api/geo") {
      const u2 = new URL(request.url);
      const t = (u2.searchParams.get("target") || "").trim();
    }
    if (!pathname.startsWith("/apps/sports/")) return new Response("Not Found", { status: 404 });
    let saw404 = false;
    for (const base of UPSTREAMS) {
      try {
        let upstreamUrl = base + pathname.replace(/^\//, "");
        if (/\.html?$/i.test(pathname)) {
          upstreamUrl += (upstreamUrl.includes("?") ? "&" : "?") + "_b=" + Math.floor(Date.now() / 6e4);
        }
        const _hdrs = base.startsWith("https://api.github.com") ? { "Authorization": "Bearer " + (env.GH_TV_TOKEN || ""), "User-Agent": "tl-worker", "Accept": "application/vnd.github.raw" } : void 0;
        const resp = await fetch(upstreamUrl, { redirect: "follow", cf: { cacheTtl: 0, cacheEverything: false }, headers: _hdrs });
        if (resp.ok) {
          const headers = new Headers(resp.headers);
          const isTool = pathname.startsWith("/apps/") || pathname.startsWith("/tool/") || pathname.startsWith("/soft/") || pathname === "/index.html";
          if (/\.html?$/i.test(pathname)) {
            headers.set("Content-Type", "text/html; charset=utf-8");
            headers.delete("Content-Security-Policy");
            headers.delete("Content-Security-Policy-Report-Only");
            headers.delete("X-Frame-Options");
          }
          headers.set("Cache-Control", "public, max-age=60");
          headers.set("X-Relay-From", base.split("/")[2]);
          if (/\.m?js$/i.test(pathname)) headers.set("Content-Type", "text/javascript; charset=utf-8");
          else if (/\.wasm$/i.test(pathname)) headers.set("Content-Type", "application/wasm");
          else if (/\.gz$/i.test(pathname)) headers.set("Content-Type", "application/gzip");
          if (isTool) headers.set("Cache-Control", "no-store");
          if (/^\/apps\/pdf\/lib\//.test(pathname)) headers.set("Cache-Control", "public, max-age=604800, immutable");
          if (/^\/apps\/sports\/.*\.html?$/.test(pathname) && session) {
            const roleCn = { class: "\u73ED\u4E3B\u4EFB", scorer: "\u6210\u7EE9\u5F55\u5165\u5458", admin: "\u7BA1\u7406\u5458", master: "\u603B\u7BA1\u7406\u5458" }[session.role] || "\u73ED\u4E3B\u4EFB";
            const html43 = await resp.text();
            if (html43.includes(">\u73ED\u4E3B\u4EFB\u5DE5\u4F5C\u53F0<")) {
              return new Response(html43.split(">\u73ED\u4E3B\u4EFB\u5DE5\u4F5C\u53F0<").join(">" + roleCn + "\u5DE5\u4F5C\u53F0<"), { status: 200, headers });
            }
            return new Response(html43, { status: 200, headers });
          }
          if (/^\/apps\/station-admin\/.*\.html?$/.test(pathname)) {
            let html = await resp.text();
            const guard = `
<script>
/* v4.15 \u5173\u95E8\u811A\u672C\uFF1A\u8FD9\u9875\u4E00\u5173/\u4E00\u5207\u8D70\uFF0C\u901A\u884C\u8BC1\u7ACB\u523B\u4F5C\u5E9F\uFF08sendBeacon \u4FDD\u8BC1\u53EF\u9760\u9001\u8FBE\uFF09 */
window.addEventListener("pagehide", function(){
  try { navigator.sendBeacon("/soft/__auth/logout"); } catch(e){
    fetch("/soft/__auth/logout", {method:"POST", keepalive:true}).catch(function(){});
  }
});
<\/script>`;
            const idx = html.toLowerCase().lastIndexOf("</body>");
            if (idx >= 0) html = html.slice(0, idx) + guard + "\n" + html.slice(idx);
            return new Response(html, { status: 200, headers });
          }
          if (pathname === "/index.html") {
            headers.set("Cache-Control", "no-store");
            let html = null;
            const shelfJson = await TVKV.get("shelf_cards");
            if (shelfJson) {
              html = await resp.text();
              try {
                const shelf = JSON.parse(shelfJson);
                const cards = shelf.map((c) => `<a class="tool" href="${c.href}" target="_blank" rel="noopener"><!-- v4.18b\uFF1A\u4F5C\u54C1\u5361\u4E00\u5F8B\u65B0\u7A97\u53E3\uFF08\u9632\u5446\uFF1A\u5373\u4F7F\u914D\u7F6E\u6F0F\u4E86 external \u4E5F\u5F3A\u5236\uFF09 -->
      <div class="t-top">
        <div class="icon-box"><span class="ico">${c.icon || "\u{1F4E6}"}</span></div>
        <span class="tag ${c.status === "on" ? "on" : "build"}">${c.status === "on" ? "\u5DF2\u4E0A\u7EBF" : "\u5EFA\u8BBE\u4E2D"}</span>
      </div>
      <h3>${c.title}</h3>
      <p>${c.desc || ""}</p>
      <span class="go">${c.go || "\u8FDB\u5165\u7A0B\u5E8F"} <em>\u2192</em></span>
    </a>`).join("\n    ");
                html = html.replace(/<!--SHELF:CARDS-->/, cards);
              } catch (e) {
              }
            }
            const navJson = await TVKV.get("nav_json");
            if (navJson && html === null) {
              html = await resp.text();
            }
            if (navJson && html !== null) {
              try {
                const nav = JSON.parse(navJson);
                const items = nav.map((n) => `<a href="${n.href}"${n.external ? ' target="_blank" rel="noopener"' : ""}>${n.text}</a>`).join("\n          ");
                html = html.replace(/<!--NAV:START-->[\s\S]*?<!--NAV:END-->/, `<!--NAV:START-->
          ${items}
          <!--NAV:END-->`);
              } catch (e) {
              }
            }
            if (html !== null) return new Response(html, { status: 200, headers });
          }
          if (pathname === "/about.html") {
            headers.set("Cache-Control", "no-store");
            const aboutText = await TVKV.get("about_text");
            if (aboutText) {
              let html = await resp.text();
              const paras = aboutText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`);
              html = html.replace(/<!--ABOUT:START-->[\s\S]*?<!--ABOUT:END-->/, `<!--ABOUT:START-->
    ${paras.join("\n    ")}
    <!--ABOUT:END-->`);
              return new Response(html, { status: 200, headers });
            }
          }
          const isHtml2 = /\.html?$/i.test(pathname);
          if (isHtml2) { const t = await resp.text(); return new Response(withPrefix(t), { status: 200, headers }); }
          return new Response(resp.body, { status: 200, headers });
        }
        if (resp.status === 404) saw404 = true;
      } catch (e) {
      }
    }
    return saw404 ? new Response("Not Found", { status: 404 }) : new Response("all upstreams failed", { status: 502 });
  }
};
export {
  worker_default as default
};
