import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ★ 凭据一律不入库（2026-10-17 修复：本文件原先硬编码了真实 IC 与密码，
//   已随全部历史提交泄漏）。优先级：环境变量 → 仓库根的 credentials.json
//   （该文件已被 .gitignore 挡掉）。两者都没有就明确报错退出，
//   **绝不把真实凭据写回源码**。
function loadCreds() {
  const { IDME_IC, IDME_PW } = process.env;
  if (IDME_IC && IDME_PW) return { ic: IDME_IC, pw: IDME_PW };
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const j = JSON.parse(readFileSync(join(root, 'credentials.json'), 'utf8'));
    if (j.ic && j.password) return { ic: j.ic, pw: j.password };
  } catch { /* 落到下面的报错 */ }
  console.error('缺少凭据：请设置环境变量 IDME_IC / IDME_PW，或在仓库根放置 credentials.json');
  process.exit(2);
}

const cookies = {};

function parseCookies(headers) {
  let list = [];
  if (headers && typeof headers.getSetCookie === 'function') {
    list = headers.getSetCookie();
  } else if (headers) {
    const raw = (typeof headers.get === 'function') ? headers.get('set-cookie') : (headers['Set-Cookie'] || headers['set-cookie']);
    if (raw) {
      list = Array.isArray(raw) ? raw : [raw];
    }
  }

  for (const item of list) {
    // If multiple cookies are comma-separated
    const parts = item.split(/,(?=[A-Za-z0-9_-]+=)/);
    for (const p of parts) {
      const seg = p.trim().split(';')[0];
      const eqIdx = seg.indexOf('=');
      if (eqIdx > 0) {
        const k = seg.slice(0, eqIdx).trim();
        const v = seg.slice(eqIdx + 1).trim();
        if (k && v) {
          cookies[k] = v;
        }
      }
    }
  }
}

function getCookieHeader() {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function extractToken(html) {
  if (!html) return null;
  const m1 = html.match(/name=["']_token["'][^>]*?value=["']([^"']+)["']/i);
  if (m1) return m1[1];
  const m2 = html.match(/value=["']([^"']+)["'][^>]*?name=["']_token["']/i);
  if (m2) return m2[1];
  const m3 = html.match(/<input[^>]*?name=["']_token["'][^>]*>/i);
  if (m3) {
    const mv = m3[0].match(/value=["']([^"']+)["']/i);
    if (mv) return mv[1];
  }
  return null;
}

async function fetchWithCookies(url, options = {}, maxRedirects = 5) {
  let currUrl = url;
  let currOpts = { ...options };
  for (let i = 0; i < maxRedirects; i++) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      ...(currOpts.headers || {})
    };
    const cStr = getCookieHeader();
    if (cStr) headers['Cookie'] = cStr;

    const res = await fetch(currUrl, {
      ...currOpts,
      headers,
      redirect: 'manual'
    });

    parseCookies(res.headers);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (loc) {
        const nextUrl = new URL(loc, currUrl).toString();
        console.log(`  [Redirect ${res.status}] -> ${nextUrl}`);
        currUrl = nextUrl;
        currOpts = {
          headers: {
            'Referer': currUrl
          }
        };
        continue;
      }
    }
    const text = await res.text();
    return { res, url: currUrl, text };
  }
  throw new Error('Too many redirects');
}

async function run() {
  const { ic, pw } = loadCreds();

  console.log('[1/4] Connecting to idMe login page...');
  const r1 = await fetchWithCookies('https://idme.moe.gov.my/login');
  const token1 = extractToken(r1.text);
  console.log('Token 1:', token1 ? 'OK' : 'MISSING');

  console.log('[2/4] Semakan verification...');
  const p2 = new URLSearchParams();
  p2.append('_token', token1);
  p2.append('ic', ic);
  const r2 = await fetchWithCookies('https://idme.moe.gov.my/daftarawam/semakanverification', {
    method: 'POST',
    body: p2,
    headers: {
      'Origin': 'https://idme.moe.gov.my',
      'Referer': 'https://idme.moe.gov.my/login',
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  const token2 = extractToken(r2.text);
  console.log('Token 2:', token2 ? 'OK' : 'MISSING');

  console.log('[3/4] Submitting credentials...');
  const p3 = new URLSearchParams();
  p3.append('_token', token2);
  p3.append('check', '2');
  p3.append('ic', ic);
  p3.append('password', pw);
  const r3 = await fetchWithCookies('https://idme.moe.gov.my/login', {
    method: 'POST',
    body: p3,
    headers: {
      'Origin': 'https://idme.moe.gov.my',
      'Referer': 'https://idme.moe.gov.my/daftarawam/semakanverification',
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  console.log('Login final URL:', r3.url);

  console.log('[4/4] Fetching list_aplikasi for SSO...');
  const rApp = await fetchWithCookies('https://idme.moe.gov.my/list_aplikasi', {
    headers: {
      'Referer': 'https://idme.moe.gov.my/home'
    }
  });
  const pelMatch = rApp.text.match(/href=["'](https?:\/\/moeispel\.moe\.gov\.my\?[^"']+)["']/i);
  if (!pelMatch) {
    console.error('Failed to find moeispel SSO link in list_aplikasi! Length:', rApp.text.length);
    return;
  }
  const pelUrl = pelMatch[1].replace(/&amp;/g, '&');
  console.log('Found SSO link:', pelUrl);

  console.log('Activating SSO session...');
  const rPel = await fetchWithCookies(pelUrl, {
    headers: {
      'Referer': 'https://idme.moe.gov.my/list_aplikasi'
    }
  });
  console.log('SSO activated at:', rPel.url);

  console.log('Accessing tabguru attendance page...');
  const rTab = await fetchWithCookies('https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru', {
    headers: {
      'Referer': 'https://moeispel.moe.gov.my/'
    }
  });
  const moeisToken = extractToken(rTab.text);
  console.log('MOEIS Token:', moeisToken ? `SUCCESS: ${moeisToken}` : 'FAILED');

  const classes = [];
  const selectMatch = rTab.text.match(/<select[^>]*id=["']txtNamakelas["'][^>]*>([\s\S]*?)<\/select>/i);
  if (selectMatch) {
    const optRegex = /<option\s+value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi;
    let om;
    while ((om = optRegex.exec(selectMatch[1])) !== null) {
      const val = om[1].trim();
      const txt = om[2].replace(/<[^>]+>/g, '').trim();
      if (val && !txt.toLowerCase().includes('pilih')) {
        classes.push({ id: val, name: txt.replace(/\s+/g, ' ') });
      }
    }
  }
  console.log('Classes found:', classes);

  if (classes.length > 0) {
    console.log('Testing ajax attendance load for today...');
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;

    const pAtt = new URLSearchParams();
    pAtt.append('_token', moeisToken);
    pAtt.append('id_profile_kelas', classes[0].id);
    pAtt.append('tarikhpilihan', dateStr);
    pAtt.append('draw', '1');
    pAtt.append('start', '0');
    pAtt.append('length', '100');

    const rAtt = await fetchWithCookies('https://moeispel.moe.gov.my/sahsiah/kehadiran/ajaxloadkehadiranharian', {
      method: 'POST',
      body: pAtt,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://moeispel.moe.gov.my',
        'Referer': 'https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    try {
      const attData = JSON.parse(rAtt.text);
      console.log('Attendance data loaded! Total students:', attData.data?.length, 'Hadir:', attData.bilhadir, 'Tidak Hadir:', attData.biltidakhadir);
    } catch (e) {
      console.error('Failed to parse attendance JSON:', rAtt.text.slice(0, 300));
    }
  }
}

run().catch(console.error);
