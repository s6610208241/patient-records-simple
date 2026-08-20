# SPEC.md — ข้อกำหนดระบบ (ฉบับปรับใหม่: เวอร์ชันเรียบง่าย)

> **เหตุผลที่เปลี่ยนสถาปัตยกรรม:** งานนี้เป็นโปรเจกต์ส่งอาจารย์ ต้องการให้อธิบายได้ทุกส่วน
> จึงเปลี่ยนจาก Next.js + Supabase + RLS → **HTML/CSS/JS ล้วน + Google Sheet เป็นฐานข้อมูล**
> ไฟล์นี้แทนที่ SPEC.md ฉบับเดิมทั้งหมด (ฉบับเดิมเก็บไว้เป็น reference ในโฟลเดอร์เก่า)

---

## 0. ข้อมูลโปรเจกต์

| หัวข้อ | ค่า |
|---|---|
| ชื่อระบบ (ภาษาไทย) | `{{SYSTEM_NAME_TH}}` — **รอข้อมูลจากลูกค้า** |
| ชื่อระบบ (ภาษาอังกฤษ / ใช้ในโค้ด) | `{{SYSTEM_NAME_EN}}` — **รอข้อมูลจากลูกค้า** |
| โลโก้ | `{{LOGO_FILE}}` — **รอข้อมูลจากลูกค้า** |
| หน่วยงานเจ้าของระบบ | `{{ORG_NAME}}` (เทศบาล) |
| ที่ตั้งเทศบาล (จุดเริ่มนำทาง) | lat: `{{MUNICIPALITY_LAT}}` , lng: `{{MUNICIPALITY_LNG}}` |
| วันที่เริ่มเวอร์ชันนี้ | 2026-08-20 |

---

## 1. ภาพรวมระบบ

ระบบจัดเก็บและค้นหาประวัติผู้ป่วยในเขตเทศบาล สำหรับเจ้าหน้าที่เตรียมตัวก่อนออกเยี่ยมบ้าน
จุดเด่น: กดปุ่มเดียวนำทางจากเทศบาลไปบ้านผู้ป่วยได้ทันที

**Actors**
| บทบาท | สิทธิ์ |
|---|---|
| `admin` | เพิ่ม/แก้ไข/ลบผู้ป่วย + จัดการผู้ใช้ + ตั้งค่าระบบ |
| `staff` | ค้นหา/ดู/กดนำทางเท่านั้น |

---

## 2. ความต้องการเชิงฟังก์ชัน

### FR-01 ล็อกอิน (แบบง่าย)
- หน้า `login.html` กรอก username + password
- ตรวจสอบกับ tab `Users` ใน Google Sheet ผ่าน Apps Script (`action=login`)
- ถ้าถูกต้อง → เก็บ token/role ไว้ใน `sessionStorage` ของเบราว์เซอร์ ใช้ควบคุมว่าเห็นปุ่ม/หน้าไหนบ้าง
- ทุกหน้า (ยกเว้น login.html) ต้องเช็ค sessionStorage ก่อน ถ้าไม่มี → เด้งกลับ login.html
- **หมายเหตุ:** นี่คือระดับความปลอดภัยสำหรับสาธิต/ส่งงาน ไม่ใช่ระดับ production — ไม่ควรใช้ข้อมูลผู้ป่วยจริงในชีตนี้

### FR-02 CRUD ผู้ป่วย (Admin)
- เพิ่ม/แก้ไข/ลบผ่านฟอร์ม → เรียก Apps Script (`action=create/update/delete`)
- ลบ = Soft Delete (ใส่คอลัมน์ `deleted_at`) กู้คืนได้จากหน้า `trash.html`
- มีกล่องยืนยันก่อนลบทุกครั้ง

### FR-03 หมวดหมู่ผู้ป่วย
- `patient_type`: `bedridden` (ติดเตียง, ป้ายสีแดง/ส้ม) / `general` (ธรรมดา, ป้ายสีเขียว/น้ำเงิน)
- กรองตามประเภทได้ในหน้ารายการ

### FR-04 ฟอร์มบันทึกประวัติผู้ป่วย
ฟิลด์เหมือนเดิม: `patient_code`(auto), `first_name`, `last_name`, `patient_type`, `address_text`,
`symptoms`, `phone`(ไม่บังคับ), `note`(ไม่บังคับ), `map_url`(ไม่บังคับ), `lat`/`lng`(ไม่บังคับ)
- ตรวจ validation ด้วย JS ฝั่งหน้าเว็บ พร้อมข้อความไทยใต้ช่องที่ผิด
- ใช้งานบนมือถือได้สะดวก

### FR-05 พิกัด (แบบเรียบง่าย — ไม่ใช้ Maps JavaScript API)
- ช่องวางลิงก์ Google Maps → ดึง `lat,lng` ด้วย regex จากลิงก์ (ฝั่ง JS ธรรมดา ไม่ต้องมี API key)
- ไม่มีแผนที่ปักหมุดแบบ interactive (ตัดออกเพื่อไม่ต้องพึ่ง Google Cloud Billing)
- หน้ารายละเอียดผู้ป่วย แสดงพิกัด/ที่อยู่เป็นข้อความ + ปุ่ม "เปิดใน Google Maps"

