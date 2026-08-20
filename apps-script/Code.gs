/**
 * =========================================================================
 * Code.gs — ตัวกลาง (API) ระหว่างหน้าเว็บกับ Google Sheet
 * ระบบจัดเก็บและค้นหาประวัติผู้ป่วยในเขตเทศบาล
 * =========================================================================
 *
 * วิธีติดตั้ง (ทำที่ script.google.com — ดูขั้นตอนละเอียดใน README ของโปรเจกต์)
 *  1) คัดลอกไฟล์นี้ทั้งหมดไปวางแทนที่โค้ดเดิมในไฟล์ Code.gs
 *  2) ไปที่ ⚙️ Project Settings > Script Properties > Add script property
 *       ชื่อ (Property):  SHEET_ID
 *       ค่า (Value):      รหัสของ Google Sheet (ส่วนกลางของ URL ชีต)
 *     *** ห้ามพิมพ์รหัสชีตหรือรหัสผ่านลงในโค้ดไฟล์นี้โดยตรง ***
 *  3) กลับมาที่หน้าโค้ด เลือกฟังก์ชัน setupSheets แล้วกด Run หนึ่งครั้ง
 *     (ระบบจะสร้างแท็บ Patients / Users / Settings พร้อมหัวคอลัมน์ให้อัตโนมัติ)
 *  4) Deploy > New deployment > ประเภท Web app
 *       Execute as: Me
 *       Who has access: Anyone
 *     แล้วคัดลอก URL ที่ลงท้ายด้วย /exec ไปใส่ในไฟล์ js/api.js
 *
 * คำสั่ง (action) ที่รองรับ:
 *   login, list, get, create, update, delete (soft), restore, getSettings, updateSettings
 */

/* =========================================================================
 * ค่าคงที่
 * ========================================================================= */

var SHEET_PATIENTS = 'Patients';
var SHEET_USERS = 'Users';
var SHEET_SETTINGS = 'Settings';

/** ลำดับคอลัมน์ของแท็บ Patients (ต้องตรงกับหัวตารางในชีตเสมอ) */
var PATIENT_COLUMNS = [
  'patient_code',
  'first_name',
  'last_name',
  'patient_type',
  'address_text',
  'symptoms',
  'phone',
  'note',
  'lat',
  'lng',
  'map_url',
  'created_at',
  'updated_at',
  'deleted_at'
];

/** ฟิลด์ที่หน้าเว็บแก้ไขได้ (patient_code และวันที่ระบบเป็นคนกำหนดเอง) */
var EDITABLE_FIELDS = [
  'first_name', 'last_name', 'patient_type', 'address_text',
  'symptoms', 'phone', 'note', 'lat', 'lng', 'map_url'
];

var USER_COLUMNS = ['username', 'password', 'role', 'is_active'];
var SETTINGS_COLUMNS = ['key', 'value'];

/** อายุของ token หลังล็อกอิน (วินาที) — 6 ชั่วโมง */
var TOKEN_TTL_SECONDS = 21600;

/* =========================================================================
 * ทางเข้าหลัก (Web App)
 * ========================================================================= */

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  return handleRequest_(params.action, params);
}

function doPost(e) {
  var body = {};
  try {
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'ข้อมูลที่ส่งมาไม่ใช่รูปแบบ JSON ที่ถูกต้อง' });
  }
  // เผื่อกรณีส่งมาเป็น query string
  if (e && e.parameter && e.parameter.action && !body.action) body.action = e.parameter.action;
  return handleRequest_(body.action, body);
}

