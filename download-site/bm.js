/*!
 * idMe 极速点名 · 书签脚本 (bookmarklet)
 * 目标页面：https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru
 * 形态：注入式全屏面板，与官方页面共存，可随时关闭
 *
 * 设计依据（全部来自 tabguru 页面快照实测）：
 *   - CSRF        : input[name="_token"]（页面内多个，全页统一）
 *   - 班级         : input[name="txtNamakelas"]（hidden，值形如 1136744）
 *   - 日期         : #tkh_HH 的 value，格式 DD/MM/YYYY
 *   - 名单接口     : POST /sahsiah/kehadiran/ajaxloadkehadiranharian
 *   - 提交接口     : POST /sahsiah/kehadiran/tabguru/kemaskiniKehadiranHarian
 *   - 提交契约     : rekodtidakhadir 必须是「当天全部非出席名单」，
 *                    缺席 + 请假都要发，只发真缺席会冲掉 PDPR 记录
 */
(function () {
  'use strict';

  var NS = '__idmeBM__';

  // 重复点击书签 = 关闭面板
  if (window[NS]) {
    try { window[NS].destroy(); } catch (e) {}
    window[NS] = null;
    return;
  }

  var HOST_OK = /(^|\.)moeispel\.moe\.gov\.my$/.test(location.hostname);
  if (!HOST_OK) {
    alert('请先登录 idMe，并打开「Kehadiran → Tab Guru」点名页面，再点这个书签。');
    return;
  }

  // ------------------------------------------------------------------
  // 假因字典（98 项，内联以抗官方改版；格式 code|名称|分类）
  // ------------------------------------------------------------------
  var SEBAB_RAW =
    'A0010072|PEMBELAJARAN DI RUMAH|A;B0010073|WAKIL SEKOLAH|B;' +
    'D0010001|COVID 19 BERGEJALA|D;' +
    'D0010058|MENJALANI TERAPI/RAWATAN/KUARANTIN|D;D0010075|DEMAM|D;' +
    'D0010077|RAWATAN KLINIK GIGI|D;' +
    'D0020002|COVID 19 DENGAN KEBENARAN IBUBAPA|D;' +
    'D0020059|TEMUJANJI HOSPITAL/KLINIK|D;D0030003|COVID 19 DIKUARANTIN|D;' +
    'D0040004|COVID 19 PENGGILIRAN|D;D0050005|BATUK KOKOL|D;D0060006|BEGUK|D;' +
    'D0060063|IMUNISASI RENDAH|D;D0070007|CACAR AIR|D;D0080008|CHIKUNGUNYA|D;' +
    'D0090009|DENGGI|D;D0100010|SWINE FLU (H1N1)|D;D0110011|HEPATITIS|D;' +
    'D0120012|HAND, FOOT AND MOUTH DISEASE (HFMD)|D;D0130013|INFLUENZA|D;' +
    'D0130070|TANTRUM (MBK)|D;D0140014|JAPANESE ENCEPHALITIS (JE)|D;' +
    'D0140071|TIDAK MELEPASI SARINGAN KESIHATAN (MBK)|D;' +
    'D0150015|LEPTOSPIROSIS (PENYAKIT KENCING TIKUS)|D;D0160016|KUDIS BUTA|D;' +
    'D0160073|MENDAPATKAN RAWATAN TRADISIONAL|D;D0170017|MALARIA|D;' +
    'D0170053|TEKANAN EMOSI|D;D0170074|KEMURUNGAN|D;D0180018|MERS COV|D;' +
    'D0190019|SAKIT MATA|D;D0200020|SARS|D;D0210021|TAUN|D;D0220022|TIBI|D;' +
    'D0240024|SAKIT MISTIK|D;D0250025|SAKIT MENTAL|D;' +
    'D0260001|MAKLUMAN IBU BAPA PENJAGA|D;D0260020|KECEDERAAN/PATAH TULANG|D;' +
    'D0260030|SURAT CUTI SAKIT HOSPITAL/KLINIK|D;' +
    'E0010076|DIGANTUNG SEKOLAH|E;G0010078|URUSAN PEPERIKSAAN|G;' +
    'I0030026|TEKANAN PERASAAN/TRAUMA|I;' +
    'I0070030|KESAKITAN AKIBAT HAID/PERMULAAN HAID|I;' +
    'J0010027|PEREBUTAN HAK PENJAGAAN ANAK|J;J0010037|KRISIS KELUARGA|J;' +
    'J0020025|KEMISKINAN/KESEMPITAN HIDUP|J;' +
    'J0020028|KEMATIAN AHLI KELUARGA TERDEKAT|J;' +
    'J0040030|MENGIKUT KELUARGA BERCUTI/BERKURSUS|J;' +
    'J0050031|MENJAGA/MENGURUSKAN AHLI KELUARGA|J;J0060029|LARI DARI RUMAH|J;' +
    'J0060032|MENJAGA AHLI KELUARGA YANG SAKIT|J;' +
    'J0070033|MENZIARAHI KELUARGA SAKIT|J;J0080034|BERPINDAH RANDAH|J;' +
    'J0090035|MASALAH PENGANGKUTAN|J;J0150072|BEKERJA|J;' +
    'J1100037|BALIK KAMPUNG|J;J1200038|BERPINDAH KE LUAR NEGARA|J;' +
    'K0020038|UGUTAN DARIPADA PIHAK LUAR|K;K0050041|DICULIK|K;' +
    'K0060042|GANGGUAN MISTIK/MAKHLUK HALUS|K;K0070043|KEBAKARAN|K;' +
    'K0080044|PENGGANAS/LANUN|K;K0090045|GANGGUAN KUMPULAN KONGSI GELAP|K;' +
    'K0120048|RUSUHAN DI LUAR KAWASAN SEKOLAH|K;' +
    'K0130049|BINATANG LIAR/BUAS/BERBISA|K;K0150051|MANGSA BULI|K;' +
    'K0160052|MANGSA SEKSUAL|K;K0180054|TIDAK DAPAT DIKESAN/HILANG|K;' +
    'L0010050|BANJIR|L;L0020051|GEMPA BUMI|L;' +
    'L0030052|HUJAN LEBAT/RIBUT TAUFAN|L;L0040053|PENCEMARAN UDARA|L;' +
    'L0050054|KEMARAU|L;L0060055|CUACA PANAS EL NINO|L;' +
    'L0070056|PENCEMARAN SISA KIMIA|L;L0080057|TANAH RUNTUH|L;' +
    'L0080058|PENCEMARAN ALAM|L;L0080059|JEREBU|L;L0080060|KEMALANGAN|L;' +
    'M0030060|HAJI/UMRAH/KEGIATAN AGAMA|M;' +
    'M0070064|PERTANDINGAN/AKTIVITI SELAIN KPM|M;' +
    'M0080065|PEPERIKSAAN/UJIAN SELAIN KPM|M;M0090066|TERLIBAT KES JENAYAH|M;' +
    'M0100067|TERLIBAT KES TRAFIK|M;M0110068|URUSAN RASMI AGENSI KERAJAAN|M;' +
    'M0120069|PROSES PERPINDAHAN SEKOLAH|M;' +
    'M0170074|LATIHAN/UJIAN LESEN MEMANDU|M;' +
    'M0180075|TAHANAN PIHAK BERKUASA|M;' +
    'M0190076|TERLIBAT PROSIDING MAHKAMAH|M;M0200077|CUTI SEMESTER|M;' +
    'M0200078|MENJALANI LATIHAN INDUSTRI|M;' +
    'M0200079|PERLINDUNGAN JABATAN KEBAJIKAN MASYARAKAT|M;' +
    'N0010024|BANGUN LEWAT|N;N0040027|MALAS KE SEKOLAH|N;' +
    'N0080031|KETAGIHAN GAJET|N;N0090032|TIDAK MENYIAPKAN KERJA SEKOLAH|N;' +
    'N0100033|MALAS KE AKTIVITI KOKURIKULUM|N;' +
    'P0270084|SEKOLAH DALAM HOSPITAL|P';

  // 官方 12 分类（顺序即下拉顺序，逐字取自 generateKatSelect）
  var CATS = [
    ['B', 'AKTIVITI LUAR SEKOLAH'],
    ['K', 'ANCAMAN KESELAMATAN'],
    ['L', 'BENCANA ALAM'],
    ['E', 'DIGANTUNG SEKOLAH'],
    ['J', 'MASALAH KELUARGA'],
    ['I', 'MASALAH PERIBADI'],
    ['A', 'PDPR'],
    ['G', 'PENGGILIRAN PEPERIKSAAN'],
    ['M', 'KEBENARAN PENGETUA/GURU BESAR'],
    ['N', 'PONTENG'],
    ['D', 'MASALAH KESIHATAN'],
    ['P', 'SEKOLAH DALAM HOSPITAL']
  ];

  // 官方「算出席」分类（请假仍计入 bilhadir）
  var EXCUSED = ['A', 'G', 'E', 'P'];

  var DEFAULT_SEBAB = 'D0260001';
  var PDPR_SEBAB = 'A0010072';

  // 教师高频假因（点按即选，不用进分类翻）
  var QUICK = [
    'D0260001', 'D0260030', 'D0010075', 'D0020059',
    'B0010073', 'J1100037', 'J0050031', 'J0060032',
    'J0020028', 'J0040030', 'J0090035'
  ];

  var DICT = (function () {
    var out = {}, arr = [];
    SEBAB_RAW.split(';').forEach(function (row) {
      var p = row.split('|');
      if (p.length !== 3) return;
      var item = { code: p[0], name: p[1], kat: p[2] };
      out[item.code] = item;
      arr.push(item);
    });
    return { byCode: out, list: arr };
  })();

  function catName(k) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i][0] === k) return CATS[i][1];
    return k || '—';
  }
  function isExcused(k) { return EXCUSED.indexOf(String(k || '').charAt(0)) >= 0; }
  function excusedRank(k) {
    var i = EXCUSED.indexOf(String(k || '').charAt(0));
    return i < 0 ? 99 : i;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ------------------------------------------------------------------
  // 页面锚点读取
  // ------------------------------------------------------------------
  function readToken() {
    var el = document.querySelector('input[name="_token"]');
    return el ? el.value : '';
  }
  function readClassId() {
    var el = document.querySelector('[name="txtNamakelas"]');
    return el ? el.value : '';
  }
  function readDate() {
    var el = document.getElementById('tkh_HH');
    if (el && /^\d{2}\/\d{2}\/\d{4}$/.test(el.value)) return el.value;
    var span = document.getElementById('tarikhpilihan');
    if (span) {
      var t = (span.textContent || '').trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return t;
    }
    var d = new Date();
    return ('0' + d.getDate()).slice(-2) + '/' +
           ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }

  // ------------------------------------------------------------------
  // 接口
  // ------------------------------------------------------------------
  function apiGetRoster(dateStr, classId) {
    var token = readToken();
    var p = new URLSearchParams();
    p.append('_token', token);
    p.append('id_profile_kelas', classId);
    p.append('tarikhpilihan', dateStr);
    p.append('draw', '1');
    p.append('start', '0');
    p.append('length', '100');
    p.append('order[0][column]', '2');
    p.append('order[0][dir]', 'asc');
    p.append('order[0][name]', '');
    p.append('search[value]', '');
    p.append('search[regex]', 'false');
    ['bil', 'kehadiran', 'namamurid', 'sebabtidakhadir'].forEach(function (data, i) {
      p.append('columns[' + i + '][data]', data);
      p.append('columns[' + i + '][name]', '');
      p.append('columns[' + i + '][searchable]', 'true');
      p.append('columns[' + i + '][orderable]', 'true');
      p.append('columns[' + i + '][search][value]', '');
      p.append('columns[' + i + '][search][regex]', 'false');
    });

    return fetch('/sahsiah/kehadiran/ajaxloadkehadiranharian', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      },
      body: p.toString()
    }).then(function (r) {
      return r.text().then(function (t) {
        var j;
        try { j = JSON.parse(t); }
        catch (e) {
          // 非 JSON = 会话失效，服务端返回了整页 HTML
          throw new Error('SESSION');
        }
        if (!j || !Array.isArray(j.data)) throw new Error('BAD_PAYLOAD');
        return j;
      });
    });
  }

  function apiSubmit(dateStr, classId, records, verify) {
    var p = new URLSearchParams();
    p.append('_token', readToken());
    p.append('tarikh', dateStr);
    p.append('kelas', classId);
    p.append('statussimpan', verify ? 'simpansah' : 'simpan');
    records.forEach(function (r, i) {
      p.append('rekodtidakhadir[' + i + '][idpelajar]', r.id);
      p.append('rekodtidakhadir[' + i + '][namamurid]', r.name);
      p.append('rekodtidakhadir[' + i + '][kategori]', r.kategori || 'D');
      p.append('rekodtidakhadir[' + i + '][sebab]', r.sebabCode || DEFAULT_SEBAB);
    });

    return fetch('/sahsiah/kehadiran/tabguru/kemaskiniKehadiranHarian', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      },
      body: p.toString()
    }).then(function (r) { return r.text(); })
      .then(function (t) {
        try { return JSON.parse(t); }
        catch (e) { throw new Error('SESSION'); }
      });
  }

  // ------------------------------------------------------------------
  // 状态
  // ------------------------------------------------------------------
  var S = {
    date: '', classId: '',
    students: [], bilhadir: 0, biltidakhadir: 0,
    statushari: 0, verified: false,
    baseline: {},
    loading: false, error: '', toast: '',
    filter: '',
    sheet: null   // { studentId } 或 null
  };

  // 三态：present / excused / absent
  function parseRoster(json) {
    var list = [];
    json.data.forEach(function (it, idx) {
      var id = it.id_individu || '';
      var name = String(it.namamurid || (it.individu && it.individu.nama) || '').trim();
      var checked = String(it.kehadiran || '').indexOf('checked') >= 0;
      var lap = (Array.isArray(it.laporan_takhadir) && it.laporan_takhadir.length)
        ? it.laporan_takhadir[0] : null;
      var sebabCode = (lap && lap.id_sebab_thadir) || '';
      var kategori = (lap && lap.thadir && lap.thadir.id_kat_thadir) ||
                     (sebabCode ? sebabCode.charAt(0) : '');
      var sebabName = (lap && lap.thadir && lap.thadir.keterangan) ||
                      it.sebabtidakhadir || '';
      var hasRecord = !!(lap || it.sebabtidakhadir);

      var state;
      if (checked) state = 'present';
      else if (hasRecord) state = isExcused(kategori) ? 'excused' : 'absent';
      else state = 'absent';

      list.push({
        index: idx + 1, id: id, name: name,
        state: state, sebabCode: sebabCode, kategori: kategori,
        sebabName: sebabName, hasRecord: hasRecord
      });
    });

    // 兜底排序：服务端忽略 order 时本地按姓名升序
    var sorted = true;
    for (var i = 1; i < list.length; i++) {
      if (String(list[i - 1].name).localeCompare(String(list[i].name), 'ms') > 0) {
        sorted = false; break;
      }
    }
    if (!sorted) list.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), 'ms');
    });

    // 服务端 bilhadir 是权威口径，用它校正「算出席」名额
    var checkedCount = list.filter(function (s) { return s.state === 'present'; }).length;
    var bilhadir = Number(json.bilhadir != null ? json.bilhadir : checkedCount);
    var quota = Math.max(0, bilhadir - checkedCount);

    var exc = list.filter(function (s) { return s.state === 'excused'; });
    if (exc.length < quota) {
      list.filter(function (s) { return s.state === 'absent' && s.hasRecord; })
        .sort(function (a, b) { return excusedRank(a.kategori) - excusedRank(b.kategori); })
        .slice(0, quota - exc.length)
        .forEach(function (s) { s.state = 'excused'; });
    } else if (exc.length > quota) {
      exc.sort(function (a, b) { return excusedRank(a.kategori) - excusedRank(b.kategori); })
        .slice(quota)
        .forEach(function (s) { s.state = 'absent'; });
    }

    list.forEach(function (s, i) { s.index = i + 1; });
    return { list: list, bilhadir: bilhadir,
             biltidakhadir: Number(json.biltidakhadir != null ? json.biltidakhadir : list.length - bilhadir) };
  }

  // ------------------------------------------------------------------
  // 样式
  // ------------------------------------------------------------------
  var CSS = [
    '#idme-bm{position:fixed;inset:0;z-index:2147483000;background:#f4f6f8;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
    'font-size:15px;line-height:1.4;color:#1a1f24;display:flex;flex-direction:column;',
    '-webkit-text-size-adjust:100%;}',
    '#idme-bm *{box-sizing:border-box;font-family:inherit;margin:0;padding:0;}',
    '#idme-bm button{font:inherit;border:0;background:none;cursor:pointer;color:inherit;}',

    /* 顶栏 */
    '#idme-bm .bm-head{flex:0 0 auto;background:#0f4c81;color:#fff;padding:10px 12px;',
    'padding-top:calc(10px + env(safe-area-inset-top,0px));display:flex;align-items:center;gap:8px;}',
    '#idme-bm .bm-title{font-size:16px;font-weight:600;letter-spacing:.2px;}',
    '#idme-bm .bm-sub{font-size:12px;opacity:.8;margin-left:auto;margin-right:4px;}',
    '#idme-bm .bm-close{width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.16);',
    'display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;}',

    /* 计数条 */
    '#idme-bm .bm-stats{flex:0 0 auto;display:flex;background:#fff;border-bottom:1px solid #e3e8ee;}',
    '#idme-bm .bm-stat{flex:1;padding:9px 6px;text-align:center;border-right:1px solid #eef2f6;}',
    '#idme-bm .bm-stat:last-child{border-right:0;}',
    '#idme-bm .bm-stat b{display:block;font-size:19px;font-weight:650;line-height:1.2;}',
    '#idme-bm .bm-stat span{font-size:11px;color:#68737d;}',
    '#idme-bm .bm-stat.p b{color:#1a7f4b;}',
    '#idme-bm .bm-stat.e b{color:#1f6fb2;}',
    '#idme-bm .bm-stat.a b{color:#c0392b;}',

    /* 搜索 */
    '#idme-bm .bm-tools{flex:0 0 auto;display:flex;gap:8px;padding:8px 10px;background:#fff;',
    'border-bottom:1px solid #e3e8ee;}',
    '#idme-bm .bm-search{flex:1;border:1px solid #d5dde5;border-radius:9px;padding:8px 11px;',
    'font-size:15px;background:#fafbfc;outline:none;min-width:0;}',
    '#idme-bm .bm-search:focus{border-color:#0f4c81;background:#fff;}',
    '#idme-bm .bm-mini{padding:8px 12px;border-radius:9px;font-size:13px;background:#eef3f8;',
    'color:#0f4c81;font-weight:600;white-space:nowrap;}',

    /* 名单 */
    '#idme-bm .bm-list{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;',
    'background:#fff;overscroll-behavior:contain;}',
    '#idme-bm .bm-row{display:flex;align-items:center;gap:10px;padding:11px 12px;',
    'border-bottom:1px solid #f0f3f6;position:relative;}',
    '#idme-bm .bm-row::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:transparent;}',
    '#idme-bm .bm-row.p::before{background:#1a7f4b;}',
    '#idme-bm .bm-row.e::before{background:#1f6fb2;}',
    '#idme-bm .bm-row.a::before{background:#c0392b;}',

    '#idme-bm .bm-num{flex:0 0 24px;font-size:12px;color:#9aa5b1;text-align:right;}',
    '#idme-bm .bm-main{flex:1 1 auto;min-width:0;}',
    '#idme-bm .bm-name{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '#idme-bm .bm-why{font-size:11.5px;color:#68737d;margin-top:2px;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '#idme-bm .bm-row.a .bm-why{color:#c0392b;}',
    '#idme-bm .bm-row.e .bm-why{color:#1f6fb2;}',

    '#idme-bm .bm-toggle{flex:0 0 auto;width:34px;height:34px;border-radius:50%;',
    'display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;}',
    '#idme-bm .bm-row.p .bm-toggle{background:#e6f5ec;color:#1a7f4b;}',
    '#idme-bm .bm-row.a .bm-toggle{background:#fdecea;color:#c0392b;}',
    '#idme-bm .bm-row.e .bm-toggle{background:#e6f0fa;color:#1f6fb2;}',
    '#idme-bm .bm-whybtn{flex:0 0 auto;padding:6px 9px;border-radius:7px;background:#f2f5f8;',
    'color:#41505e;font-size:12px;font-weight:600;}',

    /* 底栏 */
    '#idme-bm .bm-foot{flex:0 0 auto;background:#fff;border-top:1px solid #e3e8ee;',
    'padding:10px 12px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));',
    'display:flex;gap:8px;align-items:center;}',
    '#idme-bm .bm-primary{flex:1;padding:12px;border-radius:11px;background:#0f4c81;color:#fff;',
    'font-size:15px;font-weight:650;text-align:center;}',
    '#idme-bm .bm-primary:disabled{background:#b8c4cf;}',
    '#idme-bm .bm-ghost{padding:12px 14px;border-radius:11px;background:#eef3f8;',
    'color:#0f4c81;font-size:14px;font-weight:600;}',

    /* 提示 */
    '#idme-bm .bm-note{padding:8px 12px;font-size:12px;color:#68737d;background:#f9fafb;',
    'border-bottom:1px solid #eef2f6;}',
    '#idme-bm .bm-note.warn{background:#fff8e6;color:#8a6100;}',
    '#idme-bm .bm-note.err{background:#fdecea;color:#c0392b;}',
    '#idme-bm .bm-empty{padding:40px 20px;text-align:center;color:#9aa5b1;font-size:14px;}',

    /* 假因面板 */
    '#idme-bm .bm-sheet{position:absolute;inset:0;background:rgba(15,20,25,.45);',
    'display:flex;flex-direction:column;justify-content:flex-end;}',
    '#idme-bm .bm-sheetbox{background:#fff;border-radius:16px 16px 0 0;max-height:82%;',
    'display:flex;flex-direction:column;overflow:hidden;}',
    '#idme-bm .bm-sheethead{padding:13px 14px 10px;border-bottom:1px solid #eef2f6;',
    'display:flex;align-items:center;gap:8px;}',
    '#idme-bm .bm-sheethead b{font-size:15px;flex:1;min-width:0;overflow:hidden;',
    'text-overflow:ellipsis;white-space:nowrap;}',
    '#idme-bm .bm-cats{display:flex;gap:6px;overflow-x:auto;padding:9px 12px;',
    '-webkit-overflow-scrolling:touch;border-bottom:1px solid #eef2f6;flex:0 0 auto;}',
    '#idme-bm .bm-cat{padding:6px 11px;border-radius:20px;background:#f2f5f8;font-size:12.5px;',
    'white-space:nowrap;color:#41505e;font-weight:600;}',
    '#idme-bm .bm-cat.on{background:#0f4c81;color:#fff;}',
    '#idme-bm .bm-sebablist{overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1 1 auto;}',
    '#idme-bm .bm-sebab{padding:13px 14px;border-bottom:1px solid #f4f6f8;font-size:14.5px;}',
    '#idme-bm .bm-sebab small{display:block;font-size:11px;color:#9aa5b1;margin-top:2px;}',
    '#idme-bm .bm-sebab.on{background:#eef3f8;}'
  ].join('');

  // ------------------------------------------------------------------
  // 渲染
  // ------------------------------------------------------------------
  var root = null;

  function counts() {
    var c = { p: 0, e: 0, a: 0 };
    S.students.forEach(function (s) {
      if (s.state === 'present') c.p++;
      else if (s.state === 'excused') c.e++;
      else c.a++;
    });
    return c;
  }

  function filtered() {
    var q = S.filter.trim().toLowerCase();
    if (!q) return S.students;
    return S.students.filter(function (s) {
      return String(s.name).toLowerCase().indexOf(q) >= 0;
    });
  }

  function render() {
    if (!root) return;
    var c = counts();
    var rows = filtered();

    var rowsHtml = rows.map(function (s) {
      var cls = s.state === 'present' ? 'p' : (s.state === 'excused' ? 'e' : 'a');
      var mark = s.state === 'present' ? '&#10003;' : (s.state === 'excused' ? '&#9679;' : '&#10005;');
      var why = '';
      if (s.state === 'present') {
        why = '';
      } else if (s.sebabName) {
        why = esc(s.sebabName);
        if (s.state === 'excused') why += ' <span style="opacity:.7">(算出席)</span>';
      } else {
        why = '未选原因';
      }
      return '<div class="bm-row ' + cls + '" data-sid="' + esc(s.id) + '">' +
        '<div class="bm-num">' + s.index + '</div>' +
        '<div class="bm-main" data-act="toggle">' +
          '<div class="bm-name">' + esc(s.name) + '</div>' +
          (why ? '<div class="bm-why">' + why + '</div>' : '') +
        '</div>' +
        '<button class="bm-whybtn" data-act="sebab">原因</button>' +
        '<div class="bm-toggle" data-act="toggle">' + mark + '</div>' +
      '</div>';
    }).join('');

    var note = '';
    if (S.error) {
      note = '<div class="bm-note err">' + esc(S.error) + '</div>';
    } else if (S.statushari === 1) {
      note = '<div class="bm-note warn">当天不可录入：需先在官方页面确认日期设置。</div>';
    } else if (S.statushari === 2 || S.statushari === 3) {
      note = '<div class="bm-note warn">当天为假期（Cuti），官方不允许录入。</div>';
    } else if (S.verified) {
      note = '<div class="bm-note warn">本月已归档（TELAH DISAHKAN）。再次提交会覆盖归档状态。</div>';
    } else if (S.toast) {
      note = '<div class="bm-note">' + esc(S.toast) + '</div>';
    }

    root.innerHTML =
      '<div class="bm-head">' +
        '<div class="bm-title">idMe 极速点名</div>' +
        '<div class="bm-sub">' + esc(S.date) + '</div>' +
        '<button class="bm-close" data-act="close">&#10005;</button>' +
      '</div>' +
      (note || '') +
      '<div class="bm-stats">' +
        '<div class="bm-stat p"><b>' + c.p + '</b><span>出席</span></div>' +
        '<div class="bm-stat e"><b>' + c.e + '</b><span>请假(算出席)</span></div>' +
        '<div class="bm-stat a"><b>' + c.a + '</b><span>缺席</span></div>' +
        '<div class="bm-stat"><b>' + S.students.length + '</b><span>全班</span></div>' +
      '</div>' +
      '<div class="bm-tools">' +
        '<input class="bm-search" placeholder="搜索姓名" value="' + esc(S.filter) + '">' +
        '<button class="bm-mini" data-act="allpresent">全班出席</button>' +
      '</div>' +
      '<div class="bm-list">' +
        (S.loading ? '<div class="bm-empty">正在读取名单…</div>' :
         rows.length ? rowsHtml : '<div class="bm-empty">没有匹配的学生</div>') +
      '</div>' +
      '<div class="bm-foot">' +
        '<button class="bm-ghost" data-act="reload">刷新</button>' +
        '<button class="bm-primary" data-act="submit"' +
          (S.loading || S.error || S.statushari !== 0 ? ' disabled' : '') + '>' +
          '提交（' + (c.e + c.a) + ' 人非出席）</button>' +
      '</div>' +
      (S.sheet ? sheetHtml() : '');
  }

  // 搜索：事件委托到 root，避免 render 重建后监听器丢失
  function onInput(e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('bm-search')) return;
    var pos = t.selectionStart;
    S.filter = t.value;
    render();
    var again = root.querySelector('.bm-search');
    if (again) {
      again.focus();
      try { again.setSelectionRange(pos, pos); } catch (x) {}
    }
  }

  var sheetCat = 'A';

  function sheetHtml() {
    var sid = S.sheet.studentId;
    var st = S.students.filter(function (x) { return x.id === sid; })[0];
    if (!st) return '';

    var quick = QUICK.map(function (code) {
      var d = DICT.byCode[code];
      if (!d) return '';
      var on = st.sebabCode === code ? ' on' : '';
      return '<div class="bm-sebab' + on + '" data-act="pick" data-code="' + d.code + '">' +
        esc(d.name) + '<small>' + d.code + ' · ' + catName(d.kat) + '</small></div>';
    }).join('');

    var items = DICT.list.filter(function (d) { return d.kat === sheetCat; })
      .map(function (d) {
        var on = st.sebabCode === d.code ? ' on' : '';
        return '<div class="bm-sebab' + on + '" data-act="pick" data-code="' + d.code + '">' +
          esc(d.name) + '<small>' + d.code + '</small></div>';
      }).join('');

    var cats = CATS.map(function (c) {
      return '<div class="bm-cat' + (c[0] === sheetCat ? ' on' : '') +
        '" data-act="cat" data-kat="' + c[0] + '">' + esc(c[1]) + '</div>';
    }).join('');

    return '<div class="bm-sheet" data-act="sheetbg">' +
      '<div class="bm-sheetbox">' +
        '<div class="bm-sheethead">' +
          '<b>' + esc(st.name) + '</b>' +
          '<button class="bm-mini" data-act="closesheet">关闭</button>' +
        '</div>' +
        '<div class="bm-cats">' + cats + '</div>' +
        '<div class="bm-sebablist">' +
          '<div style="padding:9px 14px 5px;font-size:11px;color:#9aa5b1;font-weight:700;">常用</div>' +
          quick +
          '<div style="padding:9px 14px 5px;font-size:11px;color:#9aa5b1;font-weight:700;">' +
            esc(catName(sheetCat)) + '</div>' +
          items +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ------------------------------------------------------------------
  // 交互
  // ------------------------------------------------------------------
  function findStudent(id) {
    for (var i = 0; i < S.students.length; i++) {
      if (S.students[i].id === id) return S.students[i];
    }
    return null;
  }

  function toggleStudent(id) {
    var s = findStudent(id);
    if (!s) return;
    // present ↔ absent 循环；已是 excused 则回 present（清掉假因）
    if (s.state === 'present') {
      s.state = 'absent';
      s.sebabCode = '';
      s.kategori = '';
      s.sebabName = '';
    } else {
      s.state = 'present';
      s.sebabCode = '';
      s.kategori = '';
      s.sebabName = '';
    }
    render();
  }

  function pickSebab(id, code) {
    var s = findStudent(id);
    var d = DICT.byCode[code];
    if (!s || !d) return;
    s.sebabCode = d.code;
    s.kategori = d.kat;
    s.sebabName = d.name;
    s.state = isExcused(d.kat) ? 'excused' : 'absent';
    S.sheet = null;
    S.toast = '';
    render();
  }

  function collectRecords() {
    return S.students
      .filter(function (s) { return s.state !== 'present'; })
      .map(function (s) {
        return {
          id: s.id, name: s.name,
          kategori: s.kategori || (s.sebabCode ? s.sebabCode.charAt(0) : 'D'),
          sebabCode: s.sebabCode || DEFAULT_SEBAB
        };
      });
  }

  function doSubmit() {
    var c = counts();
    var records = collectRecords();
    var trueAbsent = records.filter(function (r) { return !isExcused(r.kategori); }).length;

    // 安全护栏：拟全班缺席而服务端并非全班缺席 → 状态解析很可能出错
    if (trueAbsent > 0 && trueAbsent === S.students.length &&
        S.biltidakhadir < S.students.length) {
      alert('安全拦截：拟把全班 ' + S.students.length + ' 人标记为缺席，\n' +
            '但服务端当天只记录了 ' + S.biltidakhadir + ' 人缺席。\n\n' +
            '这通常意味着状态解析出错（例如 PDPR 日官方把居家学习算作出席）。\n' +
            '已取消提交，请核对后再试。');
      return;
    }

    var lines = records.map(function (r, i) {
      var tag = isExcused(r.kategori) ? '请假' : '缺席';
      return (i + 1) + '. ' + r.name + '  [' + tag + '] ' + (DICT.byCode[r.sebabCode] || {}).name;
    });

    var msg = '即将提交 ' + S.date + '\n\n' +
      '出席 ' + c.p + ' 人  |  请假 ' + c.e + ' 人  |  缺席 ' + c.a + ' 人\n\n' +
      (records.length ? '非出席名单：\n' + lines.join('\n') + '\n\n' : '全班出席，无缺勤记录。\n\n') +
      '这会写入 MOEIS 服务端，确认继续？';

    if (!confirm(msg)) return;

    S.loading = true; S.error = ''; render();

    apiSubmit(S.date, S.classId, records, false)
      .then(function (res) {
        S.loading = false;
        S.toast = '已提交。服务端返回：出席 ' + (res.bilhadir != null ? res.bilhadir : '?') +
                  '，缺席 ' + (res.biltidakhadir != null ? res.biltidakhadir : '?');
        // 提交后重新拉取，确保面板显示的是服务端真实状态
        return load(true);
      })
      .catch(function (e) {
        S.loading = false;
        S.error = e.message === 'SESSION'
          ? '会话已失效，请刷新页面重新登录后重试。'
          : ('提交失败：' + e.message);
        render();
      });
  }

  function load(silent) {
    if (!silent) { S.loading = true; S.error = ''; render(); }
    S.classId = readClassId();
    S.date = readDate();

    if (!S.classId) {
      S.loading = false;
      S.error = '未找到班级信息（txtNamakelas）。请确认当前是 Tab Guru 点名页面。';
      render();
      return Promise.resolve();
    }

    return apiGetRoster(S.date, S.classId)
      .then(function (json) {
        var parsed = parseRoster(json);
        S.students = parsed.list;
        S.bilhadir = parsed.bilhadir;
        S.biltidakhadir = parsed.biltidakhadir;
        S.statushari = Number(json.statushari || 0);
        S.verified = Number(json.rekodSahHadirBulanan || 0) > 0;
        S.loading = false;
        S.error = '';
        render();
      })
      .catch(function (e) {
        S.loading = false;
        S.error = e.message === 'SESSION'
          ? '会话已失效或接口返回异常。请刷新官方页面重新登录后再点书签。'
          : ('读取名单失败：' + e.message);
        render();
      });
  }

  // ------------------------------------------------------------------
  // 事件委托
  // ------------------------------------------------------------------
  function onClick(e) {
    var t = e.target;
    while (t && t !== root) {
      var act = t.getAttribute && t.getAttribute('data-act');
      if (act) break;
      t = t.parentNode;
    }
    if (!t || t === root) return;
    var act = t.getAttribute('data-act');

    if (act === 'close') { destroy(); return; }
    if (act === 'reload') { load(false); return; }
    if (act === 'allpresent') {
      if (!S.students.length) return;
      var n = counts().e + counts().a;
      if (n > 0 && !confirm('把全部 ' + S.students.length + ' 人标记为出席？\n' +
                            '（当前有 ' + n + ' 人非出席，会全部清除）')) return;
      S.students.forEach(function (s) {
        s.state = 'present'; s.sebabCode = ''; s.kategori = ''; s.sebabName = '';
      });
      S.toast = '已全部标记为出席（尚未提交）';
      render();
      return;
    }
    if (act === 'submit') { doSubmit(); return; }

    var row = t.closest ? t.closest('.bm-row') : null;
    if (act === 'toggle' || act === 'sebab') {
      var sid = row ? row.getAttribute('data-sid') : '';
      if (act === 'toggle') { toggleStudent(sid); return; }
      var st = findStudent(sid);
      if (st) {
        sheetCat = st.kategori || 'A';
        S.sheet = { studentId: sid };
        render();
      }
      return;
    }
    if (act === 'cat') { sheetCat = t.getAttribute('data-kat'); render(); return; }
    if (act === 'pick') {
      pickSebab(S.sheet ? S.sheet.studentId : '', t.getAttribute('data-code'));
      return;
    }
    if (act === 'closesheet') { S.sheet = null; render(); return; }
    if (act === 'sheetbg' && t.classList.contains('bm-sheet')) {
      S.sheet = null; render(); return;
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      if (S.sheet) { S.sheet = null; render(); }
      else destroy();
    }
  }

  // ------------------------------------------------------------------
  // 挂载 / 卸载
  // ------------------------------------------------------------------
  function destroy() {
    document.removeEventListener('keydown', onKey);
    if (root) {
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
      if (root.parentNode) root.parentNode.removeChild(root);
    }
    var st = document.getElementById('idme-bm-style');
    if (st && st.parentNode) st.parentNode.removeChild(st);
    root = null;
    window[NS] = null;
  }

  function mount() {
    var style = document.createElement('style');
    style.id = 'idme-bm-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    root = document.createElement('div');
    root.id = 'idme-bm';
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey);

    window[NS] = { destroy: destroy, toggle: destroy };

    render();
    load(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
