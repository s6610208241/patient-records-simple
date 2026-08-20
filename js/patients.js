/* =========================================================
   js/patients.js — หน้ารายการผู้ป่วย (index.html)
   ---------------------------------------------------------
   โหลดข้อมูลทั้งหมดครั้งเดียว แล้วค้นหา/กรองด้วย JavaScript ฝั่งหน้าเว็บ
   (ตาม SPEC ข้อ FR-07 — ข้อมูลชุดเล็ก ไม่ต้องแบ่งหน้าที่เซิร์ฟเวอร์)
   ========================================================= */

/** สร้างลิงก์นำทาง Google Maps โดยจุดเริ่มต้นเป็นพิกัดเทศบาลเสมอ (FR-06) */
function buildNavigationUrl(patient, settings) {
  const originLat = settings && settings.municipality_lat ? String(settings.municipality_lat).trim() : '';
  const originLng = settings && settings.municipality_lng ? String(settings.municipality_lng).trim() : '';
  if (!originLat || !originLng) return null; // ยังไม่ได้ตั้งค่าพิกัดเทศบาล

  const hasCoord = patient.lat && patient.lng && String(patient.lat).trim() && String(patient.lng).trim();
  const destination = hasCoord
    ? String(patient.lat).trim() + ',' + String(patient.lng).trim()
    : String(patient.address_text || '').trim();
  if (!destination) return null;

  return 'https://www.google.com/maps/dir/?api=1'
    + '&origin=' + encodeURIComponent(originLat + ',' + originLng)
    + '&destination=' + encodeURIComponent(destination)
    + '&travelmode=driving';
}

/* ---------------------------------------------------------
   ตัวควบคุมหน้ารายการผู้ป่วย
   --------------------------------------------------------- */