/** ตัวกระจายคำสั่งไปยังฟังก์ชันที่เกี่ยวข้อง */
function handleRequest_(action, params) {
  try {
    switch (action) {
      case 'login':          return jsonOutput_(actionLogin_(params));
      case 'list':           return jsonOutput_(actionList_(params));
      case 'get':            return jsonOutput_(actionGet_(params));
      case 'create':         return jsonOutput_(actionCreate_(params));
      case 'update':         return jsonOutput_(actionUpdate_(params));
      case 'delete':         return jsonOutput_(actionDelete_(params));
      case 'restore':        return jsonOutput_(actionRestore_(params));
      case 'getSettings':    return jsonOutput_(actionGetSettings_(params));
      case 'updateSettings': return jsonOutput_(actionUpdateSettings_(params));
      default:
        return jsonOutput_({ ok: false, error: 'ไม่รู้จักคำสั่ง: ' + (action || '(ไม่ได้ระบุ)') });
    }
  } catch (err) {
    // ไม่ส่งรายละเอียดภายในระบบกลับไปให้หน้าเว็บมากเกินจำเป็น
    return jsonOutput_({ ok: false, error: 'เซิร์ฟเวอร์ทำงานผิดพลาด: ' + err.message });
  }
}

/** แปลงผลลัพธ์เป็น JSON ส่งกลับหน้าเว็บ */
function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================================
 * การเชื่อมต่อ Google Sheet
 * ========================================================================= */

/** อ่านรหัสชีตจาก Script Properties (ห้าม hardcode ในโค้ด) */
function getSheetId_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) {
    throw new Error('ยังไม่ได้ตั้งค่า SHEET_ID กรุณาไปที่ Project Settings > Script Properties แล้วเพิ่ม SHEET_ID');
  }
  return id;
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getSheetId_());
}

function getSheet_(name) {
  var sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบแท็บชื่อ "' + name + '" ในชีต กรุณารันฟังก์ชัน setupSheets หนึ่งครั้ง');
  return sh;
}

/**
 * อ่านทั้งแท็บออกมาเป็น array ของ object โดยอิงจากหัวตารางแถวแรก
 * @returns {{header:string[], rows:Object[]}}
 */
function readSheet_(name) {
  var sh = getSheet_(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 1) return { header: [], rows: [] };

  var header = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    // ข้ามแถวว่างสนิท
    var isEmpty = row.every(function (c) { return c === '' || c === null; });
    if (isEmpty) continue;

    var obj = { _rowIndex: i + 1 }; // เลขแถวจริงในชีต (ไว้ใช้ตอนแก้ไข)
    for (var c = 0; c < header.length; c++) {
      obj[header[c]] = cellToString_(row[c]);
    }
    rows.push(obj);
  }
  return { header: header, rows: rows };
}

/** แปลงค่าในเซลล์เป็นข้อความ (วันที่ให้เป็น ISO string) */
function cellToString_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString();
  return String(v).trim();
}

/* =========================================================================
 * การยืนยันตัวตน
 * ========================================================================= */

/**
 * ตรวจ token ที่ส่งมากับคำขอ
 * @param {Object} params
 * @param {string} [requiredRole] ใส่ 'admin' ถ้าคำสั่งนี้ต้องเป็นผู้ดูแลระบบ
 * @returns {{username:string, role:string}}
 */
function requireAuth_(params, requiredRole) {
  var token = params && params.token ? String(params.token) : '';
  if (!token) throw new Error('ยังไม่ได้เข้าสู่ระบบ กรุณาล็อกอินใหม่');

  var raw = CacheService.getScriptCache().get('token_' + token);
  if (!raw) throw new Error('เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่อีกครั้ง');

  var session = JSON.parse(raw);
  if (requiredRole === 'admin' && session.role !== 'admin') {
    throw new Error('บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้ (ต้องเป็นผู้ดูแลระบบเท่านั้น)');
  }
  // ต่ออายุ token ทุกครั้งที่ใช้งาน
  CacheService.getScriptCache().put('token_' + token, raw, TOKEN_TTL_SECONDS);
  return session;
}