### FR-06 ปุ่มนำทาง (จุดเริ่ม = เทศบาลเสมอ)
- ใช้ Google Maps **URL Scheme** (ฟรี ไม่ต้องมี API key):
  ```
  https://www.google.com/maps/dir/?api=1&origin={LAT_เทศบาล},{LNG_เทศบาล}&destination={LAT},{LNG}&travelmode=driving
  ```
- ถ้าผู้ป่วยไม่มีพิกัด → ใช้ `destination={ที่อยู่ข้อความ}` (encodeURIComponent)
- origin ดึงจาก tab `Settings` เสมอ ห้ามใช้ตำแหน่งผู้ใช้

### FR-07 ค้นหา
- ดึงข้อมูลผู้ป่วยทั้งหมดจาก Apps Script ครั้งเดียว (dataset เล็ก ไม่ต้อง pagination ฝั่ง server)
- กรอง/ค้นหาด้วย JS ฝั่งหน้าเว็บ (ชื่อ/นามสกุล/รหัสผู้ป่วย, ไม่สนตัวพิมพ์เล็กใหญ่) หน่วง 300ms
- ตัวกรองประเภทผู้ป่วยเพิ่มเติม

### FR-08 ตั้งค่าระบบ (Admin)
- แก้ชื่อระบบ/พิกัดเทศบาลผ่าน `settings.html` → เขียนกลับ tab `Settings`
- จัดการผู้ใช้ (เพิ่ม/ปิดบัญชี) ผ่าน tab `Users` โดยตรงหรือหน้าเว็บง่ายๆ

### FR-09 เอกสารประกอบ
- `docs/design-document.md` — อธิบายโครงสร้าง Google Sheet + Apps Script + หน้าเว็บ
- `docs/user-manual.md` — คู่มือใช้งาน แยก admin/staff

---

## 3. ความต้องการที่ไม่ใช่ฟังก์ชัน

- ภาษาไทยทั้งระบบ, Mobile-first
- ไม่เก็บ password เป็น plain text ใน code (เก็บใน Sheet เท่านั้น, Apps Script เป็นตัวเช็ค)
- **ไม่ใช่ระบบระดับ production** — เหมาะกับสาธิต/dataset เล็ก (หลักสิบถึงหลักร้อยรายการ) ไม่ได้ออกแบบรองรับข้อมูลจำนวนมาก
- แนะนำใช้ข้อมูลจำลอง (mock data) ตอน demo ให้อาจารย์ดู แทนข้อมูลผู้ป่วยจริง

---

## 4. เทคโนโลยีที่ใช้

| ส่วน | เทคโนโลยี |
|---|---|
| หน้าเว็บ | HTML + CSS + Vanilla JavaScript (ไม่มี build step) |
| ตกแต่ง | Tailwind CSS ผ่าน CDN (`<script src="https://cdn.tailwindcss.com">`) |
| ฐานข้อมูล | Google Sheets |
| ตัวกลาง API | Google Apps Script (deploy เป็น Web App, `doGet`/`doPost`) |
| แผนที่/นำทาง | Google Maps URL Scheme (ไม่ต้องใช้ API Key) |
| ที่ฝากเว็บ | GitHub Pages หรือ Vercel (static hosting ฟรี) |

---

## 5. โครงสร้าง Google Sheet

**Tab: Patients**
| คอลัมน์ | หมายเหตุ |
|---|---|
| patient_code | เช่น P-2026-0001 |
| first_name / last_name | |
| patient_type | bedridden / general |
| address_text | |
| symptoms | |
| phone / note | ไม่บังคับ |
| lat / lng / map_url | ไม่บังคับ |
| created_at / updated_at | ISO string |
| deleted_at | ว่าง = ยังไม่ถูกลบ |

**Tab: Users**
| username | password | role (admin/staff) | is_active (TRUE/FALSE) |

**Tab: Settings**
| key | value |
|---|---|
| system_name | |
| municipality_lat | |
| municipality_lng | |

---

## 6. หน้าเว็บ (Static Files)

| ไฟล์ | หน้าจอ | สิทธิ์ |
|---|---|---|
| `login.html` | เข้าสู่ระบบ | ทุกคน |
| `index.html` | รายการ + ค้นหา | admin, staff |
| `patient-detail.html?id=` | รายละเอียด + ปุ่มนำทาง | admin, staff |
| `patient-form.html` | เพิ่ม/แก้ไข | admin |
| `trash.html` | ถังขยะ/กู้คืน | admin |
| `settings.html` | ตั้งค่า | admin |
| `help.html` | คู่มือ | admin, staff |

---

## 7. สิ่งที่ยังรอข้อมูลจากลูกค้า

- [ ] ชื่อระบบ (ไทย + อังกฤษ) + โลโก้
- [ ] พิกัดที่ตั้งเทศบาล
- [ ] อีเมล/บัญชี Google ที่จะใช้สร้าง Google Sheet + Apps Script (แนะนำให้ลูกค้าเป็นเจ้าของบัญชี ไม่ใช่บัญชีส่วนตัวผู้พัฒนา เผื่อส่งมอบงาน)
- [ ] รายชื่อผู้ใช้เริ่มต้น + ใครเป็น admin
- [ ] มีข้อมูลผู้ป่วยเดิมที่ต้องนำเข้าไหม
