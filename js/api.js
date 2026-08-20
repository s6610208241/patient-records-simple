/* =========================================================
   js/api.js — ฟังก์ชันกลางสำหรับคุยกับ Google Apps Script Web App
   ---------------------------------------------------------
   วิธีใช้: แก้ค่า API_URL ด้านล่างนี้ให้เป็น URL จริงที่ได้จากการ Deploy
   Apps Script (ลงท้ายด้วย /exec) แล้วทั้งระบบจะสลับจาก "โหมดเดโม"
   ไปใช้ข้อมูลจริงใน Google Sheet ทันที โดยไม่ต้องแก้ไฟล์อื่นเลย
   ========================================================= */

/* ====== ▼▼▼ แก้ตรงนี้ที่เดียว ▼▼▼ ====== */
const API_URL = 'https://script.google.com/macros/s/AKfycbytNoOocRKTXBD6jBuG7fCXSGjvrKMHyvblxplhlGFn-VpkQY76XEN2IdH7ip2E7fY/exec';
/* ====== ▲▲▲ แก้ตรงนี้ที่เดียว ▲▲▲ ====== */

/** ถ้ายังไม่ได้ใส่ API_URL = ทำงานในโหมดเดโม (ใช้ข้อมูลจำลองในเครื่อง) */
const IS_DEMO = !API_URL || API_URL.trim() === '';

/* ---------------------------------------------------------
   ส่วนที่ 1 : ตัวเรียก API จริง
   --------------------------------------------------------- */

/**
 * เรียก Apps Script แบบ GET (ใช้กับการอ่านข้อมูล)
 * @param {string} action ชื่อคำสั่ง เช่น list, get, getSettings
 * @param {Object} params พารามิเตอร์เพิ่มเติม
 * @returns {Promise<{ok:boolean, data?:any, error?:string}>}
 */
async function apiGet(action, params) {
  params = params || {};
  if (IS_DEMO) return MockApi.handle(action, params);
  try {
    const url = new URL(API_URL);
    url.searchParams.set('action', action);
    const token = getToken();
    if (token) url.searchParams.set('token', token);
    Object.keys(params).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
    });
    const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
    if (!res.ok) return { ok: false, error: 'เซิร์ฟเวอร์ตอบกลับผิดพลาด (รหัส ' + res.status + ')' };
    return normalizeResponse(await res.json());
  } catch (err) {
    return { ok: false, error: friendlyNetworkError(err) };
  }
}

/**
 * เรียก Apps Script แบบ POST (ใช้กับการเพิ่ม/แก้ไข/ลบ)
 * หมายเหตุ: ส่งเป็น text/plain เพื่อเลี่ยง CORS preflight ที่ Apps Script รองรับไม่ได้
 * @param {string} action ชื่อคำสั่ง เช่น create, update, delete
 * @param {Object} payload ข้อมูลที่ต้องการส่ง
 * @returns {Promise<{ok:boolean, data?:any, error?:string}>}
 */
async function apiPost(action, payload) {
  payload = payload || {};
  if (IS_DEMO) return MockApi.handle(action, payload);
  try {
    const body = JSON.stringify(Object.assign({ action: action, token: getToken() }, payload));
    const res = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
    });
    if (!res.ok) return { ok: false, error: 'เซิร์ฟเวอร์ตอบกลับผิดพลาด (รหัส ' + res.status + ')' };
    return normalizeResponse(await res.json());
  } catch (err) {
    return { ok: false, error: friendlyNetworkError(err) };
  }
}

/** จัดรูปแบบคำตอบจากเซิร์ฟเวอร์ให้เป็นมาตรฐานเดียวกันเสมอ */
function normalizeResponse(json) {
  if (!json || typeof json !== 'object') {
    return { ok: false, error: 'ข้อมูลที่ได้รับจากเซิร์ฟเวอร์ไม่ถูกต้อง' };
  }
  if (json.ok === true) return { ok: true, data: json.data };
  return { ok: false, error: json.error || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ' };
}

/** แปลงข้อผิดพลาดของเครือข่ายเป็นข้อความไทยที่ผู้ใช้อ่านรู้เรื่อง */
function friendlyNetworkError(err) {
  if (err && err.name === 'TypeError') {
    return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต หรือตรวจว่า URL ของ Apps Script ถูกต้อง และตั้งค่าให้ "ใครก็ได้ (Anyone)" เข้าถึงได้';
  }
  return 'เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + (err && err.message ? err.message : String(err));
}

/** อ่าน token ที่เก็บไว้ตอนล็อกอิน (auth.js เป็นคนเขียนค่านี้) */
function getToken() {
  try {
    const raw = sessionStorage.getItem('pr_session');
    return raw ? (JSON.parse(raw).token || '') : '';
  } catch (e) {
    return '';
  }
}

/* ---------------------------------------------------------
   ส่วนที่ 2 : คำสั่งระดับสูง — หน้าเว็บทุกหน้าเรียกใช้ผ่านชุดนี้
   --------------------------------------------------------- */

const Api = {
  login: function (username, password) { return apiPost('login', { username: username, password: password }); },
  listPatients: function (opts) {
    opts = opts || {};
    return apiGet('list', { includeDeleted: opts.includeDeleted ? '1' : '0' });
  },
  getPatient: function (id) { return apiGet('get', { id: id }); },
  createPatient: function (patient) { return apiPost('create', { patient: patient }); },
  updatePatient: function (id, patient) { return apiPost('update', { id: id, patient: patient }); },
  deletePatient: function (id) { return apiPost('delete', { id: id }); },
  restorePatient: function (id) { return apiPost('restore', { id: id }); },
  getSettings: function () { return apiGet('getSettings'); },
  updateSettings: function (settings) { return apiPost('updateSettings', { settings: settings }); },
};

/* ---------------------------------------------------------
   ส่วนที่ 3 : โหมดเดโม (ข้อมูลจำลอง)
   ใช้เฉพาะตอน API_URL ยังว่างอยู่ — พอใส่ URL จริงแล้วส่วนนี้จะไม่ถูกเรียกเลย
   เก็บไว้ใน localStorage เพื่อให้ทดลองเพิ่ม/แก้/ลบข้ามหน้าได้เสมือนจริง
   --------------------------------------------------------- */

const MOCK_USERS = [
  { username: 'admin', password: '1234', role: 'admin', is_active: true },
  { username: 'staff', password: '1234', role: 'staff', is_active: true },
];

const MOCK_SETTINGS = {
  system_name: 'ระบบจัดเก็บประวัติผู้ป่วยในเขตเทศบาล (ตัวอย่าง)',
  municipality_lat: '13.736717',
  municipality_lng: '100.523186',
};

const MOCK_PATIENTS = [
  {
    patient_code: 'P-2026-0001', first_name: 'สมชาย', last_name: 'ใจดี', patient_type: 'bedridden',
    address_text: '25/3 หมู่ 4 ถนนเทศบาล 1 ตำบลในเมือง',
    symptoms: 'อัมพฤกษ์ครึ่งซีก ใช้สายให้อาหาร มีแผลกดทับระดับ 2',
    phone: '081-234-5678', note: 'ญาติดูแลช่วงกลางวัน ควรโทรนัดก่อนเข้าเยี่ยม',
    lat: '13.740000', lng: '100.530000', map_url: '',
    created_at: '2026-07-01T09:00:00.000Z', updated_at: '2026-08-10T09:00:00.000Z', deleted_at: '',
  },
  {
    patient_code: 'P-2026-0002', first_name: 'สมหญิง', last_name: 'รักสงบ', patient_type: 'general',
    address_text: '99 หมู่ 2 ซอยร่วมใจ ตำบลในเมือง',
    symptoms: 'เบาหวาน ความดันโลหิตสูง ต้องตรวจน้ำตาลทุกเดือน',
    phone: '089-111-2222', note: '',
    lat: '13.732500', lng: '100.518000', map_url: '',
    created_at: '2026-07-05T09:00:00.000Z', updated_at: '2026-07-05T09:00:00.000Z', deleted_at: '',
  },
  {
    patient_code: 'P-2026-0003', first_name: 'บุญมา', last_name: 'ศรีสุข', patient_type: 'bedridden',
    address_text: '12 หมู่ 7 หลังวัดกลาง ตำบลบ้านใหม่',
    symptoms: 'ผู้สูงอายุติดเตียง สมองเสื่อม ต้องพลิกตัวทุก 2 ชั่วโมง',
    phone: '', note: 'บ้านไม้ชั้นเดียว ทางเข้าซอยแคบ รถใหญ่เข้าไม่ได้',
    lat: '', lng: '', map_url: '',
    created_at: '2026-07-11T09:00:00.000Z', updated_at: '2026-07-11T09:00:00.000Z', deleted_at: '',
  },
  {
    patient_code: 'P-2026-0004', first_name: 'ประเสริฐ', last_name: 'มั่นคง', patient_type: 'general',
    address_text: '5/1 ถนนสุขาภิบาล 3 ตำบลในเมือง',
    symptoms: 'หลังผ่าตัดเปลี่ยนข้อเข่า ต้องทำกายภาพบำบัดต่อเนื่อง',
    phone: '086-555-7777', note: '',
    lat: '13.729000', lng: '100.525500', map_url: '',
    created_at: '2026-07-18T09:00:00.000Z', updated_at: '2026-08-01T09:00:00.000Z', deleted_at: '',
  },
  {
    patient_code: 'P-2026-0005', first_name: 'จันทร์เพ็ญ', last_name: 'ทองแท้', patient_type: 'bedridden',
    address_text: '77 หมู่ 1 ริมคลองบางหลวง ตำบลบ้านใหม่',
    symptoms: 'โรคหลอดเลือดสมอง พูดไม่ชัด ใช้รถเข็น',
    phone: '092-888-9999', note: 'มีสุนัขเฝ้าบ้าน 2 ตัว',
    lat: '13.745200', lng: '100.512300', map_url: '',
    created_at: '2026-08-02T09:00:00.000Z', updated_at: '2026-08-02T09:00:00.000Z', deleted_at: '',
  },
  {
    patient_code: 'P-2026-0006', first_name: 'วิเชียร', last_name: 'พูนผล', patient_type: 'general',
    address_text: '31 ถนนเทศบาล 5 ตำบลในเมือง',
    symptoms: 'หอบหืด ต้องพ่นยาสม่ำเสมอ',
    phone: '', note: '',
    lat: '', lng: '', map_url: '',
    created_at: '2026-06-20T09:00:00.000Z', updated_at: '2026-06-20T09:00:00.000Z',
    deleted_at: '2026-08-12T04:30:00.000Z',
  },
];

const MockApi = {
  KEY_PATIENTS: 'pr_mock_patients',
  KEY_SETTINGS: 'pr_mock_settings',

  _readPatients: function () {
    try {
      const raw = localStorage.getItem(this.KEY_PATIENTS);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ข้อมูลเสีย -> เริ่มใหม่จากค่าตั้งต้น */ }
    const copy = JSON.parse(JSON.stringify(MOCK_PATIENTS));
    localStorage.setItem(this.KEY_PATIENTS, JSON.stringify(copy));
    return copy;
  },
  _writePatients: function (list) { localStorage.setItem(this.KEY_PATIENTS, JSON.stringify(list)); },

  _readSettings: function () {
    try {
      const raw = localStorage.getItem(this.KEY_SETTINGS);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ข้อมูลเสีย -> เริ่มใหม่จากค่าตั้งต้น */ }
    return Object.assign({}, MOCK_SETTINGS);
  },
  _writeSettings: function (s) { localStorage.setItem(this.KEY_SETTINGS, JSON.stringify(s)); },

  _nextCode: function (list) {
    const year = new Date().getFullYear();
    let max = 0;
    list.forEach(function (p) {
      const m = /^P-\d{4}-(\d{4})$/.exec(p.patient_code || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'P-' + year + '-' + String(max + 1).padStart(4, '0');
  },

  /** จำลองการหน่วงของเครือข่าย เพื่อให้เห็นสถานะ "กำลังโหลด" จริง */
  _delay: function (ms) { return new Promise(function (r) { setTimeout(r, ms || 350); }); },

  handle: async function (action, params) {
    await this._delay();
    try {
      switch (action) {
        case 'login': {
          const uname = String(params.username || '').trim();
          const pwd = String(params.password || '');
          const u = MOCK_USERS.find(function (x) { return x.username === uname && x.password === pwd; });
          if (!u) return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
          if (!u.is_active) return { ok: false, error: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ' };
          return { ok: true, data: { token: 'demo-token-' + Date.now(), username: u.username, role: u.role } };
        }
        case 'list': {
          const all = this._readPatients();
          const includeDeleted = params.includeDeleted === '1' || params.includeDeleted === true;
          const rows = all.filter(function (p) { return includeDeleted ? !!p.deleted_at : !p.deleted_at; });
          return { ok: true, data: rows };
        }
        case 'get': {
          const found = this._readPatients().find(function (p) { return p.patient_code === params.id; });
          if (!found) return { ok: false, error: 'ไม่พบข้อมูลผู้ป่วยรายนี้' };
          return { ok: true, data: found };
        }
        case 'create': {
          const list = this._readPatients();
          const now = new Date().toISOString();
          const p = Object.assign({}, params.patient, {
            patient_code: this._nextCode(list), created_at: now, updated_at: now, deleted_at: '',
          });
          list.push(p);
          this._writePatients(list);
          return { ok: true, data: p };
        }
        case 'update': {
          const list = this._readPatients();
          const i = list.findIndex(function (p) { return p.patient_code === params.id; });
          if (i === -1) return { ok: false, error: 'ไม่พบข้อมูลผู้ป่วยรายนี้' };
          list[i] = Object.assign({}, list[i], params.patient, {
            patient_code: list[i].patient_code, updated_at: new Date().toISOString(),
          });
          this._writePatients(list);
          return { ok: true, data: list[i] };
        }
        case 'delete': {
          const list = this._readPatients();
          const i = list.findIndex(function (p) { return p.patient_code === params.id; });
          if (i === -1) return { ok: false, error: 'ไม่พบข้อมูลผู้ป่วยรายนี้' };
          list[i].deleted_at = new Date().toISOString();
          this._writePatients(list);
          return { ok: true, data: list[i] };
        }
        case 'restore': {
          const list = this._readPatients();
          const i = list.findIndex(function (p) { return p.patient_code === params.id; });
          if (i === -1) return { ok: false, error: 'ไม่พบข้อมูลผู้ป่วยรายนี้' };
          list[i].deleted_at = '';
          list[i].updated_at = new Date().toISOString();
          this._writePatients(list);
          return { ok: true, data: list[i] };
        }
        case 'getSettings':
          return { ok: true, data: this._readSettings() };
        case 'updateSettings': {
          const merged = Object.assign({}, this._readSettings(), params.settings);
          this._writeSettings(merged);
          return { ok: true, data: merged };
        }
        default:
          return { ok: false, error: 'ไม่รู้จักคำสั่ง: ' + action };
      }
    } catch (err) {
      return { ok: false, error: 'โหมดเดโมทำงานผิดพลาด: ' + err.message };
    }
  },
};