/** action=login — ตรวจ username/password กับแท็บ Users */
function actionLogin_(params) {
  var username = String(params.username || '').trim();
  var password = String(params.password || '');
  if (!username || !password) return { ok: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบ' };

  var users = readSheet_(SHEET_USERS).rows;
  var found = null;
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].username).trim() === username) { found = users[i]; break; }
  }

  // ข้อความเดียวกันทั้งกรณีไม่มีผู้ใช้และรหัสผิด เพื่อไม่ให้เดาว่ามีบัญชีนี้อยู่จริงหรือไม่
  if (!found || String(found.password) !== password) {
    return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  }
  if (String(found.is_active).toUpperCase() !== 'TRUE') {
    return { ok: false, error: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ' };
  }

  var role = String(found.role).trim().toLowerCase() === 'admin' ? 'admin' : 'staff';
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    'token_' + token,
    JSON.stringify({ username: username, role: role }),
    TOKEN_TTL_SECONDS
  );

  return { ok: true, data: { token: token, username: username, role: role } };
}

/* =========================================================================
 * คำสั่งเกี่ยวกับผู้ป่วย
 * ========================================================================= */

/** ตัดฟิลด์ภายในออกก่อนส่งกลับหน้าเว็บ */
function toPatientDto_(row) {
  var dto = {};
  PATIENT_COLUMNS.forEach(function (c) { dto[c] = row[c] !== undefined ? row[c] : ''; });
  return dto;
}

/** action=list — ส่งรายชื่อผู้ป่วยทั้งหมด (includeDeleted=1 = เอาเฉพาะที่ถูกลบ) */
function actionList_(params) {
  requireAuth_(params);
  var onlyDeleted = String(params.includeDeleted || '0') === '1';
  var rows = readSheet_(SHEET_PATIENTS).rows.filter(function (r) {
    var deleted = !!String(r.deleted_at || '').trim();
    return onlyDeleted ? deleted : !deleted;
  });
  return { ok: true, data: rows.map(toPatientDto_) };
}

/** action=get — ดึงผู้ป่วยรายเดียวด้วย patient_code */
function actionGet_(params) {
  requireAuth_(params);
  var id = String(params.id || '').trim();
  if (!id) return { ok: false, error: 'ไม่ได้ระบุรหัสผู้ป่วย' };

  var found = findPatientRow_(id);
  if (!found) return { ok: false, error: 'ไม่พบข้อมูลผู้ป่วยรายนี้' };
  return { ok: true, data: toPatientDto_(found) };
}

/** ค้นหาแถวของผู้ป่วยจากรหัส */
function findPatientRow_(patientCode) {
  var rows = readSheet_(SHEET_PATIENTS).rows;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].patient_code).trim() === patientCode) return rows[i];
  }
  return null;
}

/** ตรวจความถูกต้องของข้อมูลผู้ป่วยฝั่งเซิร์ฟเวอร์ (กันข้อมูลเสียเข้าชีต) */
function validatePatient_(p) {
  if (!p || typeof p !== 'object') return 'ไม่ได้ส่งข้อมูลผู้ป่วยมา';
  if (!String(p.first_name || '').trim()) return 'กรุณากรอกชื่อ';
  if (!String(p.last_name || '').trim()) return 'กรุณากรอกนามสกุล';
  if (p.patient_type !== 'bedridden' && p.patient_type !== 'general') return 'ประเภทผู้ป่วยไม่ถูกต้อง';
  if (!String(p.address_text || '').trim()) return 'กรุณากรอกที่อยู่';
  if (!String(p.symptoms || '').trim()) return 'กรุณากรอกอาการ/โรคประจำตัว';

  var lat = String(p.lat || '').trim();
  var lng = String(p.lng || '').trim();
  if (lat && (isNaN(Number(lat)) || Number(lat) < -90 || Number(lat) > 90)) return 'ค่าละติจูดไม่ถูกต้อง';
  if (lng && (isNaN(Number(lng)) || Number(lng) < -180 || Number(lng) > 180)) return 'ค่าลองจิจูดไม่ถูกต้อง';
  return null;
}

