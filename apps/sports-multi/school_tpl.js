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
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
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
</div></body></html>`;
}
__name(forgotPage, "forgotPage");
function resetPage(token, msg, door) {
  door = door === "station" || door === "sports" ? door : "platform";
  const backLink = door === "station" ? "/apps/station-admin/index.html" : door === "platform" ? "/apps/platform/index.html" : "/apps/sports/index.html";
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
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
</div></body></html>`;
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
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
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
`;
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
var TVKV = null;
async function fetchInner(request, env) {
    TVKV = kvSafe(env);
    const url = new URL(request.url);
    let { pathname } = url;
    if (pathname === "/" || pathname === "/portal" || pathname === "/portal/") {
      pathname = "/index.html";
    }
    if (pathname === "/about") pathname = "/about.html";
    if (pathname === "/ip" || pathname === "/ip/" || pathname === "/ip/index.html") pathname = "/apps/ip/index.html";
    if (pathname === "/pdf" || pathname === "/pdf/") pathname = "/apps/pdf/index.html";
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
    const SHARE_FILE_DEFAULT_DAYS = 60;
    async function shareDefaultDays() {
      const v = parseInt(await TVKV.get("share_default_days") || "0", 10);
      return v >= 1 && v <= 3650 ? v : SHARE_FILE_DEFAULT_DAYS;
    }
    __name(shareDefaultDays, "shareDefaultDays");
    async function shareMetaAll() {
      try {
        return JSON.parse(await TVKV.get("share_file_meta") || "{}") || {};
      } catch (e) {
        return {};
      }
    }
    __name(shareMetaAll, "shareMetaAll");
    async function shareMetaSet(fid, days) {
      const m = await shareMetaAll();
      m[fid] = { exp: days > 0 ? Date.now() + days * 864e5 : 0, setAt: Date.now() };
      await TVKV.put("share_file_meta", JSON.stringify(m));
    }
    __name(shareMetaSet, "shareMetaSet");
    async function shareSweepExpired(env2) {
      const m = await shareMetaAll();
      const now = Date.now();
      let swept = 0;
      let codes = null;
      const touchedDirs = /* @__PURE__ */ new Set();
      for (const fid of Object.keys(m)) {
        const e = m[fid] && m[fid].exp;
        if (!e || e >= now) continue;
        try {
          const creds = await davCreds(env2);
          if (creds && creds.account && creds.password) {
            const auth = btoa(creds.account + ":" + creds.password);
            await fetch("https://webdav.123pan.cn/webdav/" + davSeg(fid), { method: "DELETE", headers: { "Authorization": "Basic " + auth } });
          }
        } catch (e2) {
        }
        if (codes === null) {
          try {
            codes = JSON.parse(await TVKV.get("share_codes") || "[]");
          } catch (e3) {
            codes = [];
          }
        }
        const base = fid.split("/").pop();
        const kept = codes.filter((c) => c.file !== fid && c.file !== base);
        if (kept.length !== codes.length) {
          codes = kept;
          await TVKV.put("share_codes", JSON.stringify(codes));
        }
        const di = fid.lastIndexOf("/");
        if (di > 0) {
          let cur = fid.slice(0, di);
          while (cur) {
            touchedDirs.add(cur);
            const j = cur.lastIndexOf("/");
            cur = j > 0 ? cur.slice(0, j) : "";
          }
        }
        delete m[fid];
        swept++;
      }
      if (swept) await TVKV.put("share_file_meta", JSON.stringify(m));
      if (swept && touchedDirs.size) {
        const creds = await davCreds(env2);
        if (creds && creds.account && creds.password) {
          const auth = btoa(creds.account + ":" + creds.password);
          for (const d of [...touchedDirs].sort((a2, b2) => b2.length - a2.length)) {
            try {
              const pf = await davPropfind(env2, d);
              const lastSeg = d.split("/").pop();
              const others = (pf.entries || []).filter((e) => !(e.isDir && e.name === lastSeg));
              if (pf.err || !Array.isArray(pf.entries) || others.length) continue;
              await fetch("https://webdav.123pan.cn/webdav/" + davSeg(d) + "/", { method: "DELETE", headers: { "Authorization": "Basic " + auth } });
              if (codes === null) {
                try {
                  codes = JSON.parse(await TVKV.get("share_codes") || "[]");
                } catch (e4) {
                  codes = [];
                }
              }
              const k = codes.filter((c) => c.file !== d);
              if (k.length !== codes.length) {
                codes = k;
                await TVKV.put("share_codes", JSON.stringify(codes));
              }
            } catch (e5) {
            }
          }
        }
      }
      return swept;
    }
    __name(shareSweepExpired, "shareSweepExpired");
    async function shareMetaEnsure(files) {
      const m = await shareMetaAll();
      const now = Date.now();
      const dd = await shareDefaultDays();
      let dirty = false;
      for (const f of files || []) {
        const fid = f.path ? f.path + "/" + f.name : f.name;
        if (!m[fid]) {
          m[fid] = { exp: now + dd * 864e5, setAt: now };
          dirty = true;
        }
      }
      if (dirty) await TVKV.put("share_file_meta", JSON.stringify(m));
      return m;
    }
    __name(shareMetaEnsure, "shareMetaEnsure");
    async function shareAdminPwHash(env2) {
      const h = await TVKV.get("share_admin_pw");
      return h || await getPwHash(env2, "station");
    }
    __name(shareAdminPwHash, "shareAdminPwHash");
    async function okShareAdmin(env2) {
      let tok = "";
      const am = (request.headers.get("Authorization") || "").match(/^Bearer ([0-9a-f]{64})$/);
      if (am) tok = am[1];
      if (!tok) {
        const cm = (request.headers.get("Cookie") || "").match(/share_admin=([0-9a-f]{64})/);
        if (cm) tok = cm[1];
      }
      if (!tok) return false;
      return tok === await hmacHex(await shareAdminPwHash(env2), "share-admin-v1");
    }
    __name(okShareAdmin, "okShareAdmin");
    if (pathname === "/share/__admin/login" && request.method === "POST") {
      const fd = await request.formData();
      const pw = (fd.get("pw") || "").trim();
      const remember = fd.get("remember") === "1";
      if (pw && await sha256Hex(pw) === await shareAdminPwHash(env)) {
        const tok = await hmacHex(await shareAdminPwHash(env), "share-admin-v1");
        return new Response(JSON.stringify({ ok: true, tok }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": "share_admin=" + tok + "; Path=/; HttpOnly; Secure; SameSite=Lax" } });
      }
      return new Response(JSON.stringify({ ok: false, msg: "\u5BC6\u7801\u4E0D\u5BF9" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/logout" && request.method === "POST") {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": "share_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" } });
    }
    if (pathname === "/share/__admin/set-pw" && request.method === "POST") {
      const fd = await request.formData();
      const nw = (fd.get("new") || "").trim();
      if (nw.length < 6) return new Response(JSON.stringify({ ok: false, msg: "\u65B0\u5BC6\u7801\u81F3\u5C11 2 \u4F4D\uFF08\u5EFA\u8BAE 6 \u4F4D\u4EE5\u4E0A\uFF09" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      if (!(isAdmin || await okShareAdmin(env))) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650\uFF08\u5DE5\u5177\u7AD9\u540E\u53F0\u6216\u5171\u4EAB\u7AD9\u540E\u53F0\u767B\u5F55\u540E\u53EF\u6539\uFF09" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      await TVKV.put("share_admin_pw", await sha256Hex(nw));
      return new Response(JSON.stringify({ ok: true, msg: "\u5171\u4EAB\u7AD9\u540E\u53F0\u5BC6\u7801\u5DF2\u6539\uFF08\u63D0\u53D6\u7801\u4E0D\u53D7\u5F71\u54CD\uFF0C\u65B0\u5BC6\u7801\u7ACB\u5373\u751F\u6548\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/forgot") {
      if (request.method === "GET") return Response.redirect(new URL("/share/admin.html", request.url).toString(), 302);
      const fd = await request.formData();
      const email = (fd.get("email") || "").trim().toLowerCase();
      const saved = (await TVKV.get("recovery_email") || "197576@163.com").toLowerCase();
      if (email !== saved) return new Response(JSON.stringify({ ok: false, msg: "\u90AE\u7BB1\u4E0D\u5BF9\u2014\u2014\u8BF7\u8F93\u5165\u6CE8\u518C\u90AE\u7BB1" }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      if (!env.RESEND_API_KEY) return new Response(JSON.stringify({ ok: false, msg: "\u90AE\u4EF6\u670D\u52A1\u672A\u914D\u7F6E" }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const tok = randomToken();
      await TVKV.put("share_reset_" + tok, "1", { expirationTtl: 900 });
      const origin = new URL(request.url).origin;
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "HuanLe Tools <onboarding@resend.dev>",
          to: [saved],
          subject: "\u3010\u6587\u4EF6\u5171\u4EAB\u7AD9\u3011\u91CD\u7F6E\u540E\u53F0\u5BC6\u7801",
          html: `<div style="font-family:sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #DFE4EC;border-radius:12px">