const PatientList = {
  all: [],          // ข้อมูลผู้ป่วยทั้งหมดที่โหลดมา
  keyword: '',      // คำค้นล่าสุด
  typeFilter: 'all', // all | bedridden | general
  searchTimer: null,

  el: {},

  init: function () {
    this.el = {
      search: document.getElementById('search-input'),
      clearSearch: document.getElementById('btn-clear-search'),
      filters: document.querySelectorAll('[data-type-filter]'),
      loading: document.getElementById('state-loading'),
      empty: document.getElementById('state-empty'),
      error: document.getElementById('state-error'),
      errorText: document.getElementById('state-error-text'),
      retry: document.getElementById('btn-retry'),
      list: document.getElementById('patient-list'),
      count: document.getElementById('result-count'),
      summaryAll: document.getElementById('summary-all'),
      summaryBed: document.getElementById('summary-bedridden'),
      summaryGen: document.getElementById('summary-general'),
    };

    const self = this;

    // ค้นหาแบบหน่วง 300 มิลลิวินาที (FR-07)
    if (this.el.search) {
      this.el.search.addEventListener('input', function (e) {
        const value = e.target.value;
        clearTimeout(self.searchTimer);
        self.searchTimer = setTimeout(function () {
          self.keyword = value.trim().toLowerCase();
          self.render();
        }, 300);
      });
    }

    if (this.el.clearSearch) {
      this.el.clearSearch.addEventListener('click', function () {
        self.el.search.value = '';
        self.keyword = '';
        self.el.search.focus();
        self.render();
      });
    }

    this.el.filters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.typeFilter = btn.getAttribute('data-type-filter');
        self.el.filters.forEach(function (b) {
          const on = b === btn;
          b.classList.toggle('btn-primary', on);
          b.classList.toggle('btn-ghost', !on);
        });
        self.render();
      });
    });

    if (this.el.retry) {
      this.el.retry.addEventListener('click', function () { self.load(); });
    }

    this.load();
  },

  /** โหลดข้อมูลผู้ป่วยทั้งหมด (ที่ยังไม่ถูกลบ) */
  load: async function () {
    this.showState('loading');
    const res = await Api.listPatients({ includeDeleted: false });
    if (!res.ok) {
      this.all = [];
      if (this.el.errorText) this.el.errorText.textContent = res.error;
      this.showState('error');
      return;
    }
    this.all = Array.isArray(res.data) ? res.data : [];
    this.updateSummary();
    this.render();
  },

  /** สรุปจำนวนผู้ป่วยด้านบน */
  updateSummary: function () {
    const bed = this.all.filter(function (p) { return p.patient_type === 'bedridden'; }).length;
    if (this.el.summaryAll) this.el.summaryAll.textContent = this.all.length;
    if (this.el.summaryBed) this.el.summaryBed.textContent = bed;
    if (this.el.summaryGen) this.el.summaryGen.textContent = this.all.length - bed;
  },

  /** กรองตามคำค้น + ประเภทผู้ป่วย */
  filtered: function () {
    const kw = this.keyword;
    const type = this.typeFilter;
    return this.all.filter(function (p) {
      if (type !== 'all' && p.patient_type !== type) return false;
      if (!kw) return true;
      const haystack = [p.first_name, p.last_name, p.patient_code].join(' ').toLowerCase();
      return haystack.indexOf(kw) !== -1;
    });
  },

  /** สลับการแสดงผลระหว่าง กำลังโหลด / ว่าง / ผิดพลาด / มีข้อมูล */
  showState: function (state) {
    const map = {
      loading: this.el.loading,
      empty: this.el.empty,
      error: this.el.error,
      list: this.el.list,
    };
    Object.keys(map).forEach(function (k) {
      if (map[k]) map[k].classList.toggle('hidden', k !== state);
    });
  },

  render: function () {
    const rows = this.filtered();

    if (this.el.count) {
      this.el.count.textContent = rows.length === this.all.length
        ? 'ทั้งหมด ' + rows.length + ' คน'
        : 'พบ ' + rows.length + ' คน จากทั้งหมด ' + this.all.length + ' คน';
    }

    if (rows.length === 0) {
      const emptyMsg = document.getElementById('state-empty-text');
      if (emptyMsg) {
        emptyMsg.textContent = (this.keyword || this.typeFilter !== 'all')
          ? 'ไม่พบผู้ป่วยที่ตรงกับเงื่อนไขการค้นหา ลองพิมพ์คำอื่นหรือเปลี่ยนตัวกรองดูครับ'
          : 'ยังไม่มีข้อมูลผู้ป่วยในระบบ';
      }
      this.showState('empty');
      return;
    }

    // เรียงผู้ป่วยติดเตียงขึ้นก่อน แล้วเรียงตามรหัสผู้ป่วย
    rows.sort(function (a, b) {
      if (a.patient_type !== b.patient_type) return a.patient_type === 'bedridden' ? -1 : 1;
      return String(a.patient_code).localeCompare(String(b.patient_code));
    });

    this.el.list.innerHTML = rows.map(function (p) { return PatientList.cardHtml(p); }).join('');
    this.showState('list');
  },

  cardHtml: function (p) {
    const fullName = escapeHtml((p.first_name || '') + ' ' + (p.last_name || ''));
    const detailUrl = 'patient-detail.html?id=' + encodeURIComponent(p.patient_code);
    const stripe = p.patient_type === 'bedridden' ? '#dc2626' : '#0d8f8c';

    return '' +
      '<a href="' + detailUrl + '" class="card block p-4 hover:shadow-md transition-shadow" ' +
         'style="border-left:5px solid ' + stripe + '">' +
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="min-w-0">' +
            '<div class="font-bold text-[17px] text-[color:var(--navy-800)] truncate">' + fullName + '</div>' +
            '<div class="text-xs text-slate-500 mt-0.5 font-mono">' + escapeHtml(p.patient_code) + '</div>' +
          '</div>' +
          patientTypeBadge(p.patient_type) +
        '</div>' +
        '<div class="mt-2.5 text-sm text-slate-600 flex gap-1.5">' +
          '<span class="shrink-0">📍</span>' +
          '<span class="line-clamp-2">' + escapeHtml(p.address_text || 'ไม่ได้ระบุที่อยู่') + '</span>' +
        '</div>' +
        '<div class="mt-1.5 text-sm text-slate-600 flex gap-1.5">' +
          '<span class="shrink-0">🩺</span>' +
          '<span class="line-clamp-2">' + escapeHtml(p.symptoms || '-') + '</span>' +
        '</div>' +
        '<div class="mt-3 text-right text-sm font-semibold text-[color:var(--teal-600)]">ดูรายละเอียด →</div>' +
      '</a>';
  },
};

// เริ่มทำงานเฉพาะเมื่ออยู่บนหน้าที่มีรายการผู้ป่วย (ไฟล์นี้ถูกเรียกใช้จากหลายหน้า)
document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('patient-list')) PatientList.init();
});