/** ออกรหัสผู้ป่วยใหม่ รูปแบบ P-ปีค.ศ.-เลข 4 หลัก */
function generatePatientCode_(rows) {
  var year = new Date().getFullYear();
  var max = 0;
  rows.forEach(function (r) {
    var m = /^P-\d{4}-(\d{4})$/.exec(String(r.patient_code || '').trim());
    if (m) {
      var n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  });
  var next = String(max + 1);
  while (next.length < 4) next = '0' + next;
  return 'P-' + year + '-' + next;
}

/** action=create — เพิ่มผู้ป่วยใหม่ (เฉพาะ admin) */
function actionCreate_(params) {
  requireAuth_(params, 'admin');

  var p = params.patient;
  var err = validatePatient_(p);
  if (err) return { ok: false, error: err };

  var lock = LockService.getScriptLock();
  lock.waitLock(15000); // กันการเพิ่มพร้อมกันแล้วได้รหัสซ้ำ
  try {
    var sheet = getSheet_(SHEET_PATIENTS);
    var rows = readSheet_(SHEET_PATIENTS).rows;
    var now = new Date().toISOString();

    var record = {
      patient_code: generatePatientCode_(rows),
      created_at: now,
      updated_at: now,
      deleted_at: ''
    };
    EDITABLE_FIELDS.forEach(function (f) { record[f] = String(p[f] === undefined || p[f] === null ? '' : p[f]).trim(); });

    sheet.appendRow(PATIENT_COLUMNS.map(function (c) { return record[c]; }));
    return { ok: true, data: record };
  } finally {
    lock.releaseLock();
  }
}

/** action=update — แก้ไขข้อมูลผู้ป่วย (เฉพาะ admin) */
function actionUpdate_(params) {
  requireAuth_(params, 'admin');

  var id = String(params.id || '').trim();
  if (!id) return { ok: false, error: 'ไม่ได้ระบุรหัสผู้ป่วย' };

  var p = params.patient;
  var err = validatePatient_(p);
  if (err) return { ok: false, error: err };

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var existing = findPatientRow_(id);
    if (!existing) return { ok: false, error: 'ไม่พบข้อมูลผู้ป่วยรายนี้' };

    var record = {};
    PATIENT_COLUMNS.forEach(function (c) { record[c] = existing[c] || ''; });
    EDITABLE_FIELDS.forEach(function (f) {
      if (p[f] !== undefined && p[f] !== null) record[f] = String(p[f]).trim();
    });
    record.patient_code = existing.patient_code; // รหัสผู้ป่วยห้ามเปลี่ยน
    record.updated_at = new Date().toISOString();

    writeRow_(SHEET_PATIENTS, existing._rowIndex, PATIENT_COLUMNS.map(function (c) { return record[c]; }));
    return { ok: true, data: record };
  } finally {
    lock.releaseLock();
  }
}

/** action=delete — ลบแบบ Soft Delete (ใส่ deleted_at) ไม่ลบแถวออกจากชีต */
function actionDelete_(params) {
  requireAuth_(params, 'admin');
  return setDeletedAt_(params, new Date().toISOString());
}

/** action=restore — กู้คืนโดยล้างค่า deleted_at */
function actionRestore_(params) {
  requireAuth_(params, 'admin');
  return setDeletedAt_(params, '');
}

function setDeletedAt_(params, value) {
  var id = String(params.id || '').trim();
  if (!id) return { ok: false, error: 'ไม่ได้ระบุรหัสผู้ป่วย' };

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var existing = findPatientRow_(id);
    if (!existing) return { ok: false, error: 'ไม่พบข้อมูลผู้ป่วยรายนี้' };

    var sheet = getSheet_(SHEET_PATIENTS);
    var colDeleted = PATIENT_COLUMNS.indexOf('deleted_at') + 1;
    var colUpdated = PATIENT_COLUMNS.indexOf('updated_at') + 1;

    sheet.getRange(existing._rowIndex, colDeleted).setValue(value);
    sheet.getRange(existing._rowIndex, colUpdated).setValue(new Date().toISOString());

    existing.deleted_at = value;
    return { ok: true, data: toPatientDto_(existing) };
  } finally {
    lock.releaseLock();
  }
}

function writeRow_(sheetName, rowIndex, values) {
  getSheet_(sheetName).getRange(rowIndex, 1, 1, values.length).setValues([values]);
}

/* =========================================================================
 * คำสั่งเกี่ยวกับการตั้งค่า
 * ========================================================================= */

/** action=getSettings — อ่านค่าทั้งหมดจากแท็บ Settings (ไม่ต้องล็อกอิน เพราะหน้า login ต้องใช้ชื่อระบบ) */
function actionGetSettings_(params) {
  var rows = readSheet_(SHEET_SETTINGS).rows;
  var out = {};
  rows.forEach(function (r) {
    var k = String(r.key || '').trim();
    if (k) out[k] = String(r.value === undefined || r.value === null ? '' : r.value).trim();
  });
  return { ok: true, data: out };
}

/** action=updateSettings — บันทึกค่าตั้งค่า (เฉพาะ admin) */
function actionUpdateSettings_(params) {
  requireAuth_(params, 'admin');

  var incoming = params.settings;
  if (!incoming || typeof incoming !== 'object') return { ok: false, error: 'ไม่ได้ส่งค่าที่จะบันทึกมา' };

  var allowed = ['system_name', 'municipality_lat', 'municipality_lng'];

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getSheet_(SHEET_SETTINGS);
    var data = readSheet_(SHEET_SETTINGS);

    allowed.forEach(function (key) {
      if (incoming[key] === undefined) return;
      var value = String(incoming[key]).trim();

      var target = null;
      for (var i = 0; i < data.rows.length; i++) {
        if (String(data.rows[i].key).trim() === key) { target = data.rows[i]; break; }
      }
      if (target) {
        sheet.getRange(target._rowIndex, 2).setValue(value);
      } else {
        sheet.appendRow([key, value]);
      }
    });

    return actionGetSettings_(params);
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================
 * ฟังก์ชันติดตั้งครั้งแรก — เลือกฟังก์ชันนี้แล้วกด Run หนึ่งครั้ง
 * ========================================================================= */

function setupSheets() {
  var ss = getSpreadsheet_();

  ensureSheetWithHeader_(ss, SHEET_PATIENTS, PATIENT_COLUMNS);
  ensureSheetWithHeader_(ss, SHEET_USERS, USER_COLUMNS);
  ensureSheetWithHeader_(ss, SHEET_SETTINGS, SETTINGS_COLUMNS);

  // ผู้ใช้เริ่มต้น (ให้เข้าไปเปลี่ยนรหัสผ่านในชีตทันทีหลังติดตั้ง)
  var users = ss.getSheetByName(SHEET_USERS);
  if (users.getLastRow() < 2) {
    users.appendRow(['admin', 'changeme1234', 'admin', 'TRUE']);
    users.appendRow(['staff', 'changeme1234', 'staff', 'TRUE']);
  }

  // ค่าตั้งต้นของระบบ
  var settings = ss.getSheetByName(SHEET_SETTINGS);
  if (settings.getLastRow() < 2) {
    settings.appendRow(['system_name', 'ระบบจัดเก็บประวัติผู้ป่วยในเขตเทศบาล']);
    settings.appendRow(['municipality_lat', '13.736717']);
    settings.appendRow(['municipality_lng', '100.523186']);
  }

  Logger.log('ติดตั้งแท็บเรียบร้อยแล้ว: Patients / Users / Settings');
  Logger.log('อย่าลืมเข้าไปเปลี่ยนรหัสผ่านในแท็บ Users และแก้พิกัดเทศบาลในแท็บ Settings');
}

function ensureSheetWithHeader_(ss, name, columns) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  var firstRow = sh.getRange(1, 1, 1, columns.length).getValues()[0];
  var hasHeader = firstRow.some(function (c) { return String(c).trim() !== ''; });
  if (!hasHeader) {
    sh.getRange(1, 1, 1, columns.length).setValues([columns]);
    sh.getRange(1, 1, 1, columns.length).setFontWeight('bold').setBackground('#0f2a44').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}