<h2 style="color:#14213D">\u{1F4C1} \u6587\u4EF6\u5171\u4EAB\u7AD9 \xB7 \u91CD\u7F6E\u540E\u53F0\u5BC6\u7801</h2>
<p style="color:#5B6577;font-size:14px">\u60A8\u7533\u8BF7\u91CD\u7F6E tl.efcc.cc/share \u540E\u53F0\u7684\u767B\u5F55\u5BC6\u7801\u3002\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u8BBE\u7F6E\u65B0\u5BC6\u7801\uFF0815 \u5206\u949F\u5185\u6709\u6548\uFF0C\u7528\u4E00\u6B21\u4F5C\u5E9F\uFF09\uFF1A</p>
<p style="text-align:center;margin:18px 0"><a href="${origin}/share/__admin/reset?tok=${tok}" style="background:#D9A521;color:#14213D;padding:12px 26px;border-radius:9px;text-decoration:none;font-weight:bold;display:inline-block">\u70B9\u6B64\u8BBE\u7F6E\u65B0\u5BC6\u7801</a></p>
<p style="color:#8B93A6;font-size:12px">\u5982\u975E\u672C\u4EBA\u64CD\u4F5C\uFF0C\u5FFD\u7565\u672C\u90AE\u4EF6\u5373\u53EF\uFF08\u73B0\u6709\u5BC6\u7801\u4E0D\u53D8\uFF09\u3002\u6587\u4EF6\u63D0\u53D6\u7801\u4E0D\u53D7\u5F71\u54CD\u3002</p></div>`
        })
      });
      if (!r.ok) return new Response(JSON.stringify({ ok: false, msg: "\u90AE\u4EF6\u53D1\u9001\u5931\u8D25" }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      return new Response(JSON.stringify({ ok: true, msg: "\u91CD\u7F6E\u90AE\u4EF6\u5DF2\u53D1\u9001\u5230 " + saved }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/reset" && request.method === "GET") {
      const q2 = new URL(request.url).searchParams;
      const tok = q2.get("tok") || "";
      if (!tok || !await TVKV.get("share_reset_" + tok)) return new Response("<!DOCTYPE html><meta charset=utf-8><body style='font-family:sans-serif;text-align:center;padding:60px;color:#5B6577'>\u94FE\u63A5\u65E0\u6548\u6216\u5DF2\u8FC7\u671F</body>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      return new Response(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>\u91CD\u7F6E\u5171\u4EAB\u7AD9\u540E\u53F0\u5BC6\u7801</title><style>
body{font-family:"Microsoft YaHei",sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#14213D,#2A4370);}
.box{background:rgba(255,255,255,.06);border:1px solid rgba(217,165,33,.35);border-radius:16px;padding:36px 30px;width:min(92vw,400px);text-align:center;}
h1{color:#fff;font-size:19px;margin-bottom:16px;}p{color:rgba(255,255,255,.55);font-size:13px;margin-bottom:14px;}
input{width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:15px;margin-bottom:12px;outline:none;text-align:center;}
button{width:100%;padding:12px;border:none;border-radius:10px;cursor:pointer;font-size:15px;font-weight:bold;background:linear-gradient(135deg,#D9A521,#E8BC4F);color:#14213D;}
</style></head><body><a href="/share/admin.html" style="position:fixed;top:12px;right:14px;font-size:14px;color:rgba(255,255,255,.55);text-decoration:none;border:1px solid rgba(255,255,255,.2);padding:7px 14px;border-radius:99px;background:rgba(255,255,255,.07)">\u2699\uFE0F \u540E\u53F0\u7BA1\u7406</a><div class="box"><h1>\u{1F511} \u91CD\u7F6E\u5171\u4EAB\u7AD9\u540E\u53F0\u5BC6\u7801</h1>
<form method="POST" action="/share/__admin/reset?tok=${tok}">
<input type="password" name="new" placeholder="\u65B0\u5BC6\u7801\uFF08\u81F3\u5C116\u4F4D\uFF09" minlength="6" required>
<button type="submit">\u4FDD\u5B58\u65B0\u5BC6\u7801</button></form></div></body></html>`, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (pathname === "/share/__admin/reset" && request.method === "POST") {
      const q2 = new URL(request.url).searchParams;
      const tok = q2.get("tok") || "";
      const fd = await request.formData();
      const nw = (fd.get("new") || "").trim();
      if (nw.length < 6) return new Response("\u65B0\u5BC6\u7801\u81F3\u5C116\u4F4D", { status: 400 });
      if (!await TVKV.get("share_reset_" + tok)) return new Response("<!DOCTYPE html><meta charset=utf-8><body style='font-family:sans-serif;text-align:center;padding:60px'>\u94FE\u63A5\u5DF2\u5931\u6548</body>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      await TVKV.delete("share_reset_" + tok);
      await TVKV.put("share_admin_pw", await sha256Hex(nw));
      return new Response("<!DOCTYPE html><meta charset=utf-8><meta http-equiv='refresh' content='2;url=/share/admin.html'><body style='font-family:sans-serif;text-align:center;padding:60px;color:#2E7D4F'>\u2705 \u65B0\u5BC6\u7801\u5DF2\u751F\u6548\uFF0C\u6B63\u5728\u8DF3\u8F6C\u767B\u5F55\u9875\u2026</body>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (pathname === "/share/__admin/codes" && request.method === "GET") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let codes = [];
      try {
        codes = JSON.parse(await TVKV.get("share_codes") || "[]");
      } catch (e) {
        codes = [];
      }
      return new Response(JSON.stringify({ ok: true, codes }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/code-save" && request.method === "POST") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const pw = (fd.get("pw") || "").trim();
      const file = (fd.get("file") || "").trim();
      const kind = fd.get("kind") === "del" ? "del" : "dl";
      if (kind === "del" && file === "*") return new Response(JSON.stringify({ ok: false, msg: "\u5220\u9664\u7801\u4E0D\u80FD\u8BBE\u6210\u603B\u7801\u2014\u2014\u5FC5\u987B\u7ED1\u5B9A\u5177\u4F53\u6587\u4EF6" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let hours = parseFloat(fd.get("hours") || "0") || 0;
      let exp = hours > 0 ? Date.now() + hours * 3600 * 1e3 : 0;
      if (hours === -1) {
        const m3 = await shareMetaAll();
        const fid3 = String(fd.get("file") || "");
        const rec3 = m3[fid3] || m3[fid3.split("/").pop()];
        exp = rec3 && rec3.exp ? rec3.exp : 0;
        hours = 0;
      }
      if (!pw || pw.length < 1 || pw.length > 30) return new Response(JSON.stringify({ ok: false, msg: "\u63D0\u53D6\u7801\u987B\u4E3A1-30\u4F4D" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      if (!file) return new Response(JSON.stringify({ ok: false, msg: "\u987B\u6307\u5B9A\u6587\u4EF6\uFF08* \u4E3A\u5168\u90E8\uFF09" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let codes = [];
      try {
        codes = JSON.parse(await TVKV.get("share_codes") || "[]");
      } catch (e) {
        codes = [];
      }
      codes = codes.filter((c) => c.pw !== pw);
      codes = codes.filter((c) => !(c.file === file && c.kind === kind && c.pw !== pw));
      codes.push({ pw, file, kind, exp, expText: hours > 0 ? hours >= 48 ? Math.round(hours / 24) + "\u5929" : hours + "\u5C0F\u65F6" : "\u6C38\u4E45" });
      await TVKV.put("share_codes", JSON.stringify(codes));
      return new Response(JSON.stringify({ ok: true, msg: (kind === "del" ? "\u5220\u9664\u7801" : "\u63D0\u53D6\u7801") + "\u5DF2\u4FDD\u5B58\uFF1A" + pw + " \u2192 " + (file === "*" ? "\u5168\u90E8\u6587\u4EF6" : file) + (hours > 0 ? "\uFF08" + (hours >= 48 ? Math.round(hours / 24) + "\u5929\u540E" : hours + "\u5C0F\u65F6\u540E") + "\u5931\u6548\uFF09" : "\uFF08\u6C38\u4E45\uFF09") }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/code-del" && request.method === "POST") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const pw = (fd.get("pw") || "").trim();
      let codes = [];
      try {
        codes = JSON.parse(await TVKV.get("share_codes") || "[]");
      } catch (e) {
        codes = [];
      }
      codes = codes.filter((c) => c.pw !== pw);
      await TVKV.put("share_codes", JSON.stringify(codes));
      return new Response(JSON.stringify({ ok: true, msg: "\u7801\u5DF2\u5220\u9664\uFF1A" + pw }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/files" && request.method === "GET") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const swept = await shareSweepExpired(env);
      const L = await davList(env);
      if (L.err) return new Response(JSON.stringify({ ok: false, msg: L.err }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let codes = [];
      try {
        codes = JSON.parse(await TVKV.get("share_codes") || "[]");
      } catch (e) {
        codes = [];
      }
      const meta = await shareMetaEnsure(L.files);
      return new Response(JSON.stringify({ ok: true, files: L.files, codes, meta, swept, defaultDays: await shareDefaultDays() }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/set-default-expiry" && request.method === "POST") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const days = parseInt(fd.get("days") || "", 10);
      if (!days || days < 1 || days > 3650) return new Response(JSON.stringify({ ok: false, msg: "\u5929\u6570\u987B\u4E3A 1-3650 \u7684\u6574\u6570" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      await TVKV.put("share_default_days", String(days));
      return new Response(JSON.stringify({ ok: true, msg: "\u65B0\u6587\u4EF6\u9ED8\u8BA4\u6709\u6548\u671F\u5DF2\u8BBE\u4E3A " + days + " \u5929" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/notice" && request.method === "GET") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const txt = await TVKV.get("share_notice");
      return new Response(JSON.stringify({ ok: true, notice: txt || "" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/notice-save" && request.method === "POST") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const txt = (fd.get("notice") || "").slice(0, 2e3);
      await TVKV.put("share_notice", txt);
      return new Response(JSON.stringify({ ok: true, msg: "\u4E0A\u4F20\u987B\u77E5\u5DF2\u4FDD\u5B58\uFF08\u524D\u53F0 /share/up \u5373\u65F6\u751F\u6548\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/set-expiry" && request.method === "POST") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const fid = (fd.get("fid") || "").trim();
      const days = Math.max(0, Math.min(3650, parseInt(fd.get("days") || "", 10) || 0));
      if (!fid) return new Response(JSON.stringify({ ok: false, msg: "\u7F3A\u6587\u4EF6\u6807\u8BC6" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      await shareMetaSet(fid, days);
      return new Response(JSON.stringify({ ok: true, msg: days === 0 ? "\u5DF2\u8BBE\u4E3A\u6C38\u4E45\u4FDD\u5B58\uFF08\u4E0D\u518D\u81EA\u52A8\u6E05\u7406\uFF09" : "\u5DF2\u5EF6\u957F\u81F3 " + days + " \u5929\u540E\u81EA\u52A8\u5220\u9664" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/upload" && request.method === "POST") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const f = fd.get("file");
      if (!f || !f.name) return new Response(JSON.stringify({ ok: false, msg: "\u672A\u9009\u62E9\u6587\u4EF6" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let name = (fd.get("name") || f.name || "").trim().slice(0, 80);
      if (!name || /[\/\\]/.test(name)) return new Response(JSON.stringify({ ok: false, msg: "\u6587\u4EF6\u540D\u4E0D\u5408\u6CD5" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const M = await davEnsureMonth(env);
      if (M.err) return new Response(JSON.stringify({ ok: false, msg: M.err }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const r = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(M.dir) + "/" + encodeURIComponent(name), {
        method: "PUT",
        headers: { "Authorization": "Basic " + M.auth },
        body: f.stream()
      });
      if (r.status !== 201 && r.status !== 204) return new Response(JSON.stringify({ ok: false, msg: "\u4E0A\u4F20\u5931\u8D25\uFF08123 \u8FD4\u56DE " + r.status + "\uFF09" }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let usedA = parseInt(await TVKV.get("share_used_bytes") || "0", 10);
      await TVKV.put("share_used_bytes", String(usedA + f.size));
      await shareMetaSet(M.dir + "/" + name, await shareDefaultDays());
      return new Response(JSON.stringify({ ok: true, msg: "\u5DF2\u4E0A\u4F20\uFF1A" + name + " \u2192 \u5F52\u6863 " + M.dir + "\uFF08" + Math.round(f.size / 1024) + " KB\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/rename" && request.method === "POST") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const from = (fd.get("from") || "").trim();
      const to = (fd.get("to") || "").trim().slice(0, 100);
      const FID_RE = /^(?:20\d{2}\/(?:0[1-9]|1[0-2])\/)?[^\/]+$/;
      if (!from || !to || from.indexOf("..") >= 0 || to.indexOf("..") >= 0 || !FID_RE.test(from) || !FID_RE.test(to)) return new Response(JSON.stringify({ ok: false, msg: "\u53C2\u6570\u4E0D\u5408\u6CD5" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const creds = await davCreds(env);
      if (!creds) return new Response(JSON.stringify({ ok: false, msg: "\u540E\u53F0\u672A\u914D\u7F6E" }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const auth = btoa(creds.account + ":" + creds.password);
      const r = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(from), {
        method: "MOVE",
        headers: { "Authorization": "Basic " + auth, "Destination": "https://webdav.123pan.cn/webdav/" + davSeg(to) }
      });
      if (r.status !== 201 && r.status !== 204) return new Response(JSON.stringify({ ok: false, msg: "\u6539\u540D\u5931\u8D25\uFF08" + r.status + "\uFF09" }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let codes = [];
      try {
        codes = JSON.parse(await TVKV.get("share_codes") || "[]");
      } catch (e) {
        codes = [];
      }
      let moved = 0;
      codes.forEach((c) => {
        if (c.file === from) {
          c.file = to;
          moved++;
        } else if (String(c.file || "").indexOf(from + "/") === 0) {
          c.file = to + c.file.slice(from.length);
          moved++;
        }
      });
      if (moved) await TVKV.put("share_codes", JSON.stringify(codes));
      try {
        const m1 = await shareMetaAll();
        let mmoved = 0;
        Object.keys(m1).forEach((k) => {
          if (k === from) {
            m1[to] = m1[k];
            delete m1[k];
            mmoved++;
          } else if (k.indexOf(from + "/") === 0) {
            m1[to + k.slice(from.length)] = m1[k];
            delete m1[k];
            mmoved++;
          }
        });
        if (mmoved) await TVKV.put("share_file_meta", JSON.stringify(m1));
      } catch (e) {
      }
      return new Response(JSON.stringify({ ok: true, msg: "\u5DF2\u6539\u540D\uFF1A" + from + " \u2192 " + to + (moved ? "\uFF08\u63D0\u53D6\u7801\u5DF2\u540C\u6B65\uFF09" : "") }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/delete" && request.method === "POST") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const name = (fd.get("name") || "").trim();
      if (!name || name.indexOf("..") >= 0 || !/^(?:20\d{2}\/(?:0[1-9]|1[0-2])\/)?[^\/]+$/.test(name)) return new Response(JSON.stringify({ ok: false, msg: "\u53C2\u6570\u4E0D\u5408\u6CD5" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const creds = await davCreds(env);
      if (!creds) return new Response(JSON.stringify({ ok: false, msg: "\u540E\u53F0\u672A\u914D\u7F6E" }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const auth = btoa(creds.account + ":" + creds.password);
      const r = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(name), {
        method: "DELETE",
        headers: { "Authorization": "Basic " + auth }
      });
      if (r.status !== 204 && r.status !== 200 && r.status !== 404) return new Response(JSON.stringify({ ok: false, msg: "\u5220\u9664\u5931\u8D25\uFF08" + r.status + "\uFF09" }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let codes = [];
      try {
        codes = JSON.parse(await TVKV.get("share_codes") || "[]");
      } catch (e) {
        codes = [];
      }
      const before = codes.length;
      codes = codes.filter((c) => c.file !== name && (c.file || "").split("/").pop() !== String(name).split("/").pop());
      if (codes.length !== before) await TVKV.put("share_codes", JSON.stringify(codes));
      try {
        const m1 = await shareMetaAll();
        if (m1[name]) {
          delete m1[name];
          await TVKV.put("share_file_meta", JSON.stringify(m1));
        }
      } catch (e) {
      }
      try {
        const L0 = await davList(env);
        if (!L0.err) {
          let total = 0;
          L0.files.forEach((x) => total += x.size || 0);
          await TVKV.put("share_used_bytes", String(total));
        }
      } catch (e) {
      }
      return new Response(JSON.stringify({ ok: true, msg: "\u5DF2\u5220\u9664\uFF1A" + name }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/rmdir" && request.method === "POST") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const dir = (fd.get("dir") || "").trim();
      if (!dir || dir.indexOf("..") >= 0 || !/^(?:20\d{2}\/(?:0[1-9]|1[0-2])(?:\/[^\/]+)*|[^\/]+)$/.test(dir)) return new Response(JSON.stringify({ ok: false, msg: "\u53C2\u6570\u4E0D\u5408\u6CD5" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const creds = await davCreds(env);
      if (!creds) return new Response(JSON.stringify({ ok: false, msg: "\u540E\u53F0\u672A\u914D\u7F6E" }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const auth = btoa(creds.account + ":" + creds.password);
      const r = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(dir) + "/", { method: "DELETE", headers: { "Authorization": "Basic " + auth } });
      if (r.status !== 204 && r.status !== 200 && r.status !== 404) return new Response(JSON.stringify({ ok: false, msg: "\u5220\u6587\u4EF6\u5939\u5931\u8D25\uFF08" + r.status + "\uFF09" }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      let codes = [];
      try {
        codes = JSON.parse(await TVKV.get("share_codes") || "[]");
      } catch (e) {
        codes = [];
      }
      const b4 = codes.length;
      codes = codes.filter((c) => !((c.file || "") + "/").startsWith(dir + "/"));
      if (codes.length !== b4) await TVKV.put("share_codes", JSON.stringify(codes));
      try {
        const m1 = await shareMetaAll();
        let dirty = false;
        for (const k2 of Object.keys(m1)) if ((k2 + "/").startsWith(dir + "/")) {
          delete m1[k2];
          dirty = true;
        }
        if (dirty) await TVKV.put("share_file_meta", JSON.stringify(m1));
      } catch (e) {
      }
      try {
        const L0 = await davList(env);
        if (!L0.err) {
          let t2 = 0;
          L0.files.forEach((x) => t2 += x.size || 0);
          await TVKV.put("share_used_bytes", String(t2));
        }
      } catch (e) {
      }
      return new Response(JSON.stringify({ ok: true, msg: "\u6587\u4EF6\u5939\u53CA\u5185\u90E8\u5168\u90E8\u6587\u4EF6\u5DF2\u5220\u9664" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/copymove-check" && request.method === "POST") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const from = (fd.get("from") || "").trim();
      const toDir = (fd.get("toDir") || "").trim();
      if (!from || from.indexOf("..") >= 0) return new Response(JSON.stringify({ ok: false, msg: "\u53C2\u6570\u4E0D\u5408\u6CD5" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const L = await davList(env);
      if (L.err) return new Response(JSON.stringify({ ok: false, msg: L.err }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const base = from.split("/").pop();
      const dest = (toDir ? toDir + "/" : "") + base;
      const isDir = !L.files.some((x) => x.path + "/" + x.name === from);
      const inDir = /* @__PURE__ */ __name(function(p, d) {
        return p === d || p.indexOf(d + "/") === 0;
      }, "inDir");
      const dup = isDir ? L.files.some((x) => inDir(x.path || "", dest)) : L.files.some((x) => (x.path ? x.path + "/" + x.name : x.name) === dest);
      let sug = base, n2 = 0;
      if (dup) {
        while (n2 < 99) {
          n2++;
          const dot = base.lastIndexOf(".");
          const stem = dot > 0 ? base.slice(0, dot) : base;
          const ext = dot > 0 ? base.slice(dot) : "";
          const cand = stem + "(" + n2 + ")" + ext;
          const cd = (toDir ? toDir + "/" : "") + cand;
          const taken = isDir ? L.files.some((x) => inDir(x.path || "", cd)) : L.files.some((x) => (x.path ? x.path + "/" + x.name : x.name) === cd);
          if (!taken) {
            sug = cand;
            break;
          }
        }
      }
      return new Response(JSON.stringify({ ok: true, dup, dest, sug }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share/__admin/copymove" && request.method === "POST") {
      if (!await okShareAdmin(env)) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const from = (fd.get("from") || "").trim();
      const toDir = (fd.get("toDir") || "").trim();
      const mode = fd.get("mode") === "copy" ? "copy" : "move";
      if (!from || from.indexOf("..") >= 0 || toDir.indexOf("..") >= 0) return new Response(JSON.stringify({ ok: false, msg: "\u53C2\u6570\u4E0D\u5408\u6CD5" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const creds = await davCreds(env);
      if (!creds) return new Response(JSON.stringify({ ok: false, msg: "\u540E\u53F0\u672A\u914D\u7F6E" }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const auth = btoa(creds.account + ":" + creds.password);
      const segs = toDir ? toDir.split("/") : [];
      let acc = "";
      for (const s2 of segs) {
        acc = acc ? acc + "/" + s2 : s2;
        const mk = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(acc), { method: "MKCOL", headers: { "Authorization": "Basic " + auth } });
        if (mk.status !== 201 && mk.status !== 405 && mk.status !== 200) return new Response(JSON.stringify({ ok: false, msg: "\u5EFA\u76EE\u6807\u76EE\u5F55\u5931\u8D25\uFF08" + mk.status + "\uFF09" }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      }
      const base = (fd.get("newName") || from.split("/").pop()).trim().slice(0, 100);
      if (!base || /[\\/:*?"<>|]/.test(base)) return new Response(JSON.stringify({ ok: false, msg: "\u65B0\u540D\u4E0D\u5408\u6CD5" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const dest = (toDir ? toDir + "/" : "") + base;
      if (mode === "copy") {
        const err = await davCopyAny(auth, from, dest);
        if (err) return new Response(JSON.stringify({ ok: false, msg: "\u590D\u5236\u5931\u8D25\uFF1A" + err }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      } else {
        const r = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(from), {
          method: "MOVE",
          headers: { "Authorization": "Basic " + auth, "Destination": "https://webdav.123pan.cn/webdav/" + davSeg(dest), "Overwrite": "F" }
        });
        if (r.status !== 201 && r.status !== 204 && r.status !== 200) return new Response(JSON.stringify({ ok: false, msg: "\u79FB\u52A8\u5931\u8D25\uFF08" + r.status + "\uFF09\u2014\u2014\u76EE\u6807\u53EF\u80FD\u5DF2\u5B58\u5728" }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      }
      let codes = [];
      try {
        codes = JSON.parse(await TVKV.get("share_codes") || "[]");
      } catch (e) {
        codes = [];
      }
      if (mode === "move") {
        let hitN = 0;
        for (const c of codes) {
          if (c.file === from || ((c.file || "") + "/").startsWith(from + "/")) {
            c.file = dest + c.file.slice(from.length);
            hitN++;
          }
        }
        if (hitN) await TVKV.put("share_codes", JSON.stringify(codes));
        try {
          const m1 = await shareMetaAll();
          let dirty = false;
          for (const k2 of Object.keys(m1)) if (k2 === from || (k2 + "/").startsWith(from + "/")) {
            m1[dest + k2.slice(from.length)] = m1[k2];
            delete m1[k2];
            dirty = true;
          }
          if (dirty) await TVKV.put("share_file_meta", JSON.stringify(m1));
        } catch (e) {
        }
        return new Response(JSON.stringify({ ok: true, msg: "\u5DF2\u79FB\u52A8\u5230 " + (toDir || "\u6839\u76EE\u5F55") + "\uFF08\u7801\u8DDF\u7740\u8D70\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      }
      const src = codes.filter((c) => c.file === from || ((c.file || "") + "/").startsWith(from + "/"));
      const adds = [];
      for (const c of src) {
        let n = 1, cand;
        while (true) {
          cand = c.pw + "-" + (n < 10 ? "0" + n : n);
          if (!codes.some((x) => x.pw === cand) && !adds.some((x) => x.pw === cand)) break;
          n++;
          if (n > 99) break;
        }
        adds.push({ pw: cand, file: dest + c.file.slice(from.length), kind: c.kind, exp: c.exp || 0, expText: c.expText || "\u6C38\u4E45" });
      }
      if (adds.length) {
        codes = codes.concat(adds);
        await TVKV.put("share_codes", JSON.stringify(codes));
      }
      return new Response(JSON.stringify({ ok: true, msg: "\u5DF2\u590D\u5236\u5230 " + (toDir || "\u6839\u76EE\u5F55") + (adds.length ? "\uFF08\u65B0\u7801 " + adds[0].pw + " \u7B49 " + adds.length + " \u4E2A\u5DF2\u751F\u6210\uFF09" : "\uFF08\u6E90\u6587\u4EF6\u672A\u8BBE\u7801\uFF09") }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/__admin/set-password" && request.method === "POST") {
      if (!session || session.role !== "master") return new Response(JSON.stringify({ ok: false, msg: "\u8FDB\u5165\u5BC6\u7801\uFF08\u603B\u7BA1\u7406\u5458\u5BC6\u7801\uFF09\u53EA\u6709\u603B\u7BA1\u7406\u5458\u672C\u4EBA\u53EF\u4EE5\u4FEE\u6539\u2014\u2014\u7A0B\u5E8F\u7BA1\u7406\u5458\u8BF7\u8054\u7CFB\u603B\u7BA1\u7406\u5458" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      const nw = fd.get("new") || "";
      if (nw.length < 1) return new Response(JSON.stringify({ ok: false, msg: "\u65B0\u5BC6\u7801\u81F3\u5C11 1 \u4F4D\uFF08\u5EFA\u8BAE 6 \u4F4D\u4EE5\u4E0A\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const target = fd.get("door") || "station";
      if (target !== "station" && target !== "platform" && target !== "sports") return new Response(JSON.stringify({ ok: false, msg: "\u95E8\u724C\u4E0D\u5BF9" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      await TVKV.put("pw_hash_" + target, await sha256Hex(nw));
      const DN = { station: "\u5DE5\u5177\u7AD9\u540E\u53F0", platform: "\u7A0B\u5E8F\u5236\u4F5C\u5E73\u53F0", sports: "\u8FD0\u52A8\u4F1A\u7BA1\u7406\u5458" };
      return new Response(JSON.stringify({ ok: true, msg: DN[target] + "\u7684\u5BC6\u7801\u5DF2\u6539\u2014\u2014\u8FD9\u6247\u95E8\u7684\u6240\u6709\u8BBE\u5907\u9700\u7528\u65B0\u5BC6\u7801\u91CD\u65B0\u767B\u5F55\uFF08\u53E6\u4E24\u6247\u95E8\u4E0D\u53D7\u5F71\u54CD\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/soft/__admin/set-nav" && request.method === "POST") {
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, msg: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const fd = await request.formData();
      let nav;
      try {
        nav = JSON.parse(fd.get("nav") || "[]");
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, msg: "\u6570\u636E\u683C\u5F0F\u9519\u8BEF" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (!Array.isArray(nav) || nav.length < 1 || nav.length > 6) return new Response(JSON.stringify({ ok: false, msg: "\u5BFC\u822A\u6309\u94AE 1-6 \u4E2A" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      for (const n of nav) if (!n.text || !n.href) return new Response(JSON.stringify({ ok: false, msg: "\u6BCF\u4E2A\u6309\u94AE\u90FD\u8981\u6709\u6587\u5B57\u548C\u5730\u5740" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      await TVKV.put("nav_json", JSON.stringify(nav));
      return new Response(JSON.stringify({ ok: true, msg: "\u5BFC\u822A\u5DF2\u66F4\u65B0\uFF0C\u9996\u9875 1 \u5206\u949F\u5185\u751F\u6548" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/tool/__auth/token-backup" && request.method === "POST") {
      const fd = await request.formData();
      const tok = (fd.get("token") || "").trim();
      if (!/^github_pat_[A-Za-z0-9_]{30,}$/.test(tok)) return new Response(JSON.stringify({ ok: false, msg: "\u4EE4\u724C\u683C\u5F0F\u4E0D\u5BF9" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      const probe = await fetch("https://api.github.com/repos/zhufenghua313/33/contents/", { headers: { "Authorization": "Bearer " + tok, "User-Agent": "tl-worker" } });
      if (probe.status !== 200) return new Response(JSON.stringify({ ok: false, msg: "\u4EE4\u724C\u65E0\u6548\uFF08GitHub \u62D2\u7EDD\uFF09\uFF0C\u672A\u5907\u4EFD" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      await TVKV.put("gh_backup_token", JSON.stringify({ token: tok, note: "GitHub\u7BA1\u7406\u5E73\u53F0\u4EE4\u724C\u5907\u4EFD\uFF08\u767B\u5F55\u6210\u529F\u81EA\u52A8\u66F4\u65B0\uFF09", savedAt: (/* @__PURE__ */ new Date()).toISOString() }));
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (pathname === "/share" || pathname === "/share/" || pathname.startsWith("/share/dl/") || pathname === "/share/up" || pathname === "/share/code-change") {
      try {
        await shareSweepExpired(env);
      } catch (e) {
      }
      if (pathname === "/share/code-change" && request.method === "POST") {
        const fd = await request.formData();
        const oldDel = (fd.get("oldDel") || "").trim();
        const newDl = (fd.get("newDl") || "").trim();
        const newDel = (fd.get("newDel") || "").trim();
        const jout = /* @__PURE__ */ __name((ok, msg) => new Response(JSON.stringify({ ok, msg }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }), "jout");
        if (!oldDel || !newDl || !newDel) return jout(false, "\u53C2\u6570\u4E0D\u5B8C\u6574");
        if (newDl.length > 30 || newDel.length > 30) return jout(false, "\u7801\u987B\u4E3A1-30\u4F4D");
        if (newDl === newDel) return jout(false, "\u63D0\u53D6\u7801\u548C\u5220\u9664\u7801\u4E0D\u80FD\u76F8\u540C");
        let codes = [];
        try {
          codes = JSON.parse(await TVKV.get("share_codes") || "[]");
        } catch (e) {
          codes = [];
        }
        const delHit = codes.find((c) => c.pw === oldDel && c.kind === "del");
        if (!delHit) return jout(false, "\u5F53\u524D\u5220\u9664\u7801\u4E0D\u6B63\u786E");
        const fid = delHit.file;
        if (codes.some((c) => c.pw === newDl && c.file !== fid)) return jout(false, "\u65B0\u63D0\u53D6\u7801\u5DF2\u88AB\u5176\u4ED6\u6587\u4EF6\u5360\u7528");
        if (codes.some((c) => c.pw === newDel && c.file !== fid)) return jout(false, "\u65B0\u5220\u9664\u7801\u5DF2\u88AB\u5176\u4ED6\u6587\u4EF6\u5360\u7528");
        let n = 0;
        for (const c of codes) {
          if (c.file === fid && c.kind === "dl") {
            c.pw = newDl;
            n++;
          }
          if (c.file === fid && c.kind === "del") {
            c.pw = newDel;
            n++;
          }
        }
        if (n < 2) return jout(false, "\u8BE5\u6587\u4EF6\u7684\u7801\u4E0D\u5B8C\u6574\u2014\u2014\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u540E\u53F0\u8865");
        await TVKV.put("share_codes", JSON.stringify(codes));
        return jout(true, "\u4E24\u7801\u5DF2\u66F4\u65B0");
      }
      const q = new URL(request.url).searchParams;
      const t = q.get("t") || "";
      async function mkShareToken(env2, fileName) {
        const exp = Date.now() + 2 * 3600 * 1e3;
        const f = fileName || "*";
        const sig = await hmacHex(await getPwHash(env2, "station"), "share:" + exp + ":" + f);
        return exp + "." + f + "." + sig;
      }
      __name(mkShareToken, "mkShareToken");
      async function okShareToken(env2, t2) {
        if (!t2) return null;
        const firstDot = t2.indexOf(".");
        const lastDot = t2.lastIndexOf(".");
        if (firstDot < 0 || lastDot <= firstDot) return null;
        const exp = parseInt(t2.slice(0, firstDot), 10);
        const file = t2.slice(firstDot + 1, lastDot);
        const sig = t2.slice(lastDot + 1);
        if (!exp || !sig || Date.now() > exp) return null;
        if (sig !== await hmacHex(await getPwHash(env2, "station"), "share:" + exp + ":" + file)) return null;
        return { file: file === "*" ? "*" : file };
      }
      __name(okShareToken, "okShareToken");
      const pageCSS = `:root{--deep:#14213D;--gold:#D9A521;--goldL:#E8BC4F;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:"Microsoft YaHei",sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#14213D 0%,#1B2A4A 55%,#2A4370 100%);}
.box{background:rgba(255,255,255,.06);border:1px solid rgba(217,165,33,.35);border-radius:16px;padding:36px 30px;width:min(94vw,460px);box-shadow:0 18px 50px rgba(0,0,0,.4);backdrop-filter:blur(8px);}
h1{color:#fff;font-size:30px;margin-bottom:10px;text-align:center;}
p{color:rgba(255,255,255,.7);font-size:17px;margin-bottom:18px;text-align:center;line-height:1.9;}
input{width:100%;padding:15px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:19px;margin-bottom:14px;outline:none;text-align:center;letter-spacing:1px;}
input:focus{border-color:var(--gold);}
button{width:100%;padding:15px;border:none;border-radius:10px;cursor:pointer;font-size:18px;font-weight:bold;background:linear-gradient(135deg,var(--gold),var(--goldL));color:#14213D;}
.err{color:#E88;margin-bottom:12px;font-size:16.5px;text-align:center;}
.file{display:flex;align-items:center;flex-wrap:wrap;row-gap:8px;gap:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:14px 16px;margin-bottom:10px;}/*v6.9e:\u5141\u8BB8\u6362\u884C*/
.file .fi{width:34px;height:34px;flex:0 0 34px;font-size:24px;line-height:1;overflow:hidden;display:flex;align-items:center;justify-content:center;}/*v6.9c:\u56FE\u6807\u52A0\u786C\u5C3A\u5BF8\u7262\u7B3C\u2014\u2014MuMu\u7684WebView\u5B57\u4F53\u628Aemoji\u6491\u7206\u5BFC\u81F4\u6324\u538B\u6587\u4EF6\u540D*/
input[type=checkbox]{width:19px;height:19px;padding:0;margin:0 4px 0 0;flex-shrink:0;text-align:left;accent-color:#E8BC4F;}/*v6.9d:\u590D\u9009\u6846\u514D\u75AB\u5168\u5BBDinput\u6837\u5F0F\u2014\u2014\u771F\u51F6\u662F\u5B83355px\u5BBD\u5403\u6389\u6574\u884C*/
.file .fn{flex:1 1 120px;min-width:0;overflow:hidden;}.file a,.file button{white-space:nowrap;flex-shrink:0;width:auto;}/*v6.9f:\u884C\u5185\u5C0F\u6309\u94AE\u514D\u75AB\u5168\u5C40button{width:100%}\u2014\u2014\u540C\u590D\u9009\u6846\u75C5\u6839*/
.file .fn b{color:#fff;font-size:18px;display:block;word-break:break-all;}
.file .fn span{color:rgba(255,255,255,.6);font-size:15px;}
.file a{flex-shrink:0;display:inline-block;padding:11px 20px;border-radius:9px;background:linear-gradient(135deg,var(--gold),var(--goldL));color:#14213D;font-weight:700;font-size:16.5px;text-decoration:none;}
.note{color:rgba(255,255,255,.55);font-size:15px;margin-top:16px;text-align:center;line-height:1.8;}`;
      if (pathname === "/share/up") {
        const upPage = /* @__PURE__ */ __name((msg, err) => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>\u6587\u4EF6\u5206\u4EAB\u7AD9 \xB7 \u5206\u4EAB\u6587\u4EF6</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2316233b'/%3E%3Cpath d='M13 21a4 4 0 0 1 4-4h10.5l4.5 5.5H47a4 4 0 0 1 4 4V43a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z' fill='%23E8BC4F'/%3E%3Cpath d='M13 27h38' stroke='%2316233b' stroke-width='1.6' opacity='.35'/%3E%3C/svg%3E"/><style>${pageCSS}</style></head><body><div class="box" style="width:min(94vw,440px)">
<h1>\u{1F4E4} \u5206\u4EAB\u6587\u4EF6</h1>
${err ? `<div class="err">${err}</div>` : msg || ""}
<form method="POST" action="/share/up" enctype="multipart/form-data" id="upForm">
<input type="file" name="file" id="fileInput" style="display:none" multiple>
<div id="filePick" style="padding:18px 14px;border:2px dashed rgba(232,188,79,.45);border-radius:12px;text-align:center;font-size:17px;color:#E8BC4F;cursor:pointer;margin-bottom:4px;background:rgba(232,188,79,.06)">\u{1F4C4} \u70B9\u51FB\u9009\u62E9\u6587\u4EF6</div>
<input type="text" name="dlPw" placeholder="\u63D0\u53D6\u7801\uFF08\u7559\u7A7A\u81EA\u52A8\u751F\u6210\uFF09\xB7 \u4E0B\u8F7D\u7528" maxlength="30">
<input type="text" name="delPw" placeholder="\u5220\u9664\u7801\uFF08\u7559\u7A7A\u81EA\u52A8\u751F\u6210\uFF09\xB7 \u5220\u9664\u7528" maxlength="30">
<div class="err" id="upErr" style="display:none"></div>
<button type="submit" id="upBtn">\u4E0A \u4F20</button>
<a href="/share" id="backBtn" style="display:block;text-align:center;padding:11px;margin-top:8px;border-radius:10px;border:1px solid rgba(255,255,255,.25);color:rgba(255,255,255,.75);text-decoration:none;font-size:16px">\u2190 \u8FD4\u56DE\u6587\u4EF6\u5206\u4EAB\u7AD9\u4E3B\u9875</a>
<div id="prog" style="display:none;margin-top:12px">
<div style="background:rgba(255,255,255,.1);border-radius:99px;height:14px;overflow:hidden;position:relative">
<div id="progBar" style="width:0%;height:100%;background:linear-gradient(90deg,#D9A521,#E8BC4F);border-radius:99px;transition:width .4s"></div>
<span id="progTxt" style="position:absolute;inset:0;text-align:center;font-size:10.5px;line-height:14px;color:#fff;letter-spacing:.5px">0%</span>
</div>
<div id="progSub" style="text-align:center;font-size:11px;color:rgba(255,255,255,.5);margin-top:5px"></div>
</div>
</form>
<script>
(function(){
  var f=document.getElementById("upForm");
  if(!f||!f.addEventListener)return;
  var fp=document.getElementById("filePick"),fi=document.getElementById("fileInput");
  if(fp&&fi){
    fp.addEventListener("click",function(){fi.click();});
    fi.addEventListener("change",function(){
      var n=fi.files.length,f2=fi.files[0];
      /* v4.56\uFF1A\u591A\u6587\u4EF6=\u7801\u6839\u6A21\u5F0F\u2014\u2014\u586B666\u81EA\u52A8\u751F\u6210666-01/666-02\u2026\uFF08\u7AD9\u957F13:33"\u6279\u91CF\u6DFB\u52A0\u66F4\u7701\u52B2"\uFF09 */
      try{
        var dp=document.querySelector('input[name="dlPw"]'),ep=document.querySelector('input[name="delPw"]');
        dp.placeholder=n>1?"\u6279\u91CF\u7801\u6839\uFF08\u5982666\u2192666-01\u3001666-02\u2026\uFF09":"\u63D0\u53D6\u7801\uFF081-30\u4F4D\uFF09\xB7 \u4E0B\u8F7D\u7528";
        ep.placeholder=n>1?"\u5220\u9664\u7801\u6839\uFF08\u9009\u586B\xB7\u7559\u7A7A=\u8DDF\u63D0\u53D6\u7801999-d01\uFF1B\u586B888=888-01\u7CFB\u5217\uFF09":"\u5220\u9664\u7801\uFF081-30\u4F4D\uFF09\xB7 \u5220\u9664\u7528";
        /* v4.56b\uFF1A\u6279\u91CF\u6A21\u5F0F\u89E3\u9664delPw\u5FC5\u586B\uFF08required\u6821\u9A8C\u62E6\u63D0\u4EA4\u2014\u2014\u771F\u673A\u5FC5\u649E\uFF09 */
        ep.required=!(n>1);
      }catch(e3){}
      if(f2&&n===1){
        var mb=f2.size>=1048576?(f2.size/1048576).toFixed(1)+" MB":Math.max(1,Math.round(f2.size/1024))+" KB";
        fp.innerHTML="\u{1F4C4} "+String(f2.name).replace(/</g,"&lt;")+'<span style="display:block;color:rgba(255,255,255,.55);font-size:14px;margin-top:4px">'+mb+' \xB7 \u70B9\u51FB\u53EF\u91CD\u9009</span>';
        fp.style.borderColor="#E8BC4F";
      }else if(f2&&n>1){
        /* v4.55\uFF1A\u591A\u6587\u4EF6\u6A21\u5F0F\u2014\u2014\u7B2C1\u4E2A\u8BBE\u53CC\u7801\uFF0C\u5176\u4F59\u88F8\u4F20\uFF08\u540E\u53F0\u53EF\u8865\u7801\uFF09 */
        var tot=0;for(var q=0;q<n;q++)tot+=fi.files[q].size;
        var tmb=tot>=1048576?(tot/1048576).toFixed(1)+" MB":Math.max(1,Math.round(tot/1024))+" KB";
        fp.innerHTML="\u{1F4C6} "+n+" \u4E2A\u6587\u4EF6 \xB7 "+tmb+'<span style="display:block;color:rgba(255,255,255,.55);font-size:14px;margin-top:4px">\u5C06\u81EA\u52A8\u5F52\u5165\u540C\u4E00\u6279\u6B21\u76EE\u5F55 \xB7 \u70B9\u51FB\u53EF\u91CD\u9009</span>';
        fp.style.borderColor="#E8BC4F";
      }
    });
  }
  f.addEventListener("submit",function(e){
    e.preventDefault();
    var err=document.getElementById("upErr"),btn=document.getElementById("upBtn");
    err.style.display="none";
    var fi=document.getElementById("fileInput");
    if(fi&&!fi.files.length){err.textContent="\u8BF7\u5148\u9009\u62E9\u6587\u4EF6";err.style.display="block";window.scrollTo(0,0);return;}
    /* v4.55\uFF1A\u591A\u6587\u4EF6\u961F\u5217\u2014\u2014\u7AD9\u957F13:19"\u8FDE\u7EED\u4E0A\u4F20\u591A\u4E2A\uFF0C\u4E0D\u7528\u4F20\u5B8C\u518D\u56DE\u6765"
       \u7B2C1\u4E2A\u6587\u4EF6\u6302\u8868\u5355\u53CC\u7801\uFF0C\u5176\u4F59batch\u88F8\u4F20\uFF08\u540E\u53F0\u53EF\u8865\u7801\uFF09\uFF1B\u9010\u4E2A\u4E32\u884C
       \uFF08\u65E2\u4FDD\u8FDB\u5EA6\u6761\u4F53\u9A8C\uFF0C\u53C8\u907F\u5F00\u5E76\u53D1\u5199KV\u7ADE\u6001\u2014\u2014\u4ECA\u6668\u4E24\u7801\u4E92\u8986\u76D6\u7684\u6559\u8BAD\uFF09 */
    var files=Array.prototype.slice.call(fi.files);
    var multi=files.length>1;
    var dlPwIn=f.querySelector('input[name="dlPw"]'),delPwIn=f.querySelector('input[name="delPw"]');
    var results=[],idx=0,total=files.length;
    /* \u6279\u6B21\u76EE\u5F55\u540D\uFF1A\u6279-\u65E5-\u65F6\u5206\uFF08\u5982\u6279-10-1332\uFF09\u2014\u2014\u591A\u6587\u4EF6\u81EA\u52A8\u5F52\u6863\uFF08v6.3\u7AD9\u957F\uFF1A\u6708\u4EFD\u4E0E\u6240\u5728\u5F53\u6708\u76EE\u5F55\u91CD\u590D\uFF0C\u5220\u6389\u7701\u5BBD\u5EA6\uFF09 */
    var nd=new Date(Date.now()+8*3600*1000);
    var pd=function(x){return (x<10?"0":"")+x};
    window.__subdir="\u6279-"+pd(nd.getUTCDate())+"-"+pd(nd.getUTCHours())+pd(nd.getUTCMinutes());
    var prog=document.getElementById("prog"),bar=document.getElementById("progBar"),txt=document.getElementById("progTxt"),sub=document.getElementById("progSub");
    var escX=function(x){return String(x==null?"":x).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")};
    btn.disabled=true;btn.textContent=multi?"\u4E0A\u4F20\u4E2D\uFF080/"+total+"\uFF09":"\u4E0A\u4F20\u4E2D\u2026";
    prog.style.display="block";
    function nextFile(){
      if(idx>=total){allDone();return;}
      var one=files[idx],cur=idx+1;
      idx++;
      btn.textContent=multi?("\u4E0A\u4F20\u4E2D\uFF08"+cur+"/"+total+"\uFF09"):"\u4E0A\u4F20\u4E2D\u2026";
      sub.textContent="\u6B63\u5728\u8FDE\u63A5\u2026\uFF08\u5927\u6587\u4EF6\u8BF7\u8010\u5FC3\uFF09";
      bar.style.width="0%";txt.textContent="0%";
      var fd=new FormData();fd.append("file",one);fd.append("ajax","1");
      if(multi){
        /* \u7801\u6839\u6A21\u5F0F\uFF1A666\u2192\u63D0\u53D6\u7801666-01/02\u2026\u3001\u5220\u9664\u7801666-d01/d02\u2026 */
        var root=dlPwIn.value.trim();
        var droot=delPwIn.value.trim();
        /* v6.6\uFF1A\u7801\u6839\u7559\u7A7A=\u6BCF\u4E2A\u6587\u4EF6\u81EA\u52A8\u751F\u6210\u77ED\u7801\uFF08\u7AD9\u957F14:58\uFF09 */
        if(!root){
          fd.append("dlPw","");fd.append("delPw","");
        }else{
        /* v4.57\uFF1A\u5220\u9664\u7801\u9632\u731C\u2014\u2014\u7AD9\u957F13:50"\u81EA\u52A8\u751F\u6210\u5BB9\u6613\u88AB\u731C\u5230\u8BEF\u5220"
           \u9ED8\u8BA4\u968F\u673A\u540E\u7F00\uFF08d7k3\u5F0F\uFF09\uFF1B\u82E5\u624B\u5DE5\u586B\u4E86\u5220\u9664\u7801\u6839\u5219\u7528"d\u6839+\u5E8F\u53F7"\uFF08\u81EA\u5DF1\u9009\u53EF\u9884\u6D4B\uFF09 */
        var nn=cur<10?"0"+cur:""+cur;
        fd.append("dlPw",root+"-"+nn);
        /* v4.58b\u7AD9\u957F\u5B9A\u6848\uFF1A\u5220\u9664\u7801\u7559\u7A7A=\u8DDF\u63D0\u53D6\u7801999-d01\uFF1B\u586B888=\u81EA\u6210\u5E8F\u5217888-01 */
        fd.append("delPw",droot?(droot==="d"?root+"-d"+nn:droot+"-"+nn):root+"-d"+nn);
        }
        fd.append("subdir",window.__subdir);
        fd.append("dirDl","");fd.append("dirDel","");fd.append("dlRoot",root);fd.append("delRoot",droot);
      }else{
        fd.append("dlPw",dlPwIn.value.trim());fd.append("delPw",delPwIn.value.trim());
        fd.append("dirDl","");fd.append("dirDel","");
      }
      var lastL=0,lastT=0,saving=false;
      var xhr=new XMLHttpRequest();
      xhr.open("POST","/share/up");
      xhr.upload.onprogress=function(ev){
        if(!ev.lengthComputable||saving)return;
        var pct=Math.min(90,Math.round(ev.loaded/ev.total*90));
        bar.style.width=pct+"%";txt.textContent=pct+"%";
        if(Date.now()-lastT>400){
          var spd=(ev.loaded-lastL)/((Date.now()-lastT)/1000);
          var doneMB=(ev.loaded/1048576).toFixed(1),totMB=(ev.total/1048576).toFixed(1);
          sub.textContent=doneMB+" / "+totMB+" MB \xB7 "+(spd>1048576?(spd/1048576).toFixed(1)+" MB/s":(spd>10240?Math.round(spd/1024)+" KB/s":doneMB+" / "+totMB+" MB"));
          lastL=ev.loaded;lastT=Date.now();
        }
      };
      xhr.upload.onload=function(){saving=true;bar.style.width="95%";txt.textContent="95%";sub.textContent="\u5DF2\u9001\u8FBE\u670D\u52A1\u5668\uFF0C\u6B63\u5728\u4FDD\u5B58\u5230\u7F51\u76D8\u2026";};
      xhr.onload=function(){
        var d=null;try{d=JSON.parse(xhr.responseText);}catch(e2){}
        if(d&&d.ok){results.push(d);}else{results.push({ok:false,name:one.name,msg:(d&&d.msg)||"\u4E0A\u4F20\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5"});}
        nextFile();
      };
      xhr.onerror=function(){results.push({ok:false,name:one.name,msg:"\u7F51\u7EDC\u5F02\u5E38\u2014\u2014\u6587\u4EF6\u53EF\u80FD\u8F83\u5927\uFF0C\u8BF7\u91CD\u8BD5"});nextFile();};
      xhr.send(fd);
    }
    function allDone(){
      prog.style.display="none";
      var okN=results.filter(function(r){return r.ok}).length;
      var html="";
      /* v6.9h\uFF1A0\u6210\u529F=\u8001\u5B9E\u62A5\u9519+\u653E\u884C\u91CD\u8BD5\u6309\u94AE\uFF08\u6628\u6668\u5361\u5C4F\u75C5\u6839\uFF1A\u5168\u8D25\u65F6\u53D6[0].dir\u564E\u6B7B\uFF0C\u7ED3\u679C\u9875\u51FA\u4E0D\u6765\uFF09 */
      if(okN===0){
        btn.disabled=false;btn.textContent="\u91CD\u65B0\u4E0A\u4F20";
        html+="<div class='err' style='display:block;margin-bottom:12px'>\u274C "+(total>1?"\u4E24\u4E2A\u6587\u4EF6\u90FD\u6CA1\u4F20\u4E0A\u53BB":"\u6587\u4EF6\u6CA1\u4F20\u4E0A\u53BB")+"\u2014\u2014\u591A\u534A\u662F\u7F51\u76D8\u901A\u9053\u521A\u624D\u6CA1\u63A5\u4E0A\uFF0C\u6587\u4EF6<b>\u672A\u4FDD\u5B58</b>\u3002<br>\u8BF7\u70B9\u201C\u91CD\u65B0\u4E0A\u4F20\u201D\u518D\u8BD5\u4E00\u6B21\uFF1B\u82E5\u53CD\u590D\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u518D\u6765\u3002</div>";
      }else{
        btn.disabled=true;btn.textContent="\u4E0A\u4F20\u5B8C\u6210";
        if(multi)html+="<p style='font-size:17px;margin-bottom:10px'>\u2705 \u6210\u529F "+okN+" / "+total+"</p><p style='font-size:13.5px;color:rgba(255,255,255,.55);margin-bottom:12px'>\u{1F4C1} \u5DF2\u5F52\u6863\u5230\uFF1A"+results.filter(function(r){return r.ok})[0].dir+"/</p>";
      }
      if(multi){var ok1=results.filter(function(r){return r.ok})[0];
        if(ok1&&(ok1.dirDl||ok1.dirDel))html+="<div style='display:flex;gap:10px;margin:0 0 14px'>"+
          "<div style='flex:1;background:rgba(232,188,79,.1);border:1px solid rgba(232,188,79,.35);border-radius:10px;padding:12px 14px;text-align:center'><span style='color:rgba(255,255,255,.5);font-size:12px'>\u6574\u4F53\u63D0\u53D6\u7801\uFF08\u4E0B\u8F7D\u5168\u90E8\uFF09</span><br><b style='color:#E8BC4F;font-size:19px;letter-spacing:2px'>"+(ok1.dirDl||"\u2014")+"</b></div>"+
          "<div style='flex:1;background:rgba(255,99,99,.08);border:1px solid rgba(255,99,99,.35);border-radius:10px;padding:12px 14px;text-align:center'><span style='color:rgba(255,255,255,.5);font-size:12px'>\u6574\u4F53\u5220\u9664\u7801\uFF08\u5220\u9664\u6574\u4E2A\u6587\u4EF6\u5939\uFF09</span><br><b style='color:#E88;font-size:19px;letter-spacing:2px'>"+(ok1.dirDel||"\u2014")+"</b></div></div>";}
      results.forEach(function(r,i2){
        if(r.ok){
          var rn=r.renamed?"<div style='color:#E8BC4F;font-size:13px;margin-top:3px'>\u26A0\uFE0F \u6587\u4EF6\u540D\u91CD\u590D\uFF0C\u5DF2\u81EA\u52A8\u6539\u540D</div>":"";
          var noC=r.noCodes?"<div style='font-size:13px;color:rgba(255,255,255,.5);margin-top:3px'>\u672A\u8BBE\u7801\uFF08\u540E\u53F0\u53EF\u8865\uFF09</div>":
            ("<div style='margin-top:8px;font-size:14px'>\u63D0\u53D6\u7801\uFF1A<b style='font-size:19px;color:#E8BC4F'>"+escX(r.dlPw)+"</b></div>"+
             "<div style='font-size:14px;margin-top:2px'>\u5220\u9664\u7801\uFF1A<b style='font-size:19px;color:#E8BC4F'>"+escX(r.delPw)+"</b></div>");
          if(!multi)noC="<p style='font-size:17px;margin-bottom:10px'>\u{1F4CC} \u8BF7\u7262\u8BB0\u63D0\u53D6\u7801\u53CA\u5220\u9664\u7801</p>"+
            ("<div style='margin-top:8px;font-size:14px'>\u63D0\u53D6\u7801\uFF1A<b style='font-size:19px;color:#E8BC4F'>"+escX(r.dlPw)+"</b></div>"+
             "<div style='font-size:14px;margin-top:2px'>\u5220\u9664\u7801\uFF1A<b style='font-size:19px;color:#E8BC4F'>"+escX(r.delPw)+"</b></div>");
          var iTag='c'+i2;
          html+="<div class='file' style='margin:0 0 10px;text-align:left'><div class='fi'>\u{1F4C4}</div><div class='fn'><b>"+escX(r.name)+"</b><span>"+r.sizeKB+" KB</span>"+rn+noC+
            ((r.dlPw&&r.delPw)?"<button type='button' id='btn_"+iTag+"' onclick=\\"window.__chg('"+iTag+"',this)\\" style='margin-top:6px;background:rgba(232,188,79,.12);border:1px solid rgba(232,188,79,.45);color:#E8BC4F;border-radius:7px;padding:4px 12px;font-size:12.5px;cursor:pointer'>\u270F\uFE0F \u6539\u7801</button>"+
            "<div id='fm_"+iTag+"' style='display:none;margin-top:8px'></div>":"")+
            "</div></div>";
        }else{
          html+="<div class='file' style='margin:0 0 10px;text-align:left;border:1px solid rgba(255,99,99,.4)'><div class='fi'>\u274C</div><div class='fn'><b>"+escX(r.name)+"</b><span style='color:#ff8a8a'>"+escX(r.msg)+"</span></div></div>";
        }
      });
      html+="<a href='/share/up' style='display:block;text-align:center;padding:11px;border-radius:10px;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);text-decoration:none;font-size:13.5px'>\u518D\u4F20\u4E00\u4E2A</a>"+
            "<a href='/share' style='display:block;text-align:center;padding:11px;margin-top:8px;border-radius:10px;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);text-decoration:none;font-size:13.5px'>\u2190 \u8FD4\u56DE\u6587\u4EF6\u5206\u4EAB\u7AD9\u4E3B\u9875</a>";
      document.querySelector(".box").innerHTML="<h1>"+(okN===total?"\u2705 \u4E0A\u4F20\u6210\u529F":(okN>0?"\u2705 \u5B8C\u6210 "+okN+"/"+total:"\u274C \u4E0A\u4F20\u5931\u8D25"))+"</h1>"+html;
      window.scrollTo(0,0);
      /* v4.58\uFF1A\u4E00\u6B21\u6027\u6539\u7801\u2014\u2014\u7ED3\u679C\u9875\u53EF\u89C1\u7801\u65F6\u624D\u80FD\u6539\uFF08\u7AD9\u957F14:06\uFF1A
         \u8FD4\u56DE\u540E\u5C31\u770B\u4E0D\u5230\u7801\u4E86=\u6539\u4E0D\u4E86\uFF0C\u5929\u7136\u4E00\u6B21\u6027\uFF09\uFF1B\u51ED\u65E7\u5220\u9664\u7801\u6388\u6743 */
      window.__chg=function(id,btn){
        var r=results[parseInt(id.slice(1),10)];
        if(!r||!r.ok||!r.dlPw||!r.delPw)return;
        var fm=document.getElementById("fm_"+id);
        if(fm.style.display==="none"){
          fm.style.display="block";
          fm.innerHTML="<div style='display:flex;gap:6px;flex-wrap:wrap'>"+
            "<input id='nd_"+id+"' value='"+r.dlPw.replace(/'/g,"")+"' maxlength='30' style='flex:1;min-width:100px'>"+
            "<input id='ne_"+id+"' value='"+r.delPw.replace(/'/g,"")+"' maxlength='30' style='flex:1;min-width:100px'>"+
            "<button type='button' id='ok_"+id+"' style='background:linear-gradient(135deg,#B8860B,#E8BC4F);color:#14213D;font-weight:700;border:none;border-radius:8px;padding:8px 14px;cursor:pointer'>\u786E\u8BA4</button></div>"+
            "<div style='font-size:12px;color:rgba(255,255,255,.5);margin-top:4px'>\u5DE6=\u65B0\u63D0\u53D6\u7801 \u53F3=\u65B0\u5220\u9664\u7801\uFF08\u6BCF\u6587\u4EF6\u4EC5\u6B64\u4E00\u6B21\uFF09</div>"+
            "<div id='mg_"+id+"' style='font-size:13px;margin-top:5px'></div>";
          document.getElementById("ok_"+id).onclick=function(){doChg(id,r);};
        }else{fm.style.display="none";}
      };
      function doChg(id,r){
        var nd=document.getElementById("nd_"+id).value.trim(),
            ne=document.getElementById("ne_"+id).value.trim(),
            mg=document.getElementById("mg_"+id),
            okb=document.getElementById("ok_"+id);
        if(!nd||!ne||nd.length>30||ne.length>30){mg.style.color="#ff8a8a";mg.textContent="\u4E24\u7801\u5404\u987B1-30\u4F4D";return;}
        if(nd===ne){mg.style.color="#ff8a8a";mg.textContent="\u4E24\u7801\u4E0D\u80FD\u76F8\u540C";return;}
        okb.disabled=true;okb.textContent="\u2026";
        fetch("/share/code-change",{method:"POST",body:(function(){var f2=new FormData();f2.append("oldDel",r.delPw);f2.append("newDl",nd);f2.append("newDel",ne);return f2;})()})
          .then(function(x){return x.json()})
          .then(function(d){
            if(d.ok){
              r.dlPw=nd;r.delPw=ne;
              var b=document.getElementById("btn_"+id);
              b.outerHTML="<span style='font-size:12.5px;color:rgba(255,255,255,.4)'>\u2713 \u5DF2\u6539\u7801</span>";
              document.getElementById("fm_"+id).style.display="none";
              // \u5237\u65B0\u5361\u7247\u4E0A\u7684\u7801\u663E\u793A
              var spans=document.querySelectorAll("#fm_"+id);
              var fn=document.getElementById("fm_"+id).parentNode;
              var codes=fn.querySelectorAll("b");
              if(codes.length>=2){codes[codes.length-2].textContent=nd;codes[codes.length-1].textContent=ne;}
            }else{
              okb.disabled=false;okb.textContent="\u786E\u8BA4";
              mg.style.color="#ff8a8a";mg.textContent=d.msg||"\u4FEE\u6539\u5931\u8D25";
            }
          })
          .catch(function(){okb.disabled=false;okb.textContent="\u786E\u8BA4";mg.style.color="#ff8a8a";mg.textContent="\u7F51\u7EDC\u5F02\u5E38";});
      }
    }
    nextFile();
    return;
    xhr.send(fd);
    return;
    fetch("/share/up",{method:"POST",body:fd}).then(function(r){return r.json()}).then(function(d){
      if(d.ok){
        document.querySelector(".box").innerHTML=
          "<h1>\u2705 \u5206\u4EAB\u6210\u529F</h1>"+
          "<div class='file' style='margin:14px 0'><div class='fi'>\u{1F4C4}</div><div class='fn'><b>"+d.name+"</b><span>"+d.sizeKB+" KB \xB7 \u5F52\u6863\u4E8E "+d.dir+"</span></div></div>"+
          "<div style='background:rgba(217,165,33,.12);border:1px solid rgba(217,165,33,.4);border-radius:10px;padding:12px 14px;margin-bottom:10px;text-align:center'><span style='color:rgba(255,255,255,.5);font-size:12px'>\u63D0\u53D6\u7801\uFF08\u53D1\u7ED9\u8981\u4E0B\u8F7D\u7684\u4EBA\uFF09</span><br><b style='color:#E8BC4F;font-size:19px;letter-spacing:2px'>"+escX(d.dlPw)+"</b></div>"+
          "<div style='background:rgba(176,58,46,.15);border:1px solid rgba(176,58,46,.5);border-radius:10px;padding:12px 14px;margin-bottom:16px;text-align:center'><span style='color:rgba(255,255,255,.5);font-size:12px'>\u5220\u9664\u7801\uFF08\u5220\u9664\u7528\uFF09</span><br><b style='color:#E88;font-size:19px;letter-spacing:2px'>"+escX(d.delPw)+"</b></div>"+
          "<p style='font-size:12.5px;margin-bottom:10px'>\u5171\u4EAB\u5730\u5740\uFF1A<b style='color:#E8BC4F'>tl.efcc.cc/share</b>\uFF08\u53D1\u8FD9\u4E00\u4E2A\u5C31\u591F\u4E86\uFF09</p>"+
          "<p style='font-size:10.5px;line-height:1.8;color:rgba(255,255,255,.35);text-align:left;margin-bottom:12px;padding:9px 11px;background:rgba(255,255,255,.04);border-radius:8px'>\u{1F4CC} \u6587\u4EF6\u4FDD\u5B58\u6709\u6548\u671F\u76EE\u524D\u4E3A\u957F\u671F\uFF1B\u5E73\u53F0\u4FDD\u7559\u8C03\u6574\u6709\u6548\u671F\u7684\u6743\u5229\uFF0C\u7531\u6B64\u9020\u6210\u7684\u635F\u5931\u672C\u7AD9\u4E0D\u8D1F\u8D23\u3002\u4E0A\u4F20\u8FC7\u7A0B\u4E2D\u7684\u65AD\u7EBF\u3001\u4E2D\u65AD\u7B49\u9020\u6210\u7684\u4F20\u8F93\u635F\u5931\u672C\u7AD9\u4E0D\u8D1F\u8D23\u3002</p>"+
          "<a href='/share/up' style='display:block;text-align:center;padding:11px;border-radius:10px;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);text-decoration:none;font-size:13.5px'>\u518D\u4F20\u4E00\u4E2A</a> "+
          "<a href='/share' style='display:block;text-align:center;padding:11px;border-radius:10px;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);text-decoration:none;font-size:13.5px;margin-top:8px'>\u8FD4\u56DE\u9996\u9875</a>";
      }else{
        err.textContent=d.msg||"\u4E0A\u4F20\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5";
        err.style.display="block";
        btn.disabled=false;btn.textContent="\u4E0A \u4F20";
        window.scrollTo(0,0);
      }
    }).catch(function(){
      err.textContent="\u7F51\u7EDC\u5F02\u5E38\u2014\u2014\u6587\u4EF6\u53EF\u80FD\u8F83\u5927\uFF0C\u8BF7\u8010\u5FC3\u91CD\u8BD5";
      err.style.display="block";
      btn.disabled=false;btn.textContent="\u4E0A \u4F20";
    });
  });
})();
<\/script>
<div style="margin-top:14px;padding:11px 13px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;text-align:left">
<b style="color:rgba(232,188,79,.95);font-size:16px">\u{1F4CC} \u4E0A\u4F20\u987B\u77E5</b>
<p style="text-align:left;font-size:15px;line-height:1.9;margin:6px 0 0;color:rgba(255,255,255,.65)">\u63D0\u53D6\u7801\u7528\u4E8E\u4E0B\u8F7D\u6587\u4EF6\uFF0C\u5220\u9664\u7801\u7528\u4E8E\u53D6\u6D88\u5206\u4EAB\u5E76\u5220\u9664\u6587\u4EF6<br>\u2460 \u63D0\u53D6\u7801\u4E0E\u5220\u9664\u7801\u4E0D\u80FD\u76F8\u540C\uFF0C\u4E5F\u4E0D\u80FD\u4E0E\u73B0\u6709\u7801\u91CD\u590D\uFF08\u91CD\u590D\u4F1A\u63D0\u793A\u91CD\u8BBE\uFF09<br>\u2461 \u8BF7\u5728\u4FDD\u5B58\u671F\u9650\u5185\u4F7F\u7528\u6587\u4EF6\u2014\u2014\u5230\u671F\u540E\u6587\u4EF6\u4E0E\u4E24\u4E2A\u7801\u4F1A\u81EA\u52A8\u5220\u9664\uFF0C\u4FDD\u6301\u5171\u4EAB\u7AD9\u5E72\u51C0\uFF1B\u9700\u957F\u671F\u4FDD\u7559\uFF0C\u8054\u7CFB\u7AD9\u957F\u53EF\u514D\u8D39\u5EF6\u957F<br>\u2462 \u6587\u4EF6\u7528\u5B8C\u540E\uFF0C\u5EFA\u8BAE\u81EA\u89C9\u8F93\u5165\u5220\u9664\u7801\u5220\u6389\u6587\u4EF6\u2014\u2014\u5E72\u51C0\u4F60\u6211\u4ED6\uFF0C\u65B9\u4FBF\u5927\u5BB6<br>\u2463 \u5355\u6587\u4EF6\u4E0D\u9650\u5927\u5C0F\uFF1B\u4E0A\u4F20\u65AD\u7EBF\u3001\u4E2D\u65AD\u7B49\u4F20\u8F93\u635F\u5931\u672C\u7AD9\u4E0D\u8D1F\u8D23\u2014\u2014\u5927\u6587\u4EF6\u8BF7\u8010\u5FC3\u7B49\u5F85<br>\u2464 \u5171\u4EAB\u7AD9\u603B\u5BB9\u91CF 10TB\uFF0C\u8D85\u51FA\u540E\u505C\u6B62\u4E0A\u4F20<br>\u2465 \u8BF7\u52FF\u4E0A\u4F20\u8FDD\u6CD5\u8FDD\u89C4\u3001\u4FB5\u6743\u6216\u9690\u79C1\u654F\u611F\u6587\u4EF6<br>\u2466 \u5FD8\u8BB0\u63D0\u53D6\u7801\u6216\u5220\u9664\u7801\u3001\u6216\u9700\u5EF6\u957F\u6709\u6548\u671F\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\uFF1A\u624B\u673A/\u5FAE\u4FE1 13605449077</p>
</div>
</div></body></html>`, "upPage");
        if (request.method === "GET") {
          let pageHtml = upPage(null, null);
          const savedNotice = await TVKV.get("share_notice");
          if (savedNotice) {
            const defRe = /提取码用于下载文件，删除码用于取消分享并删除文件[\s\S]*?13605449077/;
            pageHtml = pageHtml.replace(defRe, savedNotice);
          }
          return new Response(pageHtml, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
        }
        const fd = await request.formData();
        const f = fd.get("file");
        const dlPw = (fd.get("dlPw") || "").trim();
        const delPw = (fd.get("delPw") || "").trim();
        const isAjax = fd.get("ajax") === "1";
        const bad = /* @__PURE__ */ __name((m) => isAjax ? new Response(JSON.stringify({ ok: false, msg: m }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }) : new Response(upPage(null, m), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }), "bad");
        if (!f || !f.name) return bad("\u8BF7\u5148\u9009\u62E9\u6587\u4EF6");
        const batch = fd.get("batch") === "1";
        if (dlPw || delPw) {
          if (dlPw && (dlPw.length < 1 || dlPw.length > 30)) return bad("\u63D0\u53D6\u7801\u987B\u4E3A1-30\u4F4D");
          if (delPw && (delPw.length < 1 || delPw.length > 30)) return bad("\u5220\u9664\u7801\u987B\u4E3A1-30\u4F4D");
          if (dlPw && dlPw === delPw) return bad("\u63D0\u53D6\u7801\u548C\u5220\u9664\u7801\u4E0D\u80FD\u76F8\u540C");
        }
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const rk = "up_rate_" + ip;
        const cnt = parseInt(await TVKV.get(rk) || "0", 10) + 1;
        if (cnt > 15) return bad("\u4E0A\u4F20\u592A\u9891\u7E41\u2014\u2014\u8BF7\u4E00\u5C0F\u65F6\u540E\u518D\u8BD5");
        await TVKV.put(rk, String(cnt), { expirationTtl: 3600 });
        let codes = [];
        try {
          codes = JSON.parse(await TVKV.get("share_codes") || "[]");
        } catch (e) {
          codes = [];
        }
        let dlPwV = dlPw, delPwV = delPw;
        if (!dlPwV || !delPwV) {
          const GEN_A = "23456789abcdefghjkmnpqrstuvwxyz";
          const gen1 = /* @__PURE__ */ __name(() => {
            let s = "";
            for (let i = 0; i < 4; i++) s += GEN_A[Math.floor(Math.random() * GEN_A.length)];
            return s;
          }, "gen1");
          for (let t2 = 0; t2 < 50 && !dlPwV; t2++) {
            const g = gen1();
            if (!codes.some((c) => c.pw === g)) dlPwV = g;
          }
          for (let t3 = 0; t3 < 50 && !delPwV; t3++) {
            const g = gen1();
            if (g !== dlPwV && !codes.some((c) => c.pw === g)) delPwV = g;
          }
        }
        if (dlPwV && codes.some((c) => c.pw === dlPwV)) return bad("\u8FD9\u4E2A\u63D0\u53D6\u7801\u5DF2\u88AB\u5360\u7528\u2014\u2014\u8BF7\u6362\u4E00\u4E2A");
        if (delPwV && codes.some((c) => c.pw === delPwV)) return bad("\u8FD9\u4E2A\u5220\u9664\u7801\u5DF2\u88AB\u5360\u7528\u2014\u2014\u8BF7\u6362\u4E00\u4E2A");
        const CAP = 10 * 1024 ** 4;
        let used = parseInt(await TVKV.get("share_used_bytes") || "0", 10);
        if (used + f.size > CAP) return bad("\u5171\u4EAB\u7AD9\u603B\u5BB9\u91CF\u5DF2\u8FBE\u4E0A\u9650\uFF0810TB\uFF09\u2014\u2014\u6682\u4E0D\u80FD\u4E0A\u4F20\uFF0C\u8BF7\u8054\u7CFB\u7AD9\u957F");
        const M = await davEnsureMonth(env);
        if (M.err) return bad("\u670D\u52A1\u6682\u4E0D\u53EF\u7528\uFF08" + M.err + "\uFF09\u2014\u2014\u8BF7\u7A0D\u540E\u518D\u8BD5");
        let name = (f.name || "").trim().slice(0, 80);
        if (!name || /[\/\\]/.test(name)) return bad("\u6587\u4EF6\u540D\u4E0D\u5408\u6CD5");
        const L = await davList(env);
        if (L.err) return bad("\u5171\u4EAB\u6587\u4EF6\u5939\u6682\u4E0D\u53EF\u7528\uFF08" + L.err + "\uFF09\u2014\u2014\u8BF7\u7A0D\u540E\u518D\u8BD5");
        const subdir = ((fd.get("subdir") || "") + "").trim().slice(0, 40);
        const hasSub = subdir && !/[\\/:*?"<>|]/.test(subdir);
        if (subdir && !hasSub) return bad("\u6279\u6B21\u76EE\u5F55\u540D\u4E0D\u5408\u6CD5");
        if (hasSub) {
          let mk = null;
          for (let i = 0; i < 3; i++) {
            try {
              mk = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(M.dir + "/" + subdir), { method: "MKCOL", headers: { "Authorization": "Basic " + M.auth } });
            } catch (e) {
              mk = null;
            }
            if (mk && (mk.status === 201 || mk.status === 405 || mk.status === 200)) break;
            if (mk && mk.status < 500) break;
            if (i < 2) await new Promise((rs) => setTimeout(rs, 700));
          }
          if (!mk || mk.status !== 201 && mk.status !== 405 && mk.status !== 200) return bad("\u5EFA\u6279\u6B21\u76EE\u5F55\u5931\u8D25\uFF08" + (mk ? mk.status : "\u7F51\u7EDC\u4E0D\u901A") + "\uFF09\u2014\u2014\u5DF2\u81EA\u52A8\u91CD\u8BD5\u4ECD\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
        }
        const targetDir = hasSub ? M.dir + "/" + subdir : M.dir;
        const monthFiles = L.files.filter((x) => (x.path || "") === targetDir);
        let finalName = name;
        if (monthFiles.some((x) => x.name === name)) {
          const dot = name.lastIndexOf(".");
          const base = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : "";
          let i = 1;
          while (monthFiles.some((x) => x.name === `${base}(${i})${ext}`) && i < 100) i++;
          finalName = `${base}(${i})${ext}`;
        }
        const fid = targetDir + "/" + finalName;
        let r = null;
        for (let i = 0; i < 3; i++) {
          try {
            r = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(targetDir) + "/" + encodeURIComponent(finalName), { method: "PUT", headers: { "Authorization": "Basic " + M.auth }, body: f });
          } catch (e) {
            r = null;
          }
          if (r && (r.status === 201 || r.status === 204)) break;
          if (r && r.status < 500) break;
          if (i < 2) await new Promise((rs) => setTimeout(rs, 700));
        }
        if (!r || r.status !== 201 && r.status !== 204) return bad("\u4E0A\u4F20\u5931\u8D25\uFF08123 \u8FD4\u56DE " + (r ? r.status : "\u7F51\u7EDC\u4E0D\u901A") + "\uFF09\u2014\u2014\u5DF2\u81EA\u52A8\u91CD\u8BD5\u4ECD\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
        await TVKV.put("share_used_bytes", String(used + f.size));
        codes.push({ pw: dlPwV, file: fid, kind: "dl", exp: 0, expText: "\u6C38\u4E45" });
        codes.push({ pw: delPwV, file: fid, kind: "del", exp: 0, expText: "\u6C38\u4E45" });
        await TVKV.put("share_codes", JSON.stringify(codes));
        let dirDlF = "", dirDelF = "";
        if (hasSub) {
          const exDl = codes.filter((c) => c.file === targetDir && c.kind === "dl")[0];
          const exDel = codes.filter((c) => c.file === targetDir && c.kind === "del")[0];
          let fDl = ((fd.get("dirDl") || "") + "").trim() || (exDl ? exDl.pw : "");
          let fDel = ((fd.get("dirDel") || "") + "").trim() || (exDel ? exDel.pw : "");
          const r0 = String(fd.get("dlRoot") || "").trim();
          const r1 = String(fd.get("delRoot") || "").trim();
          if (!fDl && r0) fDl = codes.some((c) => c.pw === r0) ? r0 + "-all" : r0;
          if (!fDel && r1) fDel = codes.some((c) => c.pw === r1) ? r1 + "-all" : r1;
          let dirty2 = false;
          if (fDl && !exDl && !codes.some((c) => c.pw === fDl)) {
            codes.push({ pw: fDl, file: targetDir, kind: "dl", exp: 0, expText: "\u6C38\u4E45" });
            dirty2 = true;
          } else if (fDl && exDl) fDl = exDl.pw;
          if (fDel && !exDel && !codes.some((c) => c.pw === fDel)) {
            codes.push({ pw: fDel, file: targetDir, kind: "del", exp: 0, expText: "\u6C38\u4E45" });
            dirty2 = true;
          } else if (fDel && exDel) fDel = exDel.pw;
          if (dirty2) await TVKV.put("share_codes", JSON.stringify(codes));
          dirDlF = fDl;
          dirDelF = fDel;
        }
        await shareMetaSet(fid, await shareDefaultDays());
        if (isAjax) return new Response(JSON.stringify({ ok: true, name: finalName, renamed: finalName !== name, sizeKB: Math.max(1, Math.round(f.size / 1024)), dir: targetDir, dlPw: dlPwV, delPw: delPwV, dirDl: dirDlF, dirDel: dirDelF }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        return new Response(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>\u6587\u4EF6\u5206\u4EAB\u7AD9 \xB7 \u5206\u4EAB\u6210\u529F</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2316233b'/%3E%3Cpath d='M13 21a4 4 0 0 1 4-4h10.5l4.5 5.5H47a4 4 0 0 1 4 4V43a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z' fill='%23E8BC4F'/%3E%3Cpath d='M13 27h38' stroke='%2316233b' stroke-width='1.6' opacity='.35'/%3E%3C/svg%3E"/><style>${pageCSS}</style></head><body><div class="box" style="width:min(94vw,440px)">
<h1>\u2705 \u5206\u4EAB\u6210\u529F</h1>
<div class="file" style="margin:14px 0"><div class="fi">\u{1F4C4}</div><div class="fn"><b>${finalName.replace(/</g, "&lt;")}</b><span>${Math.max(1, Math.round(f.size / 1024))} KB \xB7 \u5F52\u6863\u4E8E ${M.dir}</span></div></div>
<div style="background:rgba(217,165,33,.12);border:1px solid rgba(217,165,33,.4);border-radius:10px;padding:12px 14px;margin-bottom:10px;text-align:center"><span style="color:rgba(255,255,255,.5);font-size:12px">\u63D0\u53D6\u7801\uFF08\u53D1\u7ED9\u8981\u4E0B\u8F7D\u7684\u4EBA\uFF09</span><br><b style="color:#E8BC4F;font-size:19px;letter-spacing:2px">${dlPwV.replace(/</g, "&lt;")}</b></div>
<div style="background:rgba(176,58,46,.15);border:1px solid rgba(176,58,46,.5);border-radius:10px;padding:12px 14px;margin-bottom:16px;text-align:center"><span style="color:rgba(255,255,255,.5);font-size:12px">\u5220\u9664\u7801\uFF08\u5220\u9664\u7528\uFF09</span><br><b style="color:#E88;font-size:19px;letter-spacing:2px">${delPwV.replace(/</g, "&lt;")}</b></div>
<p style="font-size:12.5px;margin-bottom:10px">\u5171\u4EAB\u5730\u5740\uFF1A<b style="color:#E8BC4F">tl.efcc.cc/share</b>\uFF08\u53D1\u8FD9\u4E00\u4E2A\u5C31\u591F\u4E86\uFF09<br>\u4E24\u4E2A\u7801\u957F\u671F\u6709\u6548\uFF0C\u5220\u9664\u7801\u7528\u6389\u540E\u6587\u4EF6\u548C\u4E24\u7801\u4E00\u8D77\u9500\u6BC1</p>
<p style="font-size:14.5px;line-height:1.8;color:rgba(255,255,255,.55);text-align:left;margin-bottom:12px;padding:9px 11px;background:rgba(255,255,255,.04);border-radius:8px">\u{1F4CC} \u6587\u4EF6\u4FDD\u5B58\u6709\u6548\u671F\u76EE\u524D\u4E3A\u957F\u671F\uFF1B\u5E73\u53F0\u4FDD\u7559\u8C03\u6574\u6709\u6548\u671F\u7684\u6743\u5229\uFF0C\u7531\u6B64\u9020\u6210\u7684\u635F\u5931\u672C\u7AD9\u4E0D\u8D1F\u8D23\u3002\u4E0A\u4F20\u8FC7\u7A0B\u4E2D\u7684\u65AD\u7EBF\u3001\u4E2D\u65AD\u7B49\u9020\u6210\u7684\u4F20\u8F93\u635F\u5931\u672C\u7AD9\u4E0D\u8D1F\u8D23\u2014\u2014\u6587\u4EF6\u8F83\u5927\u65F6\u8BF7\u8010\u5FC3\u7B49\u5F85\u5E76\u907F\u514D\u5207\u6362\u7F51\u7EDC\u3002</p>
<a href="/share" style="display:block;text-align:center;padding:11px;border-radius:10px;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);text-decoration:none;font-size:13.5px">\u2190 \u8FD4\u56DE\u6587\u4EF6\u5206\u4EAB\u7AD9\u4E3B\u9875</a>
</div></body></html>`, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (pathname.startsWith("/share/dl/")) {
        const sess = await okShareToken(env, t);
        if (!sess) return new Response("<!DOCTYPE html><meta charset=utf-8><body style='font-family:sans-serif;text-align:center;padding:60px;color:#5B6577'>\u94FE\u63A5\u5DF2\u8FC7\u671F\uFF082\u5C0F\u65F6\u6709\u6548\uFF09\u2014\u2014\u8BF7\u91CD\u65B0\u8F93\u7801</body>", { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
        const fname = decodeURIComponent(pathname.slice("/share/dl/".length));
        const norm = /* @__PURE__ */ __name((x) => {
          const p = String(x || "").split("/").filter(Boolean);
          return p.length ? p[p.length - 1] : "";
        }, "norm");
        const fidMatch = sess.file === "*" || sess.file === fname || norm(sess.file) === norm(fname) || fname.indexOf(sess.file + "/") === 0;
        if (!fidMatch) return new Response("\u8FD9\u4E2A\u63D0\u53D6\u7801\u65E0\u6743\u4E0B\u8F7D\u6B64\u6587\u4EF6", { status: 403 });
        if (!fname || fname.indexOf("..") >= 0) return new Response("\u6587\u4EF6\u540D\u4E0D\u5408\u6CD5", { status: 400 });
        let creds = null;
        try {
          creds = JSON.parse(await TVKV.get("share_webdav_creds") || "null");
        } catch (e) {
        }
        if (!creds) return new Response("\u540E\u53F0\u672A\u914D\u7F6E", { status: 500 });
        const auth = btoa(creds.account + ":" + creds.password);
        let r = null;
        for (let i = 0; i < 3; i++) {
          try {
            r = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(fname), { headers: { "Authorization": "Basic " + auth }, redirect: "follow" });
          } catch (e) {
            r = null;
          }
          if (r && r.ok) break;
          if (r && (r.status === 404 || r.status === 403)) break;
          if (i < 2) await new Promise((rs) => setTimeout(rs, 700));
        }
        if (!r) return new Response("\u7F51\u76D8\u901A\u9053\u8FDE\u63A5\u5931\u8D25\u2014\u2014\u8BF7\u7A0D\u540E\u518D\u8BD5", { status: 502 });
        if (r.status === 404) return new Response("\u6587\u4EF6\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u5220\u9664", { status: 404 });
        if (!r.ok) return new Response("\u7F51\u76D8\u4E0B\u8F7D\u901A\u9053\u6B63\u5FD9\uFF08" + r.status + "\uFF09\u2014\u2014\u8BF7\u7A0D\u7B49\u51E0\u79D2\u518D\u70B9\u4E00\u6B21\u4E0B\u8F7D", { status: 502 });
        const h = new Headers(r.headers);
        const dlName = fname.split("/").pop() || fname;
        h.set("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(dlName));
        return new Response(r.body, { status: 200, headers: h });
      }
      if (request.method === "POST") {
        const fd = await request.formData();
        const pw = (fd.get("pw") || "").trim();
        let codes = [];
        try {
          codes = JSON.parse(await TVKV.get("share_codes") || "[]");
        } catch (e) {
          codes = [];
        }
        const hit = codes.find((c) => c.pw && c.pw === pw);
        if (hit && hit.exp && Date.now() > hit.exp) {
          return new Response(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>\u6587\u4EF6\u5206\u4EAB\u7AD9</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2316233b'/%3E%3Cpath d='M13 21a4 4 0 0 1 4-4h10.5l4.5 5.5H47a4 4 0 0 1 4 4V43a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z' fill='%23E8BC4F'/%3E%3Cpath d='M13 27h38' stroke='%2316233b' stroke-width='1.6' opacity='.35'/%3E%3C/svg%3E"/><style>${pageCSS}</style></head><body><a href="/share/admin.html" style="position:fixed;top:12px;right:14px;font-size:14px;color:rgba(255,255,255,.55);text-decoration:none;border:1px solid rgba(255,255,255,.2);padding:7px 14px;border-radius:99px;background:rgba(255,255,255,.07)">\u2699\uFE0F \u540E\u53F0\u7BA1\u7406</a><div class="box">
<h1>\u{1F4C1} \u6587\u4EF6\u5206\u4EAB\u7AD9</h1><p>\u8F93\u5165\u63D0\u53D6\u7801\u53EF\u4EE5\u4E0B\u8F7D\u6587\u4EF6\uFF0C<br>\u8F93\u5165\u5220\u9664\u7801\u53EF\u4EE5\u5220\u9664\u6587\u4EF6\u3002</p><p style="margin-top:10px;font-size:14px;color:rgba(255,255,255,.6)">\u23F3 \u6587\u4EF6\u4E0A\u4F20\u540E\u9ED8\u8BA4\u4FDD\u5B58 <b style="color:#E8BC4F">${shareDefDays}</b> \u5929</p>
<div class="err">\u8FD9\u4E2A\u7801\u5DF2\u8FC7\u671F\u2014\u2014\u8BF7\u8054\u7CFB\u5206\u4EAB\u4EBA\u83B7\u53D6\u65B0\u7801</div>
<form method="POST" action="/share"><input type="password" name="pw" placeholder="\u8BF7\u5728\u8FD9\u91CC\u8F93\u5165" autocomplete="new-password" readonly onfocus="this.removeAttribute('readonly')" required><button type="submit">\u63D0 \u4EA4</button></form>
</div></body></html>`, { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        if (hit) {
          if (hit.kind === "del") {
            const exp = Date.now() + 15 * 60 * 1e3;
            const sig = await hmacHex(await getPwHash(env, "station"), "share-del:" + exp + ":" + hit.file);
            return new Response(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>\u6587\u4EF6\u5206\u4EAB\u7AD9 \xB7 \u5220\u9664\u786E\u8BA4</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2316233b'/%3E%3Cpath d='M13 21a4 4 0 0 1 4-4h10.5l4.5 5.5H47a4 4 0 0 1 4 4V43a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z' fill='%23E8BC4F'/%3E%3Cpath d='M13 27h38' stroke='%2316233b' stroke-width='1.6' opacity='.35'/%3E%3C/svg%3E"/><style>${pageCSS}</style></head><body style="background:rgba(10,10,16,.82);display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;backdrop-filter:blur(3px)"><div style="width:min(92vw,430px);background:linear-gradient(180deg,#1c1418,#17111a);border:2px solid rgba(224,82,66,.55);border-radius:16px;padding:26px 22px;box-shadow:0 18px 60px rgba(0,0,0,.65),0 0 0 1px rgba(224,82,66,.12)">
<div style="text-align:center;margin-bottom:14px"><div style="width:62px;height:62px;border-radius:50%;background:rgba(224,82,66,.15);border:2px solid rgba(224,82,66,.6);display:inline-flex;align-items:center;justify-content:center;font-size:30px">\u26A0\uFE0F</div></div>
<h1 style="text-align:center;font-size:21px;letter-spacing:1px;margin:0 0 6px">\u5220 \u9664 \u8B66 \u544A</h1>
<p style="text-align:center;color:rgba(255,255,255,.55);font-size:13px;margin:0 0 16px">\u60A8\u8F93\u5165\u7684\u662F\u300C\u5220\u9664\u7801\u300D\u2014\u2014\u8BF7\u518D\u6B21\u786E\u8BA4</p>
<div style="background:rgba(224,82,66,.1);border:1px solid rgba(224,82,66,.35);border-left:4px solid #E05242;border-radius:10px;padding:13px 16px;margin-bottom:14px;word-break:break-all"><b style="font-size:17px">${hit.file.replace(/</g, "&lt;")}</b></div>
<p style="color:rgba(255,255,255,.6);font-size:13.5px;line-height:1.9;margin:0 0 20px;padding:0 4px">\u5220\u9664\u540E\uFF1A<br>\u2460 \u6587\u4EF6\u7ACB\u5373\u5220\u9664\uFF0C\u6B64\u64CD\u4F5C<b style="color:#E05242">\u4E0D\u53EF\u64A4\u9500</b><br>\u2461 \u8BE5\u6587\u4EF6\u7684\u63D0\u53D6\u7801\u548C\u5220\u9664\u7801\u5168\u90E8\u7ACB\u5373\u5931\u6548</p>
<form method="POST" action="/share">
<input type="hidden" name="__del" value="1">
<input type="hidden" name="tok" value="${exp}.${hit.file.replace(/"/g, "&quot;")}.${sig}">
<button type="submit" style="background:linear-gradient(135deg,#A93226,#E05242);width:100%;padding:13px;font-size:16px;font-weight:700;letter-spacing:2px;border:1px solid rgba(255,255,255,.15);border-radius:11px;cursor:pointer">\u{1F5D1} \u6211\u5DF2\u786E\u8BA4\uFF0C\u6C38\u4E45\u5220\u9664</button>
</form>
<a href="/share" style="display:block;text-align:center;color:rgba(255,255,255,.65);font-size:14px;padding:11px;text-decoration:none;border:1px solid rgba(255,255,255,.22);border-radius:11px;margin-top:10px;background:rgba(255,255,255,.04)">\u53D6\u6D88\uFF0C\u8FD4\u56DE\u9996\u9875</a>
</div></body></html>`, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
          }
          return Response.redirect(new URL("/share?t=" + await mkShareToken(env, hit.file), request.url).toString(), 302);
        }
        if (!codes.length && pw && await sha256Hex(pw) === await getPwHash(env, "station")) {
          return Response.redirect(new URL("/share?t=" + await mkShareToken(env, "*"), request.url).toString(), 302);
        }
        if (request.method === "POST" && fd.get("__del") === "1") {
          const tok = fd.get("tok") || "";
          const lastDot = tok.lastIndexOf(".");
          const firstDot = tok.indexOf(".");
          if (firstDot < 0 || lastDot <= firstDot) return new Response("\u4EE4\u724C\u65E0\u6548", { status: 400 });
          const exp = parseInt(tok.slice(0, firstDot), 10);
          const file = tok.slice(firstDot + 1, lastDot);
          const sig = tok.slice(lastDot + 1);
          if (!exp || Date.now() > exp || sig !== await hmacHex(await getPwHash(env, "station"), "share-del:" + exp + ":" + file)) {
            return new Response("<!DOCTYPE html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:sans-serif;text-align:center;padding:60px;color:#5B6577;background:#14213D'><div style='color:#E88;font-size:15px'>\u786E\u8BA4\u94FE\u63A5\u5DF2\u8FC7\u671F\uFF0815\u5206\u949F\u6709\u6548\uFF09\u2014\u2014\u8BF7\u91CD\u65B0\u8F93\u5165\u5220\u9664\u7801</div><p style='margin-top:18px'><a href='/share' style='color:#E8BC4F'>\u8FD4\u56DE\u9996\u9875</a></p></body>", { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
          }
          const creds = await davCreds(env);
          if (!creds) return new Response("\u540E\u53F0\u672A\u914D\u7F6E", { status: 500 });
          const auth = btoa(creds.account + ":" + creds.password);
          {
            const Lx = await davList(env);
            if (!Lx.err && Lx.files.some((f) => ((f.path ? f.path + "/" + f.name : f.name) + "/").indexOf(file + "/") === 0)) {
              const fidOf2 = /* @__PURE__ */ __name((f) => f.path ? f.path + "/" + f.name : f.name, "fidOf2");
              for (const f2 of Lx.files) {
                if (fidOf2(f2).indexOf(file + "/") === 0) await fetch("https://webdav.123pan.cn/webdav/" + davSeg(fidOf2(f2)), { method: "DELETE", headers: { "Authorization": "Basic " + auth } });
              }
              await fetch("https://webdav.123pan.cn/webdav/" + davSeg(file), { method: "DELETE", headers: { "Authorization": "Basic " + auth } });
              let ac = [];
              try {
                ac = JSON.parse(await TVKV.get("share_codes") || "[]");
              } catch (e) {
              }
              const cl2 = ac.filter((c) => c.file !== file && !String(c.file || "").startsWith(file + "/"));
              await TVKV.put("share_codes", JSON.stringify(cl2));
              try {
                const m2 = await shareMetaAll();
                let ch2 = false;
                Object.keys(m2).forEach((k) => {
                  if (k === file || k.startsWith(file + "/")) {
                    delete m2[k];
                    ch2 = true;
                  }
                });
                if (ch2) await TVKV.put("share_file_meta", JSON.stringify(m2));
              } catch (e) {
              }
              try {
                const L2 = await davList(env);
                if (!L2.err) {
                  let t2 = 0;
                  L2.files.forEach((x) => t2 += x.size || 0);
                  await TVKV.put("share_used_bytes", String(t2));
                }
              } catch (e) {
              }
              return new Response(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>\u6587\u4EF6\u5206\u4EAB\u7AD9</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2316233b'/%3E%3Cpath d='M13 21a4 4 0 0 1 4-4h10.5l4.5 5.5H47a4 4 0 0 1 4 4V43a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z' fill='%23E8BC4F'/%3E%3Cpath d='M13 27h38' stroke='%2316233b' stroke-width='1.6' opacity='.35'/%3E%3C/svg%3E"/><style>${pageCSS}</style></head><body><div class="box" style="width:min(94vw,440px)"><h1>\u{1F5D1} \u6574\u4E2A\u6587\u4EF6\u5939\u5DF2\u5220\u9664</h1><p style="font-size:15px;line-height:1.9;color:rgba(255,255,255,.6)">\u6587\u4EF6\u5939\u53CA\u5176\u4E2D\u6240\u6709\u6587\u4EF6\u5DF2\u5220\u9664\uFF0C<br>\u6574\u4F53\u63D0\u53D6\u7801/\u5220\u9664\u7801\u4E00\u5E76\u9500\u6BC1\u3002</p><a href="/share" style="display:block;text-align:center;padding:11px;border-radius:10px;border:1px solid rgba(255,255,255,.25);color:rgba(255,255,255,.75);text-decoration:none;font-size:15px">\u2190 \u8FD4\u56DE\u9996\u9875</a></div></body></html>`, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
            }
          }
          const tryPaths = [];
          if (/^20\d{2}\//.test(file)) tryPaths.push(file);
          else {
            tryPaths.push(file);
            const MM = await davEnsureMonth(env);
            if (!MM.err) tryPaths.push(MM.dir + "/" + file);
          }
          let r = null, delStatus = 0;
          for (const tp of tryPaths) {
            r = await fetch("https://webdav.123pan.cn/webdav/" + davSeg(tp), { method: "DELETE", headers: { "Authorization": "Basic " + auth } });
            delStatus = r.status;
            if (delStatus === 204 || delStatus === 200) break;
          }
          if (delStatus !== 204 && delStatus !== 200 && delStatus !== 404) {
            return new Response("<!DOCTYPE html><meta charset=utf-8><body style='font-family:sans-serif;text-align:center;padding:60px;background:#14213D;color:#E88'>\u5220\u9664\u5931\u8D25\uFF08123 \u8FD4\u56DE " + delStatus + "\uFF09\u2014\u2014\u8BF7\u7A0D\u540E\u518D\u8BD5\u6216\u8054\u7CFB\u5206\u4EAB\u4EBA</body>", { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } });
          }
          let allCodes = [];
          try {
            allCodes = JSON.parse(await TVKV.get("share_codes") || "[]");
          } catch (e) {
            allCodes = [];
          }
          const cleaned = allCodes.filter((c) => c.file !== file && (c.file || "").split("/").pop() !== String(file).split("/").pop());
          await TVKV.put("share_codes", JSON.stringify(cleaned));
          try {
            const m2 = await shareMetaAll();
            if (m2[file]) {
              delete m2[file];
              await TVKV.put("share_file_meta", JSON.stringify(m2));
            }
          } catch (e) {
          }
          return new Response(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>\u6587\u4EF6\u5206\u4EAB\u7AD9 \xB7 \u5DF2\u5220\u9664</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2316233b'/%3E%3Cpath d='M13 21a4 4 0 0 1 4-4h10.5l4.5 5.5H47a4 4 0 0 1 4 4V43a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z' fill='%23E8BC4F'/%3E%3Cpath d='M13 27h38' stroke='%2316233b' stroke-width='1.6' opacity='.35'/%3E%3C/svg%3E"/><style>${pageCSS}</style></head><body><div class="box" style="width:min(94vw,460px)">
<h1>\u2705 \u5DF2\u5220\u9664</h1>
<p style="margin:14px 0;line-height:1.9;font-size:14.5px">\u6587\u4EF6\u5DF2\u5220\u9664\uFF0C\u63D0\u53D6\u7801\u4E0E\u5220\u9664\u7801\u5DF2\u5168\u90E8\u5931\u6548\uFF1A</p>
<div style="background:rgba(46,125,79,.15);border:1px solid rgba(46,125,79,.5);border-radius:10px;padding:13px 16px;margin-bottom:14px;word-break:break-all"><b>${file.replace(/</g, "&lt;")}</b></div>
<p style="color:rgba(255,255,255,.6);font-size:14.5px;line-height:1.8;margin-bottom:16px">\u6587\u4EF6\u5DF2\u5220\u9664\u3002\u611F\u8C22\u4F7F\u7528\uFF01</p>
<a href="/share" style="display:block;text-align:center;padding:12px;border-radius:11px;background:linear-gradient(135deg,var(--gold),var(--goldL));color:#14213D;font-weight:700;font-size:15px;text-decoration:none">\u8FD4\u56DE\u9996\u9875\uFF08\u53EF\u7EE7\u7EED\u8F93\u7801\uFF09</a>
</div></body></html>`, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
        }
        return new Response(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>\u6587\u4EF6\u5206\u4EAB\u7AD9</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2316233b'/%3E%3Cpath d='M13 21a4 4 0 0 1 4-4h10.5l4.5 5.5H47a4 4 0 0 1 4 4V43a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z' fill='%23E8BC4F'/%3E%3Cpath d='M13 27h38' stroke='%2316233b' stroke-width='1.6' opacity='.35'/%3E%3C/svg%3E"/><style>${pageCSS}</style></head><body><a href="/share/admin.html" style="position:fixed;top:12px;right:14px;font-size:14px;color:rgba(255,255,255,.55);text-decoration:none;border:1px solid rgba(255,255,255,.2);padding:7px 14px;border-radius:99px;background:rgba(255,255,255,.07)">\u2699\uFE0F \u540E\u53F0\u7BA1\u7406</a><div class="box">
<h1>\u{1F4C1} \u6587\u4EF6\u5206\u4EAB\u7AD9</h1><p>\u8F93\u5165\u63D0\u53D6\u7801\u53EF\u4EE5\u4E0B\u8F7D\u6587\u4EF6\uFF0C<br>\u8F93\u5165\u5220\u9664\u7801\u53EF\u4EE5\u5220\u9664\u6587\u4EF6\u3002</p>
<div class="err">\u7801\u4E0D\u5BF9\uFF0C\u8BF7\u6838\u5BF9\u540E\u91CD\u8BD5</div>
<form method="POST" action="/share"><input type="password" name="pw" placeholder="\u8BF7\u5728\u8FD9\u91CC\u8F93\u5165" autocomplete="new-password" readonly onfocus="this.removeAttribute('readonly')" required><button type="submit">\u63D0 \u4EA4</button></form>
<p style="margin-top:14px;font-size:16px">\u63D0\u53D6\u7801/\u5220\u9664\u7801\u8BF7\u8054\u7CFB\u6587\u4EF6\u5206\u4EAB\u4EBA\u83B7\u53D6</p>
<div style="margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.12)">
<a href="/share/up" style="display:block;text-align:center;padding:12px;border-radius:11px;background:linear-gradient(135deg,#2E7D4F,#4E9E77);color:#fff;text-decoration:none;font-weight:700;font-size:18px">\u{1F4E4} \u6211\u8981\u5206\u4EAB\u6587\u4EF6</a>
<p style="font-size:15px;margin-top:8px;margin-bottom:0">\u4E0A\u4F20\u6587\u4EF6\u5E76\u81EA\u5DF1\u8BBE\u7F6E\u63D0\u53D6\u7801\u548C\u5220\u9664\u7801</p>
</div>
<p style="margin-top:16px"><a href="/" style="color:rgba(255,255,255,.5);font-size:14.5px;text-decoration:none">\u2190 \u8FD4\u56DE\u6B22\u4E50\u5DE5\u5177\u7AD9</a></p>
</div></body></html>`, { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      {
        const sess = await okShareToken(env, t);
        if (sess) {
          const L = await davList(env);
          const uaWv = /wv\)|WebView/i.test(request.headers.get("User-Agent") || "");
          const fmt = /* @__PURE__ */ __name((n) => n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB", "fmt");
          let rows = "";
          if (L.err) rows = `<p style="padding:20px 0;color:#E88">${L.err}</p>`;
          else {
            const show = sess.file === "*" ? L.files : L.files.filter((f) => {
              const ffx = f.path ? f.path + "/" + f.name : f.name;
              return f.name === sess.file || ffx === sess.file || ffx.indexOf(sess.file + "/") === 0;
            });
            if (!show.length) rows = `<p style="padding:30px 0">\u60A8\u8981\u7684\u6587\u4EF6\u6682\u4E0D\u5728\u5171\u4EAB\u6587\u4EF6\u5939\uFF08\u53EF\u80FD\u5DF2\u88AB\u79FB\u8D70\u6216\u6539\u540D\uFF09\u2014\u2014\u8BF7\u8054\u7CFB\u5206\u4EAB\u4EBA</p>`;
            else rows = show.map((f) => {
              const fid = f.path ? f.path + "/" + f.name : f.name;
              return `<div class="file"><input type="checkbox" class="dlChk" data-url="/share/dl/${encodeURIComponent(fid)}?t=${encodeURIComponent(t)}" style="flex-shrink:0;accent-color:#E8BC4F;margin:0 2px 0 0" title="\u52FE\u9009\u540E\u53EF\u6279\u91CF\u4E0B\u8F7D"><div class="fi">\u{1F4C4}</div><div class="fn"><b>${f.name.replace(/</g, "&lt;")}</b><span>${fmt(f.size)}${f.path ? " \xB7 " + f.path : ""}</span></div><a href="/share/dl/${encodeURIComponent(fid)}?t=${encodeURIComponent(t)}">\u4E0B\u8F7D</a>${uaWv ? `<button type="button" onclick="cpL(this)" style="background:rgba(255,255,255,.08);color:#E8BC4F;border:1px solid rgba(232,188,79,.35);border-radius:7px;padding:7px 11px;font-size:13px;cursor:pointer">\u{1F4CB}\u590D\u5236\u94FE\u63A5</button>` : ""}</div>`;
            }).join("");
            if (rows && show.length > 1) rows = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:10px 12px;background:rgba(232,188,79,.07);border:1px solid rgba(232,188,79,.3);border-radius:10px;flex-wrap:wrap"><label style="display:flex;align-items:center;gap:6px;font-size:14px;color:rgba(255,255,255,.75);cursor:pointer"><input type="checkbox" onchange="var q=document.querySelectorAll('.dlChk');for(var i=0;i<q.length;i++)q[i].checked=this.checked" style="accent-color:#E8BC4F">\u5168\u9009</label><button type="button" onclick="dlBatch(1)" style="background:linear-gradient(135deg,#D9A521,#E8BC4F);color:#14213D;border:none;border-radius:8px;padding:8px 16px;font-size:14px;font-weight:700;cursor:pointer">\u2B07 \u4E00\u952E\u5168\u90E8\u4E0B\u8F7D</button><button type="button" onclick="dlBatch(0)" style="background:rgba(255,255,255,.08);color:#E8BC4F;border:1px solid rgba(232,188,79,.4);border-radius:8px;padding:8px 16px;font-size:14px;cursor:pointer">\u4E0B\u8F7D\u6240\u9009</button><span id="dlStat" style="font-size:12.5px;color:rgba(255,255,255,.5)"></span></div>` + rows;
          }
          return new Response(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>\u6587\u4EF6\u5206\u4EAB\u7AD9</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2316233b'/%3E%3Cpath d='M13 21a4 4 0 0 1 4-4h10.5l4.5 5.5H47a4 4 0 0 1 4 4V43a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z' fill='%23E8BC4F'/%3E%3Cpath d='M13 27h38' stroke='%2316233b' stroke-width='1.6' opacity='.35'/%3E%3C/svg%3E"/><style>${pageCSS}</style></head><body><a href="/share/admin.html" style="position:fixed;top:12px;right:14px;font-size:14px;color:rgba(255,255,255,.55);text-decoration:none;border:1px solid rgba(255,255,255,.2);padding:7px 14px;border-radius:99px;background:rgba(255,255,255,.07)">\u2699\uFE0F \u540E\u53F0\u7BA1\u7406</a><div class="box" style="width:min(94vw,560px)">
<h1>\u{1F4C1} \u6587\u4EF6\u5206\u4EAB\u7AD9</h1>
${rows}
<div style="margin-top:14px">
<a href="/share" style="display:block;text-align:center;padding:11px;border-radius:11px;border:1px solid rgba(232,188,79,.5);color:#E8BC4F;text-decoration:none;font-size:14px">\u2190 \u8FD4\u56DE\u6587\u4EF6\u5206\u4EAB\u7AD9\u4E3B\u9875</a>
</div>
${uaWv ? '<div style="margin:0 0 12px;padding:10px 13px;background:rgba(232,188,79,.08);border:1px solid rgba(232,188,79,.35);border-radius:10px;font-size:13.5px;line-height:1.8;color:rgba(255,255,255,.8)">\u{1F4F1} \u60A8\u6B63\u5728<b style="color:#E8BC4F">APP\u5185\u6D4F\u89C8</b>\u2014\u2014\u4E0B\u8F7D\u82E5\u4E0D\u5F39\u7A97\uFF1A\u70B9\u6BCF\u884C <b style="color:#E8BC4F">\u{1F4CB}\u590D\u5236\u94FE\u63A5</b>\uFF0C\u7136\u540E\u6253\u5F00\u624B\u673A\u6D4F\u89C8\u5668\u7C98\u8D34\u6253\u5F00\u5373\u53EF\u4E0B\u8F7D</div>' : ""}
<script>function cpL(btn){var c=btn.parentNode.querySelector('.dlChk');var u=location.origin+c.getAttribute('data-url');var t2=document.createElement('textarea');t2.value=u;t2.style.position='fixed';t2.style.opacity='0';document.body.appendChild(t2);t2.select();t2.setSelectionRange(0,9999);try{document.execCommand('copy');btn.textContent='\u5DF2\u590D\u5236\u2713';setTimeout(function(){btn.textContent='\u{1F4CB}\u590D\u5236\u94FE\u63A5';},1800);}catch(e){prompt('\u8BF7\u624B\u52A8\u590D\u5236\u4E0B\u8F7D\u94FE\u63A5\uFF1A',u);}t2.remove();}
function dlBatch(all){var q=[].slice.call(document.querySelectorAll('.dlChk'));var list=all?q:q.filter(function(c){return c.checked});var st=document.getElementById('dlStat');if(!list.length){st.textContent='\u8BF7\u5148\u52FE\u9009\u8981\u4E0B\u8F7D\u7684\u6587\u4EF6';return;}st.textContent='\u5F00\u59CB\u4E0B\u8F7D '+list.length+' \u4E2A\u6587\u4EF6\u2026\uFF08\u591A\u4E2A\u6587\u4EF6\u4F1A\u9010\u4E2A\u5F00\u59CB\uFF0C\u8BF7\u5141\u8BB8\u6D4F\u89C8\u5668\u8FDE\u7EED\u4E0B\u8F7D\uFF09';list.forEach(function(c,i){setTimeout(function(){var f=document.createElement('iframe');f.style.display='none';f.src=c.getAttribute('data-url');document.body.appendChild(f);},i*1500);});}<\/script></body></html>`, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
        }
      }
      const shareDefDays = await shareDefaultDays();
      return new Response(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>\u6587\u4EF6\u5206\u4EAB\u7AD9</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2316233b'/%3E%3Cpath d='M13 21a4 4 0 0 1 4-4h10.5l4.5 5.5H47a4 4 0 0 1 4 4V43a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z' fill='%23E8BC4F'/%3E%3Cpath d='M13 27h38' stroke='%2316233b' stroke-width='1.6' opacity='.35'/%3E%3C/svg%3E"/><style>${pageCSS}</style></head><body><a href="/share/admin.html" style="position:fixed;top:12px;right:14px;font-size:14px;color:rgba(255,255,255,.55);text-decoration:none;border:1px solid rgba(255,255,255,.2);padding:7px 14px;border-radius:99px;background:rgba(255,255,255,.07)">\u2699\uFE0F \u540E\u53F0\u7BA1\u7406</a><div class="box">
<h1>\u{1F4C1} \u6587\u4EF6\u5206\u4EAB\u7AD9</h1><p>\u8F93\u5165\u63D0\u53D6\u7801\u53EF\u4EE5\u4E0B\u8F7D\u6587\u4EF6\uFF0C<br>\u8F93\u5165\u5220\u9664\u7801\u53EF\u4EE5\u5220\u9664\u6587\u4EF6\u3002</p>
<p style="margin-top:10px;font-size:16px">\u63D0\u53D6\u7801/\u5220\u9664\u7801\u8BF7\u8054\u7CFB\u6587\u4EF6\u5206\u4EAB\u4EBA\u83B7\u53D6</p>
<form method="POST" action="/share"><input type="password" name="pw" placeholder="\u8BF7\u5728\u8FD9\u91CC\u8F93\u5165" autocomplete="new-password" readonly onfocus="this.removeAttribute('readonly')" required><button type="submit">\u63D0 \u4EA4</button></form>
<div style="margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.12)">
<a href="/share/up" style="display:block;text-align:center;padding:12px;border-radius:11px;background:linear-gradient(135deg,#2E7D4F,#4E9E77);color:#fff;text-decoration:none;font-weight:700;font-size:18px">\u{1F4E4} \u70B9\u6B64\u53BB\u4E0A\u4F20\u5E76\u5206\u4EAB\u6587\u4EF6</a>
<p style="font-size:14px;color:rgba(255,255,255,.6);margin-top:8px;margin-bottom:0">\u23F3 \u6587\u4EF6\u4E0A\u4F20\u540E\u9ED8\u8BA4\u4FDD\u5B58 <b style="color:#E8BC4F">${shareDefDays}</b> \u5929</p>
</div>
<p style="margin-top:16px"><a href="/" style="color:rgba(255,255,255,.5);font-size:14.5px;text-decoration:none">\u2190 \u8FD4\u56DE\u6B22\u4E50\u5DE5\u5177\u7AD9</a></p>
</div></body></html>`, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (pathname === "/tool/__auth/token-mail") {
      const tokenMailPage = /* @__PURE__ */ __name((info) => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>\u627E\u56DE GitHub \u4EE4\u724C</title><style>
:root{--deep:#14213D;--gold:#D9A521;--goldL:#E8BC4F;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:"Microsoft YaHei",sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#14213D 0%,#1B2A4A 55%,#2A4370 100%);}
.box{background:rgba(255,255,255,.06);border:1px solid rgba(217,165,33,.35);border-radius:16px;padding:36px 32px;width:min(92vw,400px);text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.4);}
h1{color:#fff;font-size:19px;margin-bottom:8px;}p{color:rgba(255,255,255,.6);font-size:13px;margin-bottom:18px;line-height:1.7;}
input{width:100%;padding:12px 15px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:14px;margin-bottom:12px;outline:none;text-align:center;}
input:focus{border-color:var(--gold);}
button{width:100%;padding:15px;border:none;border-radius:10px;cursor:pointer;font-size:18px;font-weight:bold;background:linear-gradient(135deg,var(--gold),var(--goldL));color:#14213D;}
.ok{color:#7ED8A0;margin-bottom:12px;font-size:14px;}.err{color:#E88;margin-bottom:12px;font-size:13.5px;}
a{color:var(--goldL);font-size:12.5px;text-decoration:none;display:inline-block;margin-top:14px;}
</style></head><body><a href="/share/admin.html" style="position:fixed;top:12px;right:14px;font-size:14px;color:rgba(255,255,255,.55);text-decoration:none;border:1px solid rgba(255,255,255,.2);padding:7px 14px;border-radius:99px;background:rgba(255,255,255,.07)">\u2699\uFE0F \u540E\u53F0\u7BA1\u7406</a><div class="box">
<h1>\u{1F511} \u627E\u56DE GitHub \u4EE4\u724C</h1>
<p>\u8F93\u5165\u672C\u7AD9\u7684\u627E\u56DE\u90AE\u7BB1\uFF0C\u4E91\u7AEF\u5907\u4EFD\u7684\u4EE4\u724C\u5C06\u53D1\u9001\u5230\u90AE\u7BB1</p>
${info && info.ok ? '<div class="ok">\u2705 ' + info.text + "</div>" : ""}
${info && !info.ok ? '<div class="err">' + info.text + "</div>" : ""}
<form method="POST" action="/tool/__auth/token-mail">
<input type="email" name="email" placeholder="\u627E\u56DE\u90AE\u7BB1" required>
<button type="submit">\u53D1\u9001\u4EE4\u724C\u5230\u90AE\u7BB1</button>
</form>
<a href="/tool/admin.html">\u2190 \u8FD4\u56DE\u767B\u5F55</a>
</div></body></html>`, "tokenMailPage");
      if (request.method === "GET") return new Response(tokenMailPage(null), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      const fd = await request.formData();
      const email = (fd.get("email") || "").trim().toLowerCase();
      const saved = (await TVKV.get("recovery_email") || "197576@163.com").toLowerCase();
      if (email !== saved) return new Response(tokenMailPage({ ok: false, text: "\u8FD9\u4E2A\u90AE\u7BB1\u4E0D\u662F\u672C\u7AD9\u7684\u627E\u56DE\u90AE\u7BB1" }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      const bak = JSON.parse(await TVKV.get("gh_backup_token") || "null");
      if (!bak || !bak.token) return new Response(tokenMailPage({ ok: false, text: "\u4E91\u7AEF\u8FD8\u6CA1\u6709\u4EE4\u724C\u5907\u4EFD\u2014\u2014\u8BF7\u5148\u7528\u4EE4\u724C\u767B\u5F55\u4E00\u6B21\u5E73\u53F0\uFF08\u767B\u5F55\u6210\u529F\u81EA\u52A8\u5907\u4EFD\uFF09" }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      if (!env.RESEND_API_KEY) return new Response(tokenMailPage({ ok: false, text: "\u90AE\u4EF6\u670D\u52A1\u8FD8\u6CA1\u914D\u7F6E\u597D\uFF08\u7B49 Resend \u94A5\u5319\u63D2\u4E0A\u5373\u901A\uFF09" }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "HuanLe Tools <onboarding@resend.dev>",
          to: [saved],
          subject: "\u3010\u6B22\u4E50GitHub\u7BA1\u7406\u5E73\u53F0\u3011\u60A8\u7684\u767B\u5F55\u4EE4\u724C",
          html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #DFE4EC;border-radius:12px">
<h2 style="color:#14213D">\u{1F511} GitHub \u7BA1\u7406\u5E73\u53F0 \xB7 \u767B\u5F55\u4EE4\u724C</h2>
<p style="color:#5B6577;font-size:14px">\u60A8\u7533\u8BF7\u627E\u56DE tl.efcc.cc/tool/admin.html \u7684\u767B\u5F55\u4EE4\u724C\uFF0C\u4EE5\u4E0B\u662F\u4E91\u7AEF\u5907\u4EFD\uFF1A</p>
<div style="background:#F6F8FA;border:1px solid #D0D7DE;border-radius:8px;padding:12px;font-family:monospace;font-size:12px;word-break:break-all;margin:14px 0">${bak.token}</div>
<p style="color:#5B6577;font-size:14px">\u628A\u4E0A\u9762\u8FD9\u4E32\u5B8C\u6574\u590D\u5236\uFF0C\u7C98\u8D34\u5230\u767B\u5F55\u6846\u5373\u53EF\u3002</p>
<p style="background:#FFF8E6;border-left:4px solid #D9A521;padding:10px 12px;font-size:13px;color:#6B5B1E;line-height:1.8">
<b>\u4E07\u4E00\u4EE4\u724C\u5DF2\u5931\u6548</b>\uFF08\u7C98\u8D34\u540E\u63D0\u793A"\u767B\u5F55\u5931\u8D25"\uFF09\uFF1A<br>
\u2460 \u6253\u5F00 GitHub \u2192 Settings \u2192 Developer settings \u2192 Fine-grained tokens<br>
\u2461 \u751F\u6210\u65B0\u4EE4\u724C\uFF1A\u52FE\u9009\u4ED3\u5E93 zhufenghua313/33\uFF0C\u6743\u9650\u7ED9 Contents \u7684\u8BFB\u5199<br>
\u2462 \u7528\u65B0\u4EE4\u724C\u767B\u5F55\u2014\u2014\u65B0\u4EE4\u724C\u4E00\u6837\u80FD\u767B\u5F55\u672C\u5E73\u53F0<br>
\u2463 \u767B\u5F55\u6210\u529F\u540E\u4E91\u7AEF\u5907\u4EFD\u81EA\u52A8\u66F4\u65B0\u4E3A\u65B0\u4EE4\u724C\uFF0C\u4E0B\u6B21\u90AE\u4EF6\u91CC\u6536\u5230\u7684\u5C31\u662F\u65B0\u7684
</p>
<p style="color:#8B93A6;font-size:12px">\u6B64\u90AE\u4EF6\u7531\u60A8\u672C\u4EBA\u89E6\u53D1\u3002\u5982\u975E\u672C\u4EBA\uFF0C\u8BF4\u660E\u6709\u4EBA\u77E5\u9053\u60A8\u7684\u90AE\u7BB1\u2014\u2014\u4EE4\u724C\u53EA\u5728\u4ED6\u4E0D\u77E5\u9053\u7684\u60C5\u51B5\u4E0B\u5B89\u5168\uFF0C\u5EFA\u8BAE\u53BB GitHub \u64A4\u9500\u65E7\u4EE4\u724C\uFF08Settings \u2192 Tokens \u2192 Delete\uFF09\u5E76\u751F\u6210\u65B0\u7684\u3002\u770B\u5B8C\u53EF\u5220\u9664\u672C\u90AE\u4EF6\u3002</p>
</div>`
        })
      });
      if (!r.ok) return new Response(tokenMailPage({ ok: false, text: "\u90AE\u4EF6\u53D1\u9001\u5931\u8D25\uFF08\u7A0D\u540E\u518D\u8BD5\uFF09" }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      return new Response(tokenMailPage({ ok: true, text: "\u4EE4\u724C\u5DF2\u53D1\u9001\u5230 " + saved + "\uFF0C\u8BF7\u67E5\u6536\uFF08\u542B\u5931\u6548\u8865\u6551\u6307\u5F15\uFF09" }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
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
<p><a href="https://tl.efcc.cc/soft/__auth/reset?token=${tok}" style="display:inline-block;background:#D9A521;color:#14213D;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">\u70B9\u6B64\u8BBE\u7F6E\u65B0\u5BC6\u7801</a></p>
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
        return new Response('<!DOCTYPE html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="background:#14213D"><p style="color:#E8BC4F;font-family:sans-serif;text-align:center;padding:40vh 0 0">\u6B63\u5728\u8FDB\u5165\u2026</p><script>document.cookie="' + cN + "=" + tok1 + '; Path=/; Secure; Max-Age=2592000; SameSite=Lax";location.replace("' + dest1 + '");<\/script>', {
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
          return new Response('<!DOCTYPE html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="background:#14213D"><p style="color:#E8BC4F;font-family:sans-serif;text-align:center;padding:40vh 0 0">\u6B63\u5728\u8FDB\u5165\u2026</p><script>document.cookie="sports_auth=' + tok + '; Path=/; Secure; Max-Age=2592000; SameSite=Lax";location.replace("' + dest2 + '");<\/script>', {
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
          return Response.redirect(new URL("/apps/sports/home.html", url.origin).toString(), 302);
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
      const fields = "status,message,country,countryCode,regionName,city,district,zip,lat,lon,timezone,isp,org,as,reverse,mobile,proxy,hosting,query";
      let ip = t || request.headers.get("cf-connecting-ip") || "";
      if (t && !/^\d{1,3}(\.\d{1,3}){3}$/.test(t) && !t.includes(":")) {
        try {
          const dr = await fetch("https://dns.google/resolve?name=" + encodeURIComponent(t) + "&type=A", { cf: { cacheTtl: 600, cacheEverything: true } });
          const dj = await dr.json();
          const a = (dj.Answer || []).filter((x) => x.type === 1);
          if (!a.length) return new Response(JSON.stringify({ status: "fail", message: "\u57DF\u540D\u89E3\u6790\u5931\u8D25\uFF08\u65E0 A \u8BB0\u5F55\uFF09" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
          ip = a[0].data;
        } catch (e) {
          return new Response(JSON.stringify({ status: "fail", message: "\u57DF\u540D\u89E3\u6790\u5F02\u5E38\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        }
      }
      try {
        const [ra, rm] = await Promise.all([
          fetch("http://ip-api.com/json/" + encodeURIComponent(ip) + "?lang=zh-CN&fields=" + fields, { cf: { cacheTtl: 3600, cacheEverything: true } }).then((r) => r.json()).catch(() => null),
          fetch("https://api.mir6.com/api/ip_json?ip=" + encodeURIComponent(ip), { cf: { cacheTtl: 3600, cacheEverything: true } }).then((r) => r.json()).catch(() => null)
        ]);
        const a = ra && ra.status === "success" ? ra : null;
        const m = rm && rm.code === 200 && rm.data ? rm.data : null;
        if (!a && !m) return new Response(JSON.stringify({ status: "fail", message: "\u67E5\u8BE2\u670D\u52A1\u5F02\u5E38\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
        const out = {
          status: "success",
          query: ip,
          country: m && m.country || a && a.country || "",
          countryCode: a && a.countryCode || m && m.countryCode || "",
          regionName: m && m.province || a && a.regionName || "",
          city: m && m.city || a && a.city || "",
          district: m && m.districts || a && a.district || "",
          zip: m && m.zipcode || a && a.zip || "",
          lat: a && a.lat || null,
          lon: a && a.lon || null,
          timezone: a && a.timezone || "",
          isp: m && m.isp || a && a.isp || "",
          org: a && a.org || m && m.idc || "",
          as: a && a.as || "",
          reverse: a && a.reverse || "",
          net: m && m.net || "",
          mobile: m ? /移动/.test(m.isp || "") : !!(a && a.mobile),
          proxy: a ? !!a.proxy : false,
          hosting: a ? !!a.hosting : false,
          src: m && a ? "mir6 \u4E2D\u6587\u533A\u53BF\u5E93 + ip-api \u53CC\u6E90\uFF08\u7F13\u5B581\u5C0F\u65F6\uFF09" : m ? "mir6\uFF08\u7F13\u5B581\u5C0F\u65F6\uFF09" : "ip-api.com\uFF08\u7F13\u5B581\u5C0F\u65F6\uFF09"
        };
        return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" } });
      } catch (e) {
        return new Response(JSON.stringify({ status: "fail", message: "\u67E5\u8BE2\u670D\u52A1\u5F02\u5E38\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      }
    }
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
          return new Response(resp.body, { status: 200, headers });
        }
        if (resp.status === 404) saw404 = true;
      } catch (e) {
      }
    }
    return saw404 ? new Response("Not Found", { status: 404 }) : new Response("all upstreams failed", { status: 502 });
}
var worker_default = {
  async fetch(request0, env) {
    const u0 = new URL(request0.url);
    const m0 = u0.pathname.match(/^\/sports\/([a-z0-9][a-z0-9-]{0,30})(?=\/|$)/);
    if (m0) {
      const rest0 = u0.pathname.slice(m0[0].length) || "/";
      if (rest0 === "/") return new Response(null, { status: 302, headers: { Location: m0[0] + "/soft/sports/home.html" } });
      request0 = new Request(new URL(rest0 + u0.search, u0.origin).toString(), request0);
    }
    const resp0 = await fetchInner(request0, env);
    if (m0 && resp0.status >= 300 && resp0.status < 400) {
      const loc0 = resp0.headers.get("Location");
      if (loc0) {
        let nl0 = null;
        try {
          const lu0 = new URL(loc0, u0.origin);
          if (lu0.origin === u0.origin && !lu0.pathname.startsWith(m0[0] + "/") && lu0.pathname !== "/") nl0 = m0[0] + lu0.pathname + lu0.search;
        } catch (e) {}
        if (nl0) {
          const h1 = new Headers(resp0.headers); h1.set("Location", nl0);
          return new Response(resp0.body, { status: resp0.status, headers: h1 });
        }
      }
    }
    const ct0 = resp0.headers.get("Content-Type") || "";
    if (m0 && ct0.includes("text/html")) {
      let t0 = await resp0.text();
      const P0 = "/sports/" + m0[1];
      t0 = t0.replaceAll('"/soft/', '"' + P0 + '/soft/').replaceAll('"/apps/', '"' + P0 + '/apps/');
      const h0 = new Headers(resp0.headers); h0.delete("Content-Length");
      return new Response(t0, { status: resp0.status, headers: h0 });
    }
    return resp0;
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map