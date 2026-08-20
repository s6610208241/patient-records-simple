/* =========================================================
   js/patient-form.js — ฟอร์มเพิ่ม/แก้ไขข้อมูลผู้ป่วย (patient-form.html)
   ---------------------------------------------------------
   - ตรวจความถูกต้องของข้อมูล (validation) ด้วย JS พร้อมข้อความไทยใต้ช่องที่ผิด
   - ดึงพิกัด lat/lng จากลิงก์ Google Maps ด้วย regex (FR-05 ไม่ต้องใช้ API Key)
   ========================================================= */

/**
 * ดึงพิกัดจากลิงก์ Google Maps
 * รองรับรูปแบบที่พบบ่อย เช่น
 *   https://www.google.com/maps/@13.7563,100.5018,17z
 *   https://www.google.com/maps/place/.../@13.7563,100.5018,17z/data=!3d13.75!4d100.50
 *   https://maps.google.com/?q=13.7563,100.5018
 *   13.7563, 100.5018   (วางเป็นตัวเลขเปล่าก็ได้)
 * @returns {{lat:string, lng:string}|null}
 */
function extractLatLngFromMapUrl(url) {
  if (!url) return null;
  const text = String(url).trim();
  const patterns = [
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,        // ลิงก์แบบเต็มของ Google Maps
    /[?&]q=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,     // ?q=lat,lng
    /[?&]destination=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,             // /@lat,lng,17z
    /^(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/,      // วางตัวเลขเปล่า
  ];
  for (let i = 0; i < patterns.length; i++) {
    const m = patterns[i].exec(text);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (isValidLat(lat) && isValidLng(lng)) {
        return { lat: String(lat), lng: String(lng) };
      }
    }
  }
  return null;
}

function isValidLat(v) { return typeof v === 'number' && !isNaN(v) && v >= -90 && v <= 90; }
function isValidLng(v) { return typeof v === 'number' && !isNaN(v) && v >= -180 && v <= 180; }

/* ---------------------------------------------------------
   ตัวควบคุมฟอร์ม
   --------------------------------------------------------- */

