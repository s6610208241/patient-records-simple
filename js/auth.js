/* =========================================================
   js/auth.js — ระบบล็อกอิน / ตรวจสิทธิ์ / แถบเมนูด้านบน
   ---------------------------------------------------------
   เก็บสถานะการล็อกอินไว้ใน sessionStorage (หายเมื่อปิดแท็บ)
   ทุกหน้ายกเว้น login.html ต้องเรียก Auth.requireLogin() ก่อนเสมอ
   ========================================================= */

const SESSION_KEY = 'pr_session';

const Auth = {
  /** อ่านข้อมูลผู้ใช้ที่ล็อกอินอยู่ คืน null ถ้ายังไม่ได้ล็อกอิน */
  getSession: function () {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.username || !s.role) return null;
      return s;
    } catch (e) {
      return null;
    }
  },

  isLoggedIn: function () { return this.getSession() !== null; },

  isAdmin: function () {
    const s = this.getSession();
    return !!s && s.role === 'admin';
  },

  /**
   * ล็อกอิน — ตรวจกับ tab Users ผ่าน Apps Script (หรือข้อมูลจำลองในโหมดเดโม)
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  login: async function (username, password) {
    if (!username || !password) {
      return { ok: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบ' };
    }
    const res = await Api.login(username, password);
    if (!res.ok) return res;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        token: res.data.token,
        username: res.data.username,
        role: res.data.role,
        loginAt: new Date().toISOString(),
      }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'เบราว์เซอร์ไม่อนุญาตให้เก็บสถานะการเข้าสู่ระบบ กรุณาปิดโหมดไม่ระบุตัวตนแล้วลองใหม่' };
    }
  },

  /** ออกจากระบบแล้วกลับไปหน้าล็อกอิน */
  logout: function () {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = 'login.html';
  },

  /**
   * ยามเฝ้าประตูของทุกหน้า — เรียกบรรทัดแรกสุดของสคริปต์แต่ละหน้า
   * @param {string} [requiredRole] ใส่ 'admin' ถ้าหน้านี้เฉพาะผู้ดูแลระบบ
   * @returns {boolean} true = ผ่าน, false = กำลังเด้งออกจากหน้านี้
   */
  requireLogin: function (requiredRole) {
    const s = this.getSession();
    if (!s) {
      const back = encodeURIComponent(window.location.pathname.split('/').pop() + window.location.search);
      window.location.replace('login.html?next=' + back);
      return false;
    }
    if (requiredRole === 'admin' && s.role !== 'admin') {
      window.location.replace('index.html?denied=1');
      return false;
    }
    return true;
  },
};

/* ---------------------------------------------------------
   แถบเมนูด้านบน — ใช้ร่วมกันทุกหน้า
   วางแท็ก <div id="app-header"></div> ไว้บนสุดของ <body> แล้วเรียก
   Auth.renderHeader('ชื่อไฟล์หน้าปัจจุบัน')
   --------------------------------------------------------- */

Auth.renderHeader = function (currentPage) {
  const host = document.getElementById('app-header');
  if (!host) return;
  const s = this.getSession() || { username: '-', role: 'staff' };
  const admin = s.role === 'admin';

  const menu = [
    { href: 'index.html', label: 'รายชื่อผู้ป่วย', adminOnly: false },
    { href: 'patient-form.html', label: 'เพิ่มผู้ป่วย', adminOnly: true },
    { href: 'trash.html', label: 'ถังขยะ', adminOnly: true },
    { href: 'settings.html', label: 'ตั้งค่า', adminOnly: true },
    { href: 'help.html', label: 'คู่มือ', adminOnly: false },
  ].filter(function (m) { return admin || !m.adminOnly; });

  const links = menu.map(function (m) {
    const active = m.href === currentPage ? ' active' : '';
    return '<a class="navlink' + active + '" href="' + m.href + '">' + m.label + '</a>';
  }).join('');

  host.innerHTML =
    (IS_DEMO
      ? '<div class="demo-ribbon text-center text-xs sm:text-sm py-1.5 px-3 font-semibold">' +
        'โหมดเดโม — ยังไม่ได้เชื่อมต่อ Google Sheet (ข้อมูลที่เห็นเป็นข้อมูลจำลอง แก้ค่า API_URL ใน js/api.js เพื่อใช้ข้อมูลจริง)' +
        '</div>'
      : '') +
    '<header class="topbar shadow-lg">' +
      '<div class="max-w-5xl mx-auto px-3 sm:px-4">' +
        '<div class="flex items-center justify-between gap-2 py-2.5">' +
          '<a href="index.html" class="flex items-center gap-2.5 min-w-0">' +
            '<img src="images/logo.png" alt="ตราสัญลักษณ์เทศบาล" class="app-logo" />' +
            '<span class="min-w-0">' +
              '<span id="hdr-system-name" class="block font-bold text-sm sm:text-base truncate text-white">กำลังโหลดชื่อระบบ…</span>' +
              '<span class="block text-[11px] text-slate-300">ระบบประวัติผู้ป่วย เทศบาล</span>' +
            '</span>' +
          '</a>' +
          '<div class="flex items-center gap-2 shrink-0">' +
            '<span class="hidden sm:inline text-xs text-slate-200">' + escapeHtml(s.username) + '</span>' +
            '<span class="badge badge-role">' + (admin ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่') + '</span>' +
            '<button type="button" id="btn-logout" class="btn btn-ghost !min-h-0 !py-1.5 !px-3 text-sm">ออก</button>' +
          '</div>' +
        '</div>' +
        '<nav class="flex gap-1 overflow-x-auto pb-1.5 -mx-1 px-1">' + links + '</nav>' +
      '</div>' +
    '</header>';

  const btn = document.getElementById('btn-logout');
  if (btn) {
    btn.addEventListener('click', function () {
      if (window.confirm('ต้องการออกจากระบบใช่หรือไม่?')) Auth.logout();
    });
  }

  // เติมชื่อระบบจาก tab Settings (ห้าม hardcode ชื่อระบบไว้ในโค้ด)
  Api.getSettings().then(function (res) {
    const el = document.getElementById('hdr-system-name');
    if (!el) return;
    el.textContent = (res.ok && res.data && res.data.system_name) ? res.data.system_name : 'ระบบประวัติผู้ป่วย';
  });
};

/* ---------------------------------------------------------
   ตัวช่วยที่ทุกหน้าใช้ร่วมกัน
   --------------------------------------------------------- */

/** ป้องกันข้อความจากฐานข้อมูลไปทำลายหน้าเว็บ (XSS) */
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** แปลงวันที่ ISO เป็นรูปแบบไทย เช่น 20 ส.ค. 2569 14:30 น. */
function formatThaiDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + (d.getFullYear() + 543) + ' ' + hh + ':' + mm + ' น.';
}

/** ชื่อประเภทผู้ป่วยเป็นภาษาไทย */
function patientTypeLabel(type) {
  return type === 'bedridden' ? 'ผู้ป่วยติดเตียง' : 'ผู้ป่วยทั่วไป';
}

/** ป้ายสีของประเภทผู้ป่วย (แดง/ส้ม = ติดเตียง, เขียว/น้ำเงิน = ทั่วไป) */
function patientTypeBadge(type) {
  const cls = type === 'bedridden' ? 'badge-bedridden' : 'badge-general';
  return '<span class="badge ' + cls + '">' + patientTypeLabel(type) + '</span>';
}