const PatientForm = {
  mode: 'create',   // create | edit
  editId: null,
  original: null,

  /** รายชื่อช่องกรอกทั้งหมดในฟอร์ม */
  FIELDS: ['first_name', 'last_name', 'patient_type', 'address_text', 'symptoms', 'phone', 'note', 'map_url', 'lat', 'lng'],

  init: async function () {
    const params = new URLSearchParams(window.location.search);
    this.editId = params.get('id');
    this.mode = this.editId ? 'edit' : 'create';

    const title = document.getElementById('form-title');
    const subtitle = document.getElementById('form-subtitle');
    if (title) title.textContent = this.mode === 'edit' ? 'แก้ไขข้อมูลผู้ป่วย' : 'เพิ่มผู้ป่วยรายใหม่';
    if (subtitle) {
      subtitle.textContent = this.mode === 'edit'
        ? 'แก้ไขแล้วกดปุ่มบันทึกด้านล่าง รหัสผู้ป่วยจะไม่เปลี่ยน'
        : 'กรอกข้อมูลให้ครบในช่องที่มีเครื่องหมาย * แล้วกดบันทึก ระบบจะออกรหัสผู้ป่วยให้อัตโนมัติ';
    }

    const self = this;

    // ปุ่มดึงพิกัดจากลิงก์แผนที่
    const btnExtract = document.getElementById('btn-extract-latlng');
    if (btnExtract) {
      btnExtract.addEventListener('click', function () { self.extractFromUrl(); });
    }
    const mapUrlInput = document.getElementById('map_url');
    if (mapUrlInput) {
      mapUrlInput.addEventListener('blur', function () {
        if (mapUrlInput.value.trim() && !document.getElementById('lat').value.trim()) self.extractFromUrl();
      });
    }

    // ล้างข้อความผิดพลาดเมื่อผู้ใช้เริ่มพิมพ์แก้
    this.FIELDS.forEach(function (name) {
      const input = document.getElementById(name);
      if (input) {
        input.addEventListener('input', function () { self.clearError(name); });
        input.addEventListener('change', function () { self.clearError(name); });
      }
    });

    const form = document.getElementById('patient-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        self.submit();
      });
    }

    const btnCancel = document.getElementById('btn-cancel');
    if (btnCancel) {
      btnCancel.addEventListener('click', function () {
        if (window.confirm('ออกจากหน้านี้โดยไม่บันทึกใช่หรือไม่? ข้อมูลที่กรอกไว้จะหายไป')) {
          window.location.href = self.editId
            ? 'patient-detail.html?id=' + encodeURIComponent(self.editId)
            : 'index.html';
        }
      });
    }

    if (this.mode === 'edit') {
      await this.loadExisting();
    } else {
      this.showForm();
    }
  },

  /** โหลดข้อมูลเดิมมาใส่ในฟอร์ม (กรณีแก้ไข) */
  loadExisting: async function () {
    this.setLoading(true);
    const res = await Api.getPatient(this.editId);
    this.setLoading(false);
    if (!res.ok) {
      this.showTopMessage('error', res.error);
      return;
    }
    this.original = res.data;
    const p = res.data;
    this.FIELDS.forEach(function (name) {
      const input = document.getElementById(name);
      if (input && p[name] !== undefined && p[name] !== null) input.value = p[name];
    });
    const codeBox = document.getElementById('patient_code_display');
    if (codeBox) codeBox.textContent = p.patient_code;
    const codeWrap = document.getElementById('patient-code-wrap');
    if (codeWrap) codeWrap.classList.remove('hidden');
    this.showForm();
  },

  showForm: function () {
    const f = document.getElementById('patient-form');
    if (f) f.classList.remove('hidden');
  },

  setLoading: function (on) {
    const el = document.getElementById('state-loading');
    if (el) el.classList.toggle('hidden', !on);
  },

  /** ดึงพิกัดจากช่องลิงก์แผนที่มาเติมในช่อง lat/lng */
  extractFromUrl: function () {
    const url = document.getElementById('map_url').value;
    const hint = document.getElementById('map-url-hint');
    const found = extractLatLngFromMapUrl(url);
    if (found) {
      document.getElementById('lat').value = found.lat;
      document.getElementById('lng').value = found.lng;
      this.clearError('lat');
      this.clearError('lng');
      if (hint) {
        hint.className = 'text-sm mt-1.5 text-emerald-700 font-semibold';
        hint.textContent = '✓ ดึงพิกัดได้แล้ว: ' + found.lat + ', ' + found.lng;
      }
    } else if (hint) {
      hint.className = 'text-sm mt-1.5 text-amber-700';
      hint.textContent = 'ดึงพิกัดจากลิงก์นี้ไม่ได้ (ลิงก์ย่อแบบ maps.app.goo.gl ต้องกดเปิดในเบราว์เซอร์ก่อน แล้วค่อยคัดลอกลิงก์ยาวจากช่องที่อยู่เว็บมาวาง) หรือจะพิมพ์ตัวเลขพิกัดเองในช่องด้านล่างก็ได้';
    }
  },

  /* ---------- validation ---------- */

  showError: function (name, message) {
    const input = document.getElementById(name);
    const err = document.getElementById('err-' + name);
    if (input) input.classList.add('is-invalid');
    if (err) err.textContent = message;
  },

  clearError: function (name) {
    const input = document.getElementById(name);
    const err = document.getElementById('err-' + name);
    if (input) input.classList.remove('is-invalid');
    if (err) err.textContent = '';
  },

  /** ตรวจข้อมูลทั้งฟอร์ม คืน object ถ้าผ่าน / คืน null ถ้าไม่ผ่าน */
  validate: function () {
    const self = this;
    const get = function (name) {
      const el = document.getElementById(name);
      return el ? String(el.value).trim() : '';
    };
    this.FIELDS.forEach(function (n) { self.clearError(n); });

    const data = {
      first_name: get('first_name'),
      last_name: get('last_name'),
      patient_type: get('patient_type'),
      address_text: get('address_text'),
      symptoms: get('symptoms'),
      phone: get('phone'),
      note: get('note'),
      map_url: get('map_url'),
      lat: get('lat'),
      lng: get('lng'),
    };

    let firstBad = null;
    const fail = function (name, msg) {
      self.showError(name, msg);
      if (!firstBad) firstBad = name;
    };

    if (!data.first_name) fail('first_name', 'กรุณากรอกชื่อ');
    else if (data.first_name.length > 100) fail('first_name', 'ชื่อยาวเกินไป (ไม่เกิน 100 ตัวอักษร)');

    if (!data.last_name) fail('last_name', 'กรุณากรอกนามสกุล');
    else if (data.last_name.length > 100) fail('last_name', 'นามสกุลยาวเกินไป (ไม่เกิน 100 ตัวอักษร)');

    if (data.patient_type !== 'bedridden' && data.patient_type !== 'general') {
      fail('patient_type', 'กรุณาเลือกประเภทผู้ป่วย');
    }

    if (!data.address_text) fail('address_text', 'กรุณากรอกที่อยู่ เพื่อให้เจ้าหน้าที่เดินทางไปถูก');
    if (!data.symptoms) fail('symptoms', 'กรุณากรอกอาการ/โรคประจำตัว');

    if (data.phone && !/^[0-9+\-\s()]{6,20}$/.test(data.phone)) {
      fail('phone', 'เบอร์โทรควรมีเฉพาะตัวเลข เครื่องหมาย - หรือวงเล็บ เช่น 081-234-5678');
    }

    if (data.lat && !isValidLat(parseFloat(data.lat))) {
      fail('lat', 'ค่าละติจูดไม่ถูกต้อง (ต้องเป็นตัวเลขระหว่าง -90 ถึง 90)');
    }
    if (data.lng && !isValidLng(parseFloat(data.lng))) {
      fail('lng', 'ค่าลองจิจูดไม่ถูกต้อง (ต้องเป็นตัวเลขระหว่าง -180 ถึง 180)');
    }
    if ((data.lat && !data.lng) || (!data.lat && data.lng)) {
      fail(data.lat ? 'lng' : 'lat', 'พิกัดต้องกรอกคู่กันทั้งละติจูดและลองจิจูด (หรือเว้นว่างทั้งคู่ก็ได้ ระบบจะใช้ที่อยู่แทน)');
    }

    if (firstBad) {
      const el = document.getElementById(firstBad);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus({ preventScroll: true });
      }
      this.showTopMessage('error', 'ยังกรอกข้อมูลไม่ครบหรือมีบางช่องไม่ถูกต้อง กรุณาตรวจช่องที่ขึ้นข้อความสีแดง');
      return null;
    }
    return data;
  },

  showTopMessage: function (kind, text) {
    const box = document.getElementById('form-message');
    if (!box) return;
    box.className = 'alert ' + (kind === 'error' ? 'alert-error' : 'alert-success');
    box.textContent = text;
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  hideTopMessage: function () {
    const box = document.getElementById('form-message');
    if (box) box.classList.add('hidden');
  },

  /* ---------- บันทึก ---------- */

  submit: async function () {
    this.hideTopMessage();
    const data = this.validate();
    if (!data) return;

    const btn = document.getElementById('btn-save');
    const btnText = document.getElementById('btn-save-text');
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'กำลังบันทึก…';

    const res = this.mode === 'edit'
      ? await Api.updatePatient(this.editId, data)
      : await Api.createPatient(data);

    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'บันทึกข้อมูล';

    if (!res.ok) {
      this.showTopMessage('error', 'บันทึกไม่สำเร็จ: ' + res.error);
      return;
    }

    const code = (res.data && res.data.patient_code) ? res.data.patient_code : this.editId;
    this.showTopMessage('success', 'บันทึกข้อมูลเรียบร้อยแล้ว กำลังพาไปหน้ารายละเอียด…');
    setTimeout(function () {
      window.location.href = 'patient-detail.html?id=' + encodeURIComponent(code);
    }, 800);
  },
};

document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('patient-form')) PatientForm.init();
});
