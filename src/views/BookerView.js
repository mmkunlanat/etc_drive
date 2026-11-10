// BookerView.js - Main Booker Portal (หน้าของผู้จอง)
import {
  getTodayISODate,
  addDaysToDate,
  formatThaiDate,
  formatSubmissionTime,
  validateBookingAdvance,
  checkSubmissionTimeDeadline,
  DEPARTMENTS,
  getAllBookings,
  createBooking,
  updateBooking,
  deleteBooking,
  getQuickKeywords,
  addQuickKeyword,
  updateQuickKeyword,
  deleteQuickKeyword,
  resetQuickKeywords
} from '../store.js';
import { renderPaperModal } from '../components/PaperModal.js';

export function renderBookerView(container) {
  let activeSubTab = 'history'; // 'history' | 'form' (แสดงประวัติการจองของฉันก่อน)
  let showCalendarModal = false; // แสดงปฏิทินแบบป๊อบอัพเล็กๆ
  const todayIso = getTodayISODate();
  const defaultUsageIso = addDaysToDate(todayIso, 1); // Defaults to tomorrow (1 day advance)

  // Calendar navigation state
  const initDate = new Date();
  let calendarYear = initDate.getFullYear();
  let calendarMonth = initDate.getMonth(); // 0 - 11
  let selectedCalendarDate = todayIso;

  const THAI_MONTH_NAMES = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const THAI_DAY_OF_WEEK = [
    'วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'
  ];

  function getThaiDayOfWeek(isoDateStr) {
    if (!isoDateStr) return '';
    const parts = isoDateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return THAI_DAY_OF_WEEK[d.getDay()] || '';
    }
    return '';
  }

  function getCalendarGridCells(year, month) {
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells = [];
    const fmt = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    // Prev month padding
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevM = month === 0 ? 11 : month - 1;
      const prevY = month === 0 ? year - 1 : year;
      cells.push({
        day: d,
        isoDate: fmt(prevY, prevM, d),
        isCurrentMonth: false
      });
    }

    // Current month
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      cells.push({
        day: d,
        isoDate: fmt(year, month, d),
        isCurrentMonth: true
      });
    }

    // Next month padding to complete weeks
    const remainder = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remainder; d++) {
      const nextM = month === 11 ? 0 : month + 1;
      const nextY = month === 11 ? year + 1 : year;
      cells.push({
        day: d,
        isoDate: fmt(nextY, nextM, d),
        isCurrentMonth: false
      });
    }

    return cells;
  }

  let historyFilter = {
    preset: 'all', // 'all' | 'today' | 'this_week' | 'this_month' | 'custom'
    startDate: '',
    endDate: ''
  };

  function getWeekRange(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diffToMon = (day === 0 ? -6 : 1) - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diffToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return { start: fmt(mon), end: fmt(sun) };
  }

  function getMonthRange(dateStr) {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = d.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return { start: fmt(first), end: fmt(last) };
  }

  let currentBookingDate = todayIso;
  let currentUsageDate = defaultUsageIso;
  let currentBookerName = 'สมชาย รักบริการ';
  let currentBookerPhone = '081-999-1234';
  let currentDepartment = 'ฝ่ายขายและการตลาด';
  let currentStartTime = '08:30';
  let currentEndTime = '17:00';
  let currentNotes = 'ผู้โดยสาร 3 ท่าน ได้แก่ สมชาย, วรรณา, กิตติ มีกระเป๋าเอกสารและของที่ระลึก 2 ลัง';
  let editingBookingId = null;
  let itineraryRows = [
    { no: 1, detail: '', time: '', passengers: '', note: '', destination: '' }
  ];
  let lastFocusedInput = null;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function insertKeywordAtCursor(text) {
    if (!text) return;
    let target = lastFocusedInput;
    if (!target || !document.body.contains(target)) {
      target = container.querySelector('.row-detail') || container.querySelector('.row-destination') || document.getElementById('notes');
    }
    if (!target) return;

    target.focus();
    const start = typeof target.selectionStart === 'number' ? target.selectionStart : target.value.length;
    const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : start;
    const val = target.value;

    let insertText = text;
    if (start > 0 && val[start - 1] !== ' ' && !insertText.startsWith(' ')) {
      insertText = ' ' + insertText;
    }

    target.value = val.slice(0, start) + insertText + val.slice(end);
    const nextPos = start + insertText.length;
    if (typeof target.setSelectionRange === 'function') {
      target.setSelectionRange(nextPos, nextPos);
    }

    target.dispatchEvent(new Event('input', { bubbles: true }));

    target.classList.remove('input-keyword-highlight');
    void target.offsetWidth;
    target.classList.add('input-keyword-highlight');
    setTimeout(() => target.classList.remove('input-keyword-highlight'), 600);

    showToast(`แทรก "${text}" เรียบร้อย`);
  }

  function loadBookingIntoForm(b) {
    if (!b) return;
    editingBookingId = b.id;
    currentBookingDate = b.bookingDate || todayIso;
    currentUsageDate = b.usageDate || defaultUsageIso;
    currentBookerName = b.bookerName || '';
    currentBookerPhone = b.bookerPhone || '';
    currentDepartment = b.department || 'ฝ่ายขายและการตลาด';
    currentStartTime = b.startTime || '08:30';
    currentEndTime = b.endTime || '17:00';
    currentNotes = b.notes || '';

    itineraryRows = (b.itinerary && b.itinerary.length > 0)
      ? JSON.parse(JSON.stringify(b.itinerary)).map((r, i) => {
        let time = r.time || '';
        let passengers = r.passengers || '';
        if (!time && !passengers && r.note) {
          const p = parseNote(r.note);
          time = p.time;
          passengers = p.passengers;
        }
        return {
          no: i + 1,
          detail: r.detail || '',
          time,
          passengers,
          note: r.note || '',
          destination: r.destination || ''
        };
      })
      : [{ no: 1, detail: '', time: '', passengers: '', note: '', destination: '' }];

    activeSubTab = 'form';
    render();

    setTimeout(() => {
      const formElem = document.getElementById('vehicle-booking-form');
      if (formElem) {
        formElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);

    showToast(`เปิดคำขอ ${b.id} ในแบบฟอร์มเพื่อแก้ไขข้อมูล`);
  }

  if (window._bookerEditHandler) {
    window.removeEventListener('booker_load_edit', window._bookerEditHandler);
  }
  window._bookerEditHandler = (e) => {
    if (e.detail) {
      loadBookingIntoForm(e.detail);
    }
  };
  window.addEventListener('booker_load_edit', window._bookerEditHandler);

  function normalize24hTime(val) {
    if (!val || typeof val !== 'string') return '';
    let clean = val.trim().replace('.', ':');
    if (!clean) return '';

    // H:mm or HH:mm
    const matchColon = clean.match(/^(\d{1,2}):(\d{1,2})$/);
    if (matchColon) {
      let h = parseInt(matchColon[1], 10);
      let m = parseInt(matchColon[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }

    // 3 or 4 digits without colon (e.g. 830, 0830, 1430)
    const matchDigits = clean.match(/^(\d{1,2})(\d{2})$/);
    if (matchDigits) {
      let h = parseInt(matchDigits[1], 10);
      let m = parseInt(matchDigits[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }

    // Single or double digit hour (e.g. 8, 9, 14)
    const matchSingleH = clean.match(/^(\d{1,2})$/);
    if (matchSingleH) {
      let h = parseInt(matchSingleH[1], 10);
      if (h >= 0 && h <= 23) {
        return `${String(h).padStart(2, '0')}:00`;
      }
    }

    return clean;
  }

  function render24hDatalist() {
    const times = [];
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, '0');
      times.push(`${hh}:00`);
      times.push(`${hh}:30`);
    }
    return `
      <datalist id="time-list-24h">
        ${times.map(t => `<option value="${t}">${t} น.</option>`).join('')}
      </datalist>
    `;
  }

  function bind24hTimeInputs(scope) {
    const root = scope || container;
    root.querySelectorAll('.time-input-24h').forEach(input => {
      if (input.dataset.bound24h) return;
      input.dataset.bound24h = 'true';

      input.addEventListener('blur', () => {
        if (input.value) {
          const norm = normalize24hTime(input.value);
          input.value = norm;
          if (/^([01]\d|2[0-3]):[0-5]\d$/.test(norm)) {
            input.classList.remove('input-invalid');
          } else {
            input.classList.add('input-invalid');
          }
        } else {
          input.classList.remove('input-invalid');
        }
      });
    });
  }

  function parseNote(note) {
    if (!note || typeof note !== 'string') return { time: '', passengers: '' };
    let time = '';
    let passengers = '';
    const timeMatch = note.match(/(\d{1,2}:\d{2})/);
    if (timeMatch) time = normalize24hTime(timeMatch[1]);
    const passMatch = note.match(/(\d+)\s*คน/);
    if (passMatch) {
      passengers = passMatch[1];
    } else {
      const slashMatch = note.match(/\/\s*(\d+)/);
      if (slashMatch) passengers = slashMatch[1];
    }
    return { time, passengers };
  }

  function render() {
    const bookings = getAllBookings();
    const timeCheck = checkSubmissionTimeDeadline();

    container.innerHTML = `
      <div class="booker-portal-wrapper">
        
        <!-- Info & Rule Notification Banner -->
        <div class="info-notice-bar">
          <div class="notice-text">
            <span class="notice-badge">กฎระเบียบบริษัท</span>
            <span>ผู้จองต้องกรอกข้อมูลล่วงหน้าก่อนวันใช้งาน <strong>อย่างน้อย 1 วัน</strong> และส่งภายในเวลา <strong>15.00 น.</strong></span>
          </div>
          <div class="notice-time-status">
            <span> เวลาปัจจุบัน: ${timeCheck.currentTime}</span>
            <span style="color: ${timeCheck.isPast15 ? '#b45309' : '#059669'};">
              (${timeCheck.isPast15 ? 'เลย 15:00 น. แล้ว' : 'อยู่ในเกณฑ์เวลาปกติ'})
            </span>
          </div>
        </div>

        <!-- Subtabs: ปฏิทินการใช้รถขึ้นก่อน และปุ่ม + เพื่อกรอกใบขอใช้รถใหม่ -->
        <div class="booker-tabs-nav">
          <button id="tab-sub-history" class="booker-subtab-btn ${activeSubTab === 'history' ? 'active' : ''}">
            <span>ประวัติการจองของฉัน</span>
            <span style="font-size: 0.72rem; background: #2563eb; color: #fff; padding: 1px 7px; border-radius: 10px;">
              ${bookings.length}
            </span>
          </button>
          <button id="tab-sub-form" class="booker-subtab-btn btn-new-request ${activeSubTab === 'form' ? 'active' : ''}" title="กรอกใบขออนุมัติการใช้รถใหม่">
            <span>+</span>
          </button>
        </div>

        ${activeSubTab === 'history' ? renderHistorySection(bookings) : renderFormSection()}

      </div>
    `;

    attachEvents();
  }

  function renderFormSection() {
    const minUsageIso = addDaysToDate(currentBookingDate, 1);
    const validation = validateBookingAdvance(currentBookingDate, currentUsageDate);
    const keywords = getQuickKeywords();

    return `
      <div class="content-card">
        
        <div class="card-header-flex">
          <div class="card-title-group">
            <h2>
              <span>🚗</span>
              <span>ใบขออนุมัติการใช้รถ</span>
            </h2>
            <p>กรอกข้อมูลเพื่อส่งขออนุมัติใช้ยานพาหนะของบริษัท (ต้องล่วงหน้าอย่างน้อย 1 วัน)</p>
          </div>
          <div>
            <span class="official-form-badge">
              <span>แบบฟอร์ม</span>
            </span>
          </div>
        </div>

        <!-- Live Advance Booking Rule Card -->
        <div id="rule-banner" class="rule-check-banner ${validation.isValid ? 'valid' : 'invalid'}">
          <div class="rule-icon">${validation.isValid ? '✅' : '⚠️'}</div>
          <div class="rule-content">
            <div class="rule-title">
              <span>การตรวจสอบสิทธิ์การจองล่วงหน้า:</span>
              <span id="advance-days-tag" class="rule-tag">จองล่วงหน้า ${validation.diffDays} วัน</span>
            </div>
            <div class="rule-sub" id="rule-message-text">
              ${validation.message}
            </div>
          </div>
        </div>

        ${editingBookingId ? `
          <div class="editing-banner" style="background: #eff6ff; border: 1.5px solid #3b82f6; border-radius: 8px; padding: 12px 18px; margin-bottom: 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <div>
              <div style="font-weight: 700; color: #1e40af; font-size: 1rem;">กำลังแก้ไขคำขอ: ${editingBookingId}</div>
              <div style="font-size: 0.8rem; color: #475569; margin-top: 2px;">คุณสามารถปรับปรุงข้อมูล วัน เวลา และตารางภารกิจ แล้วกด "บันทึกการแก้ไขคำขอ" เพื่ออัปเดต</div>
            </div>
            <button type="button" id="btn-cancel-edit" class="btn-ghost-light" style="color: #dc2626; font-size: 0.85rem; font-weight: 600; padding: 5px 12px; border: 1px solid #fca5a5; border-radius: 6px; background: #fff; cursor: pointer;">
              ✕ ยกเลิกการแก้ไข
            </button>
          </div>
        ` : ''}

        <form id="vehicle-booking-form">
          
          <!-- Top Row: Booking Date & Booker Name -->
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" for="bookingDate">
                <span>📅 วันที่จอง</span>
                <span class="required">*</span>
              </label>
              <input 
                type="date" 
                id="bookingDate" 
                class="form-control" 
                value="${currentBookingDate}" 
                required 
              />
              <div id="bookingDate-thai-preview" style="font-size: 0.78rem; font-weight: 600; color: #1d4ed8; margin-top: 3px;">
                ${formatThaiDate(currentBookingDate).full}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="bookerName">
                <span>ชื่อ-นามสกุล ผู้ขอใช้รถ</span>
                <span class="required">*</span>
              </label>
              <input type="text" id="bookerName" class="form-control" placeholder="เช่น นายณัฐพล ทวีสุข" value="${escapeHtml(currentBookerName)}" required />
            </div>
          </div>

          <!-- Second Row: Department & Booker Phone -->
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" for="department">
                <span>ฝ่าย/แผนก</span>
                <span class="required">*</span>
              </label>
              <select id="department" class="form-control" required>
                <option value="">-- เลือกฝ่าย/แผนก --</option>
                ${DEPARTMENTS.map(d => `<option value="${d}" ${d === currentDepartment ? 'selected' : ''}>${d}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="bookerPhone">
                <span>เบอร์โทรศัพท์ติดต่อ</span>
                <span class="required">*</span>
              </label>
              <input type="tel" id="bookerPhone" class="form-control" placeholder="เช่น 081-234-5678" value="${escapeHtml(currentBookerPhone)}" required />
            </div>
          </div>

          <!-- Third Row: Usage Date & Time Range (ENFORCES 1-DAY ADVANCE) -->
          <div class="form-grid-3" style="background: #f1f5f9; padding: 1rem; border-radius: var(--radius-md); border: 1.5px dashed #cbd5e1;">
            
            <div class="form-group">
              <label class="form-label" for="usageDate">
                <span>📅 วันที่ใช้งาน</span>
                <span class="required">* (ล่วงหน้า 1 วัน)</span>
              </label>
              <input 
                type="date" 
                id="usageDate" 
                class="form-control" 
                min="${minUsageIso}" 
                value="${currentUsageDate}" 
                required 
              />
              <div id="usageDate-thai-preview" style="font-size: 0.78rem; font-weight: 600; color: #1d4ed8; margin-top: 3px;">
                ${formatThaiDate(currentUsageDate).full}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="startTime">
                <span> ตั้งแต่เวลา</span>
                <span class="required">*</span>
              </label>
              <div class="input-group">
                <input 
                  type="text" 
                  id="startTime" 
                  class="form-control time-input-24h" 
                  value="${escapeHtml(currentStartTime)}" 
                  placeholder="08:30" 
                  maxlength="5"
                  list="time-list-24h"
                  autocomplete="off"
                  required 
                />
                <span class="input-addon">น.</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="endTime">
                <span> ถึงเวลา</span>
                <span class="required">*</span>
              </label>
              <div class="input-group">
                <input 
                  type="text" 
                  id="endTime" 
                  class="form-control time-input-24h" 
                  value="${escapeHtml(currentEndTime)}" 
                  placeholder="17:00" 
                  maxlength="5"
                  list="time-list-24h"
                  autocomplete="off"
                  required 
                />
                <span class="input-addon">น.</span>
              </div>
            </div>

          </div>

          <!-- 24-Hour Time Datalist Preset -->
          ${render24hDatalist()}

          <!-- Itinerary Table (ตารางรายละเอียดการใช้รถ 1 - 6) -->
          <div class="itinerary-section">
            <div class="itinerary-header-bar">
              <h3>
                <span>ตารางรายละเอียดภารกิจและสถานที่ (ลำดับ 1 - 6)</span>
                <span class="required" style="font-size: 0.85rem; font-weight: 600; margin-left: 6px; color: #dc2626;">*</span>
              </h3>
              <div class="quick-keywords-group">
                <span class="quick-keywords-label">คีย์เวิร์ดด่วน:</span>
                <div id="quick-keywords-buttons" class="quick-keywords-buttons">
                  ${keywords.map(k => `
                    <button type="button" class="quick-keyword-btn" data-id="${k.id}" data-text="${escapeHtml(k.text)}" title="คลิกเพื่อแทรกลงในช่องที่เคอร์เซอร์อยู่">
                      ${escapeHtml(k.text)}
                    </button>
                  `).join('')}
                </div>
                <button type="button" id="btn-manage-keywords" class="quick-keyword-btn-manage" title="จัดการคีย์เวิร์ดด่วน">
                  ➕
                </button>
              </div>
            </div>

            <div class="table-responsive">
              <table class="form-table" id="itinerary-table">
                <thead>
                  <tr>
                    <th style="width: 55px; text-align: center;">ลำดับที่</th>
                    <th>รายละเอียด (ภารกิจ / สิ่งของ / วัตถุประสงค์) <span class="required" style="color: #dc2626;">*</span></th>
                    <th style="width: 145px; text-align: center;">เวลา</th>
                    <th style="width: 175px; text-align: center;">จำนวนคน</th>
                    <th style="width: 250px;">สถานที่ (ปลายทาง / จุดแวะ) <span class="required" style="color: #dc2626;">*</span></th>
                    <th style="width: 50px; text-align: center;">ลบ</th>
                  </tr>
                </thead>
                <tbody id="itinerary-tbody">
                  ${itineraryRows.map((row, idx) => renderRowHtml(row, idx)).join('')}
                </tbody>
              </table>
            </div>

            <div class="itinerary-actions-footer">
              <button type="button" id="btn-add-row" class="btn-secondary-sm">
                <span>+ เพิ่มแถวรายการใหม่</span>
              </button>
              <span style="font-size: 0.8rem; color: var(--slate-500);">
                * บังคับกรอกอย่างน้อย 1 รายการ และรองรับสูงสุด 6 รายการตรงตามแบบฟอร์ม
              </span>
            </div>
          </div>

          <!-- Notes / Passengers -->
          <div class="form-group" style="margin-bottom: 1.5rem;">
            <label class="form-label" for="notes">
              <span>หมายเหตุ (อื่นๆ/ผู้โดยสาร)</span>
              <span class="help-text">ระบุรายชื่อผู้เดินทางร่วม, เบอร์โทรฉุกเฉิน หรือสิ่งของที่ต้องบรรทุก</span>
            </label>
            <textarea 
              id="notes" 
              class="form-control" 
              rows="3" 
              placeholder="เช่น ผู้โดยสารร่วมเดินทาง 3 ท่าน (คุณสมชาย, คุณวรรณา, คุณกิตติ), มีสัมภาระกล่องตัวอย่างสินค้า 2 กล่อง"
            >${escapeHtml(currentNotes)}</textarea>
          </div>


          <!-- Actions Footer -->
          <div class="form-actions-bottom">
            <div style="display: flex; gap: 0.6rem; flex-wrap: wrap;">
              <button type="button" id="btn-preview-paper" class="btn-outline-blue">
                <span>👁️ ดูตัวอย่างแบบฟอร์มทางการ</span>
              </button>
              <button type="button" id="btn-reset-form" class="btn-secondary">
                <span>🔄 ล้างข้อมูล</span>
              </button>
            </div>

            <button type="submit" id="btn-submit-booking" class="btn-primary" style="padding: 10px 24px; font-size: 0.95rem;">
              <span>${editingBookingId ? '💾 บันทึกการแก้ไขคำขอ' : 'ส่งใบขออนุมัติการใช้รถ'}</span>
            </button>
          </div>

        </form>

      </div>
    `;
  }

  function renderRowHtml(row, idx) {
    let time = row.time || '';
    let passengers = row.passengers || '';
    if (!time && !passengers && row.note) {
      const parsed = parseNote(row.note);
      time = parsed.time;
      passengers = parsed.passengers;
    }

    return `
      <tr data-index="${idx}">
        <td class="table-row-num">${idx + 1}.)</td>
        <td>
          <input 
            type="text" 
            class="form-control row-detail" 
            placeholder="เช่น ไปพบลูกค้าเพื่อส่งมอบสัญญา" 
            value="${row.detail || ''}" 
            required 
          />
        </td>
        <td>
          <div class="input-group">
            <input 
              type="text" 
              class="form-control row-time time-input-24h" 
              value="${time}" 
              placeholder="09:00"
              maxlength="5"
              list="time-list-24h"
              autocomplete="off"
            />
            <span class="input-addon">น.</span>
          </div>
        </td>
        <td>
          <div class="stepper-group">
            <button type="button" class="btn-stepper btn-minus" title="ลดจำนวนคน">−</button>
            <input 
              type="text" 
              class="form-control row-passengers text-center" 
              placeholder="0" 
              value="${passengers}" 
            />
            <button type="button" class="btn-stepper btn-plus" title="เพิ่มจำนวนคน">+</button>
            <span class="input-addon">คน</span>
          </div>
        </td>
        <td>
          <input 
            type="text" 
            class="form-control row-destination" 
            placeholder="เช่น นิคมอุตสาหกรรมแหลมฉบัง" 
            value="${row.destination || ''}" 
            required 
          />
        </td>
        <td style="text-align: center;">
          ${itineraryRows.length > 1 ? `
            <button type="button" class="btn-icon-danger btn-delete-row" title="ลบรายการนี้" data-index="${idx}">
              <svg style="pointer-events: none;" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          ` : '-'}
        </td>
      </tr>
    `;
  }

  function renderHistorySection(bookings = []) {
    return `
      <div class="content-card">
        <div class="card-header-flex">
          <div class="card-title-group">
            <h2>
              <span></span>
              <span></span>
            </h2>
            <p>ติดตามตารางการใช้รถ ตรวจสอบสถานะคำขอ และพิมพ์แบบฟอร์ม</p>
          </div>
          <div class="history-top-actions">
            <button type="button" id="btn-open-cal-modal" class="btn-outline-blue" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 0.85rem; font-weight: 600;">
              <span>📅</span>
              <span></span>
            </button>
            <button id="btn-create-new-top" class="btn-primary" style="padding: 6px 14px; font-size: 0.85rem;">
              <span>+ กรอกใบขอใช้รถ</span>
            </button>
              
          </div>
        </div>

        ${renderTableView(bookings)}
      </div>

      ${showCalendarModal ? renderMiniCalendarModal(bookings) : ''}
    `;
  }

  function renderMiniCalendarModal(bookings = []) {
    const buddhistYear = calendarYear + 543;
    const monthTitle = `${THAI_MONTH_NAMES[calendarMonth]} ${buddhistYear}`;
    const gridCells = getCalendarGridCells(calendarYear, calendarMonth);

    // Map bookings by usageDate
    const bookingsByDate = {};
    bookings.forEach(b => {
      const d = b.usageDate || b.bookingDate;
      if (!d) return;
      if (!bookingsByDate[d]) bookingsByDate[d] = [];
      bookingsByDate[d].push(b);
    });

    const selectedDayBookings = bookingsByDate[selectedCalendarDate] || [];
    const selectedDayThai = formatThaiDate(selectedCalendarDate);
    const selectedDayOfWeek = getThaiDayOfWeek(selectedCalendarDate);

    return `
      <div id="mini-cal-modal-overlay" class="mini-cal-overlay">
        <div class="mini-cal-card" role="dialog" aria-modal="true" aria-labelledby="mini-cal-heading">
          
          <!-- Modal Header -->
          <div class="mini-cal-header">
            <div class="mini-cal-title">
              <span style="font-size: 1.25rem;">📅</span>
              <span id="mini-cal-heading" style="font-weight: 700; font-size: 1.05rem; color: var(--slate-800);">ปฏิทินการใช้รถ</span>
            </div>
            <button type="button" id="btn-close-cal-modal" class="mini-cal-close-btn" title="ปิดปฏิทิน">
              ✕
            </button>
          </div>

          <!-- Month & Year Controls -->
          <div class="mini-cal-toolbar">
            <button type="button" id="btn-mini-cal-prev" class="mini-cal-nav-btn" title="เดือนก่อนหน้า">◀</button>
            <div class="mini-cal-month-name">${monthTitle}</div>
            <button type="button" id="btn-mini-cal-next" class="mini-cal-nav-btn" title="เดือนถัดไป">▶</button>
            <button type="button" id="btn-mini-cal-today" class="mini-cal-today-pill" title="กลับมาวันนี้">วันนี้</button>
          </div>

          <!-- Weekdays Row -->
          <div class="mini-cal-weekdays">
            <div class="mini-cal-wday sun">อา.</div>
            <div class="mini-cal-wday">จ.</div>
            <div class="mini-cal-wday">อ.</div>
            <div class="mini-cal-wday">พ.</div>
            <div class="mini-cal-wday">พฤ.</div>
            <div class="mini-cal-wday">ศ.</div>
            <div class="mini-cal-wday sat">ส.</div>
          </div>

          <!-- Days Grid -->
          <div class="mini-cal-grid">
            ${gridCells.map(cell => {
      const isToday = cell.isoDate === todayIso;
      const isSelected = cell.isoDate === selectedCalendarDate;
      const dayBookings = bookingsByDate[cell.isoDate] || [];
      const count = dayBookings.length;

      const cellClasses = ['mini-cal-cell'];
      if (!cell.isCurrentMonth) cellClasses.push('other-month');
      if (isToday) cellClasses.push('is-today');
      if (isSelected) cellClasses.push('is-selected');
      if (count > 0) cellClasses.push('has-bookings');

      return `
                <div class="${cellClasses.join(' ')}" data-date="${cell.isoDate}">
                  <span class="mini-cal-day-num">${cell.day}</span>
                  ${count > 0 ? `
                    <div class="mini-cal-dots-bar">
                      ${dayBookings.slice(0, 3).map(b => `<span class="mini-dot dot-${b.status}"></span>`).join('')}
                      ${count > 3 ? `<span class="mini-dot-plus">+</span>` : ''}
                    </div>
                  ` : ''}
                </div>
              `;
    }).join('')}
          </div>

          <!-- Selected Day Summary Card -->
          <div class="mini-cal-selected-box">
            <div class="mini-cal-selected-header">
              <div class="mini-cal-selected-date-text">
                <strong>${selectedDayOfWeek ? selectedDayOfWeek + ' ' : ''}${selectedDayThai.short}</strong>
              </div>
              <span class="mini-cal-count-tag ${selectedDayBookings.length > 0 ? 'active' : ''}">
                ${selectedDayBookings.length > 0 ? `${selectedDayBookings.length} คิวรถ` : 'ว่าง'}
              </span>
            </div>

            <!-- List of bookings on selected date -->
            <div class="mini-cal-items-list">
              ${selectedDayBookings.length === 0 ? `
                <div class="mini-cal-empty-text">ไม่มีรายการขอใช้รถในวันนี้</div>
              ` : selectedDayBookings.map(b => {
      const firstDest = (b.itinerary && b.itinerary[0] && b.itinerary[0].destination) ? b.itinerary[0].destination : (b.bookerName || 'ขอใช้รถ');
      return `
                  <div class="mini-cal-booking-item">
                    <div class="mini-item-left">
                      <span class="mini-item-status-dot dot-${b.status}"></span>
                      <div class="mini-item-info">
                        <div class="mini-item-title">${firstDest} (${b.id})</div>
                        <div class="mini-item-sub"> ใช้รถ ${b.startTime} น. • ส่งฟอร์ม ${formatSubmissionTime(b)} • ${b.bookerName}</div>
                      </div>
                    </div>
                    <button type="button" class="mini-item-view-btn btn-view-paper" data-id="${b.id}" title="ดูใบคำขอ">
                      📄 ดู
                    </button>
                  </div>
                `;
    }).join('')}
            </div>

            <!-- Actions for selected day -->
            <div class="mini-cal-actions-row">
              <button type="button" id="btn-mini-filter-day" class="mini-btn-filter" data-date="${selectedCalendarDate}">
                🔍 กรองตารางตามวันนี้
              </button>
              <button type="button" class="mini-btn-book btn-book-for-date" data-date="${selectedCalendarDate}">
                + ขอใช้รถในวันนี้
              </button>
            </div>
          </div>

          <!-- Modal Footer -->
          <div class="mini-cal-footer">
            <div class="mini-cal-legend-row">
              <span><span class="mini-dot dot-dispatched"></span> จัดรถแล้ว</span>
              <span><span class="mini-dot dot-approved"></span> อนุมัติ</span>
              <span><span class="mini-dot dot-pending_approval"></span> รออนุมัติ</span>
            </div>
            <button type="button" id="btn-close-cal-footer" class="btn-secondary-sm" style="padding: 4px 12px; font-size: 0.8rem;">
              ปิด
            </button>
          </div>

        </div>
      </div>
    `;
  }

  function renderTableView(bookings = []) {
    let filteredBookings = bookings;
    if (historyFilter.startDate || historyFilter.endDate) {
      filteredBookings = bookings.filter(b => {
        const date = b.usageDate || b.bookingDate;
        if (!date) return true;
        if (historyFilter.startDate && date < historyFilter.startDate) return false;
        if (historyFilter.endDate && date > historyFilter.endDate) return false;
        return true;
      });
    }

    const isFiltered = Boolean(historyFilter.startDate || historyFilter.endDate || historyFilter.preset !== 'all');

    return `
      ${isFiltered ? `
        <div class="filter-summary-row" style="margin-bottom: 0.85rem; font-size: 0.85rem; color: var(--slate-600); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; background: #eff6ff; border: 1px solid #bfdbfe; padding: 6px 12px; border-radius: var(--radius-sm);">
          <div>
            <span>กำลังแสดงเฉพาะ: <strong>${filteredBookings.length}</strong> จากทั้งหมด ${bookings.length} รายการ</span>
            ${(historyFilter.startDate && historyFilter.startDate === historyFilter.endDate) ? `
              <span style="margin-left: 6px; font-weight: 600; color: #1e40af;">
                (วันที่ ${formatThaiDate(historyFilter.startDate).short})
              </span>
            ` : ''}
          </div>
          <button type="button" id="btn-reset-filter-text" class="btn-clear-filter" style="font-size: 0.78rem; padding: 2px 8px;">
            ✕ แสดงทั้งหมด
          </button>
        </div>
      ` : ''}

      <div class="table-responsive">
        <table class="bookings-list-table">
          <thead>
            <tr>
              <th>รหัสคำขอ</th>
              <th>วันที่ใช้งาน & เวลา</th>
              <th>ฝ่าย/แผนก & ผู้ขอ</th>
              <th>รถที่ขอ / จัดสรร</th>
              <th>ปลายทางหลัก</th>
              <th>สถานะคำขอ</th>
              <th style="text-align: center;">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${filteredBookings.length === 0 ? `
              <tr>
                <td colspan="7" style="text-align: center; padding: 3rem 1rem;">
                  <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">📅</div>
                  <div style="font-weight: 600; font-size: 1.05rem; color: var(--slate-700); margin-bottom: 4px;">
                    ไม่พบประวัติการขอใช้รถในช่วงวันที่เลือก
                  </div>
                  <p style="font-size: 0.85rem; color: var(--slate-400); margin-bottom: 1rem;">
                    ลองเปลี่ยนช่วงวันที่ หรือคลิกปุ่มด้านล่างเพื่อแสดงรายการทั้งหมด
                  </p>
                  <button type="button" id="btn-reset-filter-inline" class="btn-secondary-sm" style="padding: 6px 14px;">
                    🔄 แสดงประวัติทั้งหมด
                  </button>
                </td>
              </tr>
            ` : filteredBookings.map(b => {
      const usageThai = formatThaiDate(b.usageDate);
      const firstDest = (b.itinerary && b.itinerary[0] && b.itinerary[0].destination) ? b.itinerary[0].destination : '-';
      return `
                <tr>
                  <td>
                    <strong style="color: #1e40af; font-size: 0.95rem;">${b.id}</strong>
                    <div style="font-size: 0.74rem; color: #475569; margin-top: 3px; display: flex; align-items: center; gap: 3px; white-space: nowrap;">
                      <span style="color: #0284c7; font-size: 0.78rem;"></span>
                      <span>ส่งฟอร์ม: <strong>${formatSubmissionTime(b)}</strong></span>
                    </div>
                    <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 1px;">
                      ยื่นเมื่อ ${formatThaiDate(b.bookingDate).short}
                    </div>
                  </td>
                  <td>
                    <div><strong>${usageThai.short}</strong></div>
                    <div style="font-size: 0.78rem; color: var(--slate-500);">${b.startTime} - ${b.endTime} น.</div>
                  </td>
                  <td>
                    <div>${b.bookerName}</div>
                    <div style="font-size: 0.75rem; color: var(--slate-400);">${b.department}</div>
                  </td>
                  <td>
                    <div style="max-width: 180px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                      ${b.assignedVehicle || b.requestedVehicle || '-'}
                    </div>
                    ${b.assignedDriver ? `
                      <div style="font-size: 0.75rem; color: #059669;">
                        🚗 ${b.assignedDriver}
                      </div>
                    ` : ''}
                  </td>
                  <td>
                    <div style="max-width: 180px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                      📍 ${firstDest}
                    </div>
                    ${b.itinerary && b.itinerary.length > 1 ? `
                      <div style="font-size: 0.72rem; color: var(--slate-400);">(รวม ${b.itinerary.length} จุดหมาย)</div>
                    ` : ''}
                  </td>
                  <td>
                    <span class="status-badge ${b.status}">
                      ${getStatusDot(b.status)}
                      ${b.statusLabel || b.status}
                    </span>
                  </td>
                  <td style="text-align: center;">
                    <div style="display: flex; gap: 5px; justify-content: center;">
                      <button class="btn-outline-blue btn-view-paper" data-id="${b.id}" style="padding: 4px 8px; font-size: 0.78rem;" title="ดูใบขออนุมัติทางการ">
                        📄 ดูใบคำขอ
                      </button>
                      ${b.status === 'pending_approval' ? `
                        <button class="btn-icon-danger btn-cancel-booking" data-id="${b.id}" style="width: 28px; height: 28px;" title="ยกเลิกคำขอ">
                          ✕
                        </button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function getStatusDot(status) {
    switch (status) {
      case 'pending_approval': return '🟡';
      case 'approved': return '🔵';
      case 'dispatched': return '🟢';
      case 'completed': return '🏁';
      case 'rejected': return '🔴';
      default: return '⚪';
    }
  }

  function attachEvents() {
    // Sub-tab switching
    const formTabBtn = document.getElementById('tab-sub-form');
    const histTabBtn = document.getElementById('tab-sub-history');
    const goToFormBtn = document.getElementById('btn-go-to-form');
    const createNewTopBtn = document.getElementById('btn-create-new-top');

    if (formTabBtn) formTabBtn.addEventListener('click', () => { activeSubTab = 'form'; render(); });
    if (histTabBtn) histTabBtn.addEventListener('click', () => { activeSubTab = 'history'; render(); });
    if (goToFormBtn) goToFormBtn.addEventListener('click', () => { activeSubTab = 'form'; render(); });
    if (createNewTopBtn) createNewTopBtn.addEventListener('click', () => { activeSubTab = 'form'; render(); });

    // Open Calendar Pop-up Modal
    const btnOpenCalModal = document.getElementById('btn-open-cal-modal');
    if (btnOpenCalModal) {
      btnOpenCalModal.addEventListener('click', () => {
        showCalendarModal = true;
        render();
      });
    }

    // Mini Calendar Pop-up Controls (when modal is open)
    if (showCalendarModal) {
      const btnCloseCalModal = document.getElementById('btn-close-cal-modal');
      const btnCloseCalFooter = document.getElementById('btn-close-cal-footer');
      const miniCalOverlay = document.getElementById('mini-cal-modal-overlay');

      const closeModal = () => {
        showCalendarModal = false;
        render();
      };

      if (btnCloseCalModal) btnCloseCalModal.addEventListener('click', closeModal);
      if (btnCloseCalFooter) btnCloseCalFooter.addEventListener('click', closeModal);
      if (miniCalOverlay) {
        miniCalOverlay.addEventListener('click', (e) => {
          if (e.target === miniCalOverlay) closeModal();
        });
      }

      const onEscKey = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onEscKey);
          closeModal();
        }
      };
      document.addEventListener('keydown', onEscKey, { once: true });

      // Mini Month Nav
      const btnMiniPrev = document.getElementById('btn-mini-cal-prev');
      const btnMiniNext = document.getElementById('btn-mini-cal-next');
      const btnMiniToday = document.getElementById('btn-mini-cal-today');

      if (btnMiniPrev) {
        btnMiniPrev.addEventListener('click', () => {
          calendarMonth--;
          if (calendarMonth < 0) {
            calendarMonth = 11;
            calendarYear--;
          }
          render();
        });
      }

      if (btnMiniNext) {
        btnMiniNext.addEventListener('click', () => {
          calendarMonth++;
          if (calendarMonth > 11) {
            calendarMonth = 0;
            calendarYear++;
          }
          render();
        });
      }

      if (btnMiniToday) {
        btnMiniToday.addEventListener('click', () => {
          const now = new Date();
          calendarYear = now.getFullYear();
          calendarMonth = now.getMonth();
          selectedCalendarDate = todayIso;
          render();
        });
      }

      // Mini Day Cell Selection
      container.querySelectorAll('.mini-cal-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          const date = cell.getAttribute('data-date');
          if (date) {
            selectedCalendarDate = date;
            render();
          }
        });
      });

      // Filter main table by selected day
      const btnMiniFilterDay = document.getElementById('btn-mini-filter-day');
      if (btnMiniFilterDay) {
        btnMiniFilterDay.addEventListener('click', () => {
          const d = btnMiniFilterDay.getAttribute('data-date');
          if (d) {
            historyFilter.startDate = d;
            historyFilter.endDate = d;
            historyFilter.preset = 'custom';
          }
          showCalendarModal = false;
          render();
        });
      }
    }

    // Quick book for selected date button (works in popup and inline)
    container.querySelectorAll('.btn-book-for-date').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const date = btn.getAttribute('data-date');
        if (date) {
          currentUsageDate = date;
        }
        showCalendarModal = false;
        activeSubTab = 'form';
        render();
      });
    });

    // Reset filter text button
    const btnResetFilterText = document.getElementById('btn-reset-filter-text');
    if (btnResetFilterText) {
      btnResetFilterText.addEventListener('click', () => {
        historyFilter = { preset: 'all', startDate: '', endDate: '' };
        render();
      });
    }

    // History actions
    container.querySelectorAll('.btn-view-paper').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const b = getAllBookings().find(x => x.id === id);
        if (b) {
          renderPaperModal(b, {
            onEdit: (booking) => {
              loadBookingIntoForm(booking);
            },
            onConfirm: (booking) => {
              showToast(`ยืนยันการตรวจสอบคำขอ ${booking.id} เรียบร้อยแล้ว`);
            }
          });
        }
      });
    });

    container.querySelectorAll('.btn-cancel-booking').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (confirm(`คุณต้องการยกเลิกคำขอ ${id} ใช่หรือไม่?`)) {
          deleteBooking(id);
          showToast(`ยกเลิกคำขอ ${id} สำเร็จแล้ว`);
          render();
        }
      });
    });

    if (activeSubTab !== 'form') return;

    // Track cursor/focus in form inputs for keyword insertion
    const trackInputFocus = (el) => {
      if (!el) return;
      ['focus', 'click', 'keyup'].forEach(ev => {
        el.addEventListener(ev, () => {
          if (el.type !== 'button' && el.type !== 'submit' && el.type !== 'date') {
            lastFocusedInput = el;
          }
        });
      });
    };
    container.querySelectorAll('input, textarea').forEach(trackInputFocus);

    // Keep form fields synced to state
    const bNameInput = document.getElementById('bookerName');
    if (bNameInput) bNameInput.addEventListener('input', (e) => { currentBookerName = e.target.value; });
    const bPhoneInput = document.getElementById('bookerPhone');
    if (bPhoneInput) bPhoneInput.addEventListener('input', (e) => { currentBookerPhone = e.target.value; });
    const deptInput = document.getElementById('department');
    if (deptInput) deptInput.addEventListener('change', (e) => { currentDepartment = e.target.value; });
    const sTimeInput = document.getElementById('startTime');
    if (sTimeInput) sTimeInput.addEventListener('input', (e) => { currentStartTime = e.target.value; });
    const eTimeInput = document.getElementById('endTime');
    if (eTimeInput) eTimeInput.addEventListener('input', (e) => { currentEndTime = e.target.value; });
    const notesInput = document.getElementById('notes');
    if (notesInput) notesInput.addEventListener('input', (e) => { currentNotes = e.target.value; });

    // Cancel edit button
    const cancelEditBtn = document.getElementById('btn-cancel-edit');
    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', () => {
        editingBookingId = null;
        currentBookingDate = todayIso;
        currentUsageDate = defaultUsageIso;
        currentBookerName = 'สมชาย รักบริการ';
        currentBookerPhone = '081-999-1234';
        currentDepartment = 'ฝ่ายขายและการตลาด';
        currentStartTime = '08:30';
        currentEndTime = '17:00';
        currentNotes = '';
        itineraryRows = [
          { no: 1, detail: '', time: '', passengers: '', note: '', destination: '' }
        ];
        render();
        showToast('ยกเลิกการแก้ไขแล้ว คืนค่าแบบฟอร์ม');
      });
    }

    // Advance Booking Validation on Usage Date & Booking Date Change
    const usageDateInput = document.getElementById('usageDate');
    const bookingDateInput = document.getElementById('bookingDate');
    const ruleBanner = document.getElementById('rule-banner');
    const advanceDaysTag = document.getElementById('advance-days-tag');
    const ruleMsgText = document.getElementById('rule-message-text');
    const previewThai = document.getElementById('usageDate-thai-preview');
    const bookingThaiPreview = document.getElementById('bookingDate-thai-preview');
    const submitBtn = document.getElementById('btn-submit-booking');

    const updateValidation = () => {
      const bDate = (bookingDateInput && bookingDateInput.value) || currentBookingDate;
      const uDate = (usageDateInput && usageDateInput.value) || currentUsageDate;
      const val = validateBookingAdvance(bDate, uDate);

      if (bookingThaiPreview && bDate) {
        bookingThaiPreview.textContent = formatThaiDate(bDate).full;
      }
      if (previewThai && uDate) {
        previewThai.textContent = formatThaiDate(uDate).full;
      }

      if (val.isValid) {
        ruleBanner.className = 'rule-check-banner valid';
        ruleBanner.querySelector('.rule-icon').textContent = '✅';
        advanceDaysTag.textContent = `จองล่วงหน้า ${val.diffDays} วัน`;
        ruleMsgText.textContent = val.message;
        if (usageDateInput) {
          usageDateInput.classList.remove('input-invalid');
          usageDateInput.classList.add('input-valid');
        }
        if (submitBtn) submitBtn.disabled = false;
      } else {
        ruleBanner.className = 'rule-check-banner invalid';
        ruleBanner.querySelector('.rule-icon').textContent = '⚠️';
        advanceDaysTag.textContent = val.diffDays <= 0 ? 'ผิดเงื่อนไข' : `ล่วงหน้า ${val.diffDays} วัน`;
        ruleMsgText.textContent = val.message;
        if (usageDateInput) {
          usageDateInput.classList.remove('input-valid');
          usageDateInput.classList.add('input-invalid');
        }
        if (submitBtn) submitBtn.disabled = !editingBookingId;
      }
    };

    if (bookingDateInput) {
      const onBookingDateChange = () => {
        currentBookingDate = bookingDateInput.value;
        if (usageDateInput && currentBookingDate) {
          usageDateInput.min = addDaysToDate(currentBookingDate, 1);
        }
        updateValidation();
      };
      bookingDateInput.addEventListener('change', onBookingDateChange);
      bookingDateInput.addEventListener('input', onBookingDateChange);
    }

    if (usageDateInput) {
      const onUsageDateChange = () => {
        currentUsageDate = usageDateInput.value;
        updateValidation();
      };
      usageDateInput.addEventListener('change', onUsageDateChange);
      usageDateInput.addEventListener('input', onUsageDateChange);
    }

    // Row addition & deletion
    const addRowBtn = document.getElementById('btn-add-row');
    if (addRowBtn) {
      addRowBtn.addEventListener('click', () => {
        if (itineraryRows.length >= 6) {
          alert('แบบฟอร์มกำหนดรายการไว้สูงสุด 6 แถว หากมีจุดหมายมากกว่านี้ กรุณาระบุในช่องหมายเหตุ');
          return;
        }
        collectCurrentRows();
        itineraryRows.push({ no: itineraryRows.length + 1, detail: '', time: '', passengers: '', note: '', destination: '' });
        renderTableBody();
      });
    }

    // Attach delete row & real-time input validation
    function attachRowEvents() {
      container.querySelectorAll('.btn-delete-row').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          collectCurrentRows();
          itineraryRows.splice(idx, 1);
          renderTableBody();
        });
      });

      // Clear input-invalid on typing
      container.querySelectorAll('.row-detail, .row-destination').forEach(inp => {
        inp.addEventListener('input', () => {
          if (inp.value.trim()) {
            inp.classList.remove('input-invalid');
            inp.classList.add('input-valid');
          } else {
            inp.classList.remove('input-valid');
          }
        });
      });
      // Stepper buttons for passengers (+ / -)
      container.querySelectorAll('.btn-minus').forEach(btn => {
        btn.addEventListener('click', () => {
          const group = btn.closest('.stepper-group');
          const input = group?.querySelector('.row-passengers');
          if (input) {
            let val = parseInt(input.value.trim(), 10);
            if (isNaN(val) || val <= 1) val = 1;
            else val = val - 1;
            input.value = val;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      });

      container.querySelectorAll('.btn-plus').forEach(btn => {
        btn.addEventListener('click', () => {
          const group = btn.closest('.stepper-group');
          const input = group?.querySelector('.row-passengers');
          if (input) {
            let val = parseInt(input.value.trim(), 10);
            if (isNaN(val) || val < 0) val = 0;
            input.value = val + 1;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      });

      // Bind 24-hour time formatting & validation
      bind24hTimeInputs(container);

      // Track cursor in row inputs
      container.querySelectorAll('.row-detail, .row-destination, .row-time, .row-passengers').forEach(trackInputFocus);
    }
    attachRowEvents();

    function collectCurrentRows() {
      const rows = [];
      const trs = container.querySelectorAll('#itinerary-tbody tr');
      trs.forEach((tr, i) => {
        const detailInput = tr.querySelector('.row-detail');
        const timeInput = tr.querySelector('.row-time');
        const passInput = tr.querySelector('.row-passengers');
        const destInput = tr.querySelector('.row-destination');

        const detail = detailInput ? detailInput.value : '';
        const time = timeInput ? normalize24hTime(timeInput.value) : '';
        const passengers = passInput ? passInput.value : '';
        const destination = destInput ? destInput.value : '';

        const noteParts = [];
        if (time) noteParts.push(`${time} น.`);
        if (passengers) noteParts.push(`${passengers} คน`);
        const note = noteParts.join(' / ');

        rows.push({ no: i + 1, detail, time, passengers, note, destination });
      });
      itineraryRows = rows;
    }

    function renderTableBody() {
      const tbody = document.getElementById('itinerary-tbody');
      if (tbody) {
        tbody.innerHTML = itineraryRows.map((r, i) => renderRowHtml(r, i)).join('');
        attachRowEvents();
      }
    }

    // Quick keyword handlers & dynamic buttons
    function renderQuickKeywordButtons() {
      const group = container.querySelector('#quick-keywords-buttons');
      if (!group) return;
      const keywords = getQuickKeywords();
      if (keywords.length === 0) {
        group.innerHTML = `<span style="font-size: 0.75rem; color: rgba(255,255,255,0.7); font-style: italic;">(ไม่มีคีย์เวิร์ด)</span>`;
        return;
      }
      group.innerHTML = keywords.map(k => `
        <button type="button" class="quick-keyword-btn" data-id="${k.id}" data-text="${escapeHtml(k.text)}" title="คลิกเพื่อแทรกลงในช่องที่เคอร์เซอร์อยู่">
          ${escapeHtml(k.text)}
        </button>
      `).join('');

      group.querySelectorAll('.quick-keyword-btn').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault(); // Keep focus and cursor in the target input!
        });
        btn.addEventListener('click', () => {
          const text = btn.getAttribute('data-text');
          insertKeywordAtCursor(text);
        });
      });
    }

    renderQuickKeywordButtons();

    window.addEventListener('quick_keywords_updated', () => {
      renderQuickKeywordButtons();
    });

    // Manage keywords button
    const manageKwBtn = document.getElementById('btn-manage-keywords');
    if (manageKwBtn) {
      manageKwBtn.addEventListener('click', () => {
        openKeywordManagerModal();
      });
    }

    // Preview paper modal
    const previewBtn = document.getElementById('btn-preview-paper');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => {
        collectCurrentRows();
        const hasValid = itineraryRows.some(r => r.detail.trim() && r.destination.trim());
        if (!hasValid) {
          const firstDetail = container.querySelector('.row-detail');
          const firstDest = container.querySelector('.row-destination');
          if (firstDetail && !firstDetail.value.trim()) firstDetail.classList.add('input-invalid');
          if (firstDest && !firstDest.value.trim()) firstDest.classList.add('input-invalid');
          alert('กรุณากรอกตารางรายละเอียดภารกิจและสถานที่ (ลำดับ 1 - 6) อย่างน้อย 1 รายการ ให้ครบถ้วน');
          if (firstDetail) firstDetail.focus();
          return;
        }
        const currentData = getFormData();
        renderPaperModal(currentData, {
          onEdit: () => {
            // Stay on form to edit
          },
          onConfirm: () => {
            const form = document.getElementById('vehicle-booking-form');
            if (form) {
              form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
            }
          }
        });
      });
    }

    // Reset Form
    const resetBtn = document.getElementById('btn-reset-form');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('คุณต้องการล้างข้อมูลในฟอร์มใช่หรือไม่?')) {
          editingBookingId = null;
          currentBookingDate = todayIso;
          currentUsageDate = defaultUsageIso;
          currentBookerName = 'สมชาย รักบริการ';
          currentBookerPhone = '081-999-1234';
          currentDepartment = 'ฝ่ายขายและการตลาด';
          currentStartTime = '08:30';
          currentEndTime = '17:00';
          currentNotes = '';
          itineraryRows = [
            { no: 1, detail: '', time: '', passengers: '', note: '', destination: '' }
          ];
          render();
        }
      });
    }

    // Submit Booking
    const form = document.getElementById('vehicle-booking-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        collectCurrentRows();

        const bDate = (bookingDateInput && bookingDateInput.value) || currentBookingDate;
        const uDate = (usageDateInput && usageDateInput.value) || currentUsageDate;
        const val = validateBookingAdvance(bDate, uDate);

        if (!val.isValid) {
          alert(`ไม่สามารถส่งคำขอได้!\n\n${val.message}\n\nกรุณาเลือกวันใช้งานล่วงหน้าอย่างน้อย 1 วัน`);
          usageDateInput.focus();
          return;
        }

        // Validate itinerary
        if (itineraryRows.length === 0) {
          alert('กรุณากรอกตารางรายละเอียดภารกิจและสถานที่ (ลำดับ 1 - 6) อย่างน้อย 1 รายการ');
          return;
        }

        let firstInvalidInput = null;
        let hasIncompleteRow = false;
        const trs = container.querySelectorAll('#itinerary-tbody tr');
        trs.forEach((tr, i) => {
          const detailInput = tr.querySelector('.row-detail');
          const destInput = tr.querySelector('.row-destination');
          const detailVal = detailInput ? detailInput.value.trim() : '';
          const destVal = destInput ? destInput.value.trim() : '';

          if (detailInput) detailInput.classList.remove('input-invalid');
          if (destInput) destInput.classList.remove('input-invalid');

          if (!detailVal) {
            if (detailInput) detailInput.classList.add('input-invalid');
            if (!firstInvalidInput) firstInvalidInput = detailInput;
            hasIncompleteRow = true;
          }
          if (!destVal) {
            if (destInput) destInput.classList.add('input-invalid');
            if (!firstInvalidInput) firstInvalidInput = destInput;
            hasIncompleteRow = true;
          }
        });

        if (hasIncompleteRow) {
          alert('กรุณากรอกข้อมูลในตารางรายละเอียดภารกิจและสถานที่ (ลำดับ 1 - 6) ให้ครบถ้วน\n(ต้องระบุทั้ง "รายละเอียดภารกิจ" และ "สถานที่ปลายทาง" ในทุกแถว)');
          if (firstInvalidInput) firstInvalidInput.focus();
          return;
        }

        const validRows = itineraryRows.filter(r => r.detail.trim() && r.destination.trim());
        if (validRows.length === 0) {
          alert('กรุณากรอกรายละเอียดภารกิจและสถานที่ปลายทางในตารางอย่างน้อย 1 รายการ');
          const firstDetail = container.querySelector('.row-detail');
          if (firstDetail) firstDetail.focus();
          return;
        }

        // Validate 24-hour time format for startTime and endTime
        const startTimeInput = document.getElementById('startTime');
        const endTimeInput = document.getElementById('endTime');
        const sTime = normalize24hTime(startTimeInput ? startTimeInput.value : '');
        const eTime = normalize24hTime(endTimeInput ? endTimeInput.value : '');

        const isValidTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
        if (!isValidTime(sTime)) {
          alert('กรุณาระบุ "ตั้งแต่เวลา" ให้ถูกต้องในรูปแบบ 24 ชั่วโมง เช่น 08:30 หรือ 13:00 (00:00 - 23:59)');
          if (startTimeInput) startTimeInput.focus();
          return;
        }
        if (!isValidTime(eTime)) {
          alert('กรุณาระบุ "ถึงเวลา" ให้ถูกต้องในรูปแบบ 24 ชั่วโมง เช่น 17:00 หรือ 18:30 (00:00 - 23:59)');
          if (endTimeInput) endTimeInput.focus();
          return;
        }

        const data = getFormData();
        data.startTime = sTime;
        data.endTime = eTime;
        data.itinerary = validRows;

        let resultBooking = null;
        if (editingBookingId) {
          updateBooking(editingBookingId, data);
          showToast(`บันทึกการแก้ไขคำขอ ${editingBookingId} สำเร็จแล้ว!`);
          resultBooking = getAllBookings().find(x => x.id === editingBookingId);
          editingBookingId = null;
        } else {
          resultBooking = createBooking(data);
          showToast(`ส่งใบขออนุมัติการใช้รถรหัส ${resultBooking.id} เรียบร้อยแล้ว!`);
        }

        // Switch to history tab to view
        activeSubTab = 'history';
        render();

        // Also pop up official form preview
        if (resultBooking) {
          renderPaperModal(resultBooking, {
            onEdit: (booking) => {
              loadBookingIntoForm(booking);
            },
            onConfirm: () => {
              showToast(`ยืนยันคำขอ ${resultBooking.id} เรียบร้อยแล้ว`);
            }
          });
        }
      });
    }
  }

  function openKeywordManagerModal() {
    const modalId = 'keyword-manager-modal-backdrop';
    const existing = document.getElementById(modalId);
    if (existing) {
      if (typeof existing.remove === 'function') existing.remove();
      else if (existing.parentNode) existing.parentNode.removeChild(existing);
    }

    function buildKeywordListHtml() {
      const keywords = getQuickKeywords();
      if (keywords.length === 0) {
        return `
          <div style="text-align: center; padding: 2rem 1rem; color: var(--slate-500);">
            <p style="font-weight: 600; font-size: 0.95rem; color: #334155; margin-bottom: 0.25rem;">ยังไม่มีคีย์เวิร์ดในระบบ</p>
            <p style="font-size: 0.8rem; margin-bottom: 1rem; color: #64748b;">พิมพ์ข้อความด้านบนเพื่อเพิ่มคีย์เวิร์ด หรือกดคืนค่าเริ่มต้น</p>
          </div>
        `;
      }
      return keywords.map(k => `
        <div class="keyword-list-item" data-id="${k.id}">
          <div class="keyword-text-badge">
            <span class="kw-text-display">${escapeHtml(k.text)}</span>
            <input type="text" class="form-control kw-edit-input" style="display: none; padding: 4px 8px; font-size: 0.88rem; flex: 1;" value="${escapeHtml(k.text)}" />
          </div>
          <div class="keyword-item-actions">
           
            <button type="button" class="btn-secondary btn-edit-kw" data-id="${k.id}" style="padding: 4px 10px; font-size: 0.8rem;" title="แก้ไขคีย์เวิร์ด">
              แก้ไข
            </button>
            <button type="button" class="btn-primary btn-save-edit-kw" data-id="${k.id}" style="display: none; padding: 4px 10px; font-size: 0.8rem; background: #059669;" title="บันทึกการแก้ไข">
              บันทึก
            </button>
            <button type="button" class="btn-secondary btn-cancel-edit-kw" data-id="${k.id}" style="display: none; padding: 4px 8px; font-size: 0.8rem;" title="ยกเลิก">
              ✕
            </button>
            <button type="button" class="btn-icon-danger btn-delete-kw" data-id="${k.id}" style="width: 28px; height: 28px;" title="ลบคีย์เวิร์ด">
              <svg style="pointer-events: none;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `).join('');
    }

    const modalHtml = `
      <div id="${modalId}" class="paper-modal-backdrop">
        <div class="paper-modal-dialog" style="max-width: 580px;">
          <div class="paper-modal-header" style="background: linear-gradient(135deg, #1e3a8a, #2563eb);">
            <div>
              <strong style="font-size: 0.95rem; color: #fff;">จัดการคีย์เวิร์ดด่วน (Quick Keywords)</strong>
              <div style="font-size: 0.75rem; color: #bfdbfe;">เพิ่ม แก้ไข หรือลบคีย์เวิร์ดสำหรับแทรกลงในช่องข้อความ</div>
            </div>
            <button id="btn-close-kw-modal" class="btn-ghost-light">✕</button>
          </div>
          <div class="paper-modal-body" style="background: #fff; padding: 1.25rem;">
            
            <!-- Quick Add Bar -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-md); padding: 10px 12px; margin-bottom: 1rem;">
              <div style="font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 6px;">
                เพิ่มคีย์เวิร์ดใหม่
              </div>
              <div style="display: flex; gap: 6px;">
                <input 
                  type="text" 
                  id="kw-new-input" 
                  class="form-control" 
                  placeholder="พิมพ์คีย์เวิร์ด เช่น เดินทางไปตรวจรับมอบงาน..." 
                  style="font-size: 0.85rem;" 
                />
                <button type="button" id="btn-add-new-kw" class="btn-primary" style="white-space: nowrap; padding: 6px 14px; font-size: 0.85rem;">
                  + เพิ่ม
                </button>
              </div>
            </div>

            <!-- List Header with Reset Button -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 8px;">
              <div style="font-size: 0.85rem; font-weight: 600; color: var(--slate-700);">
                รายการคีย์เวิร์ดที่พร้อมใช้งาน
              </div>
              <button type="button" id="btn-reset-default-kws" class="btn-secondary" style="padding: 4px 10px; font-size: 0.78rem;" title="คืนค่าเป็น 10 คีย์เวิร์ดมาตรฐาน">
                คืนค่าเริ่มต้น
              </button>
            </div>

            <!-- List Container -->
            <div id="kw-modal-list-container" style="max-height: 360px; overflow-y: auto; padding-right: 2px;">
              ${buildKeywordListHtml()}
            </div>

          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const backdrop = document.getElementById(modalId);
    const close = () => {
      backdrop.remove();
      renderQuickKeywordButtons();
    };

    document.getElementById('btn-close-kw-modal')?.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });

    const newKwInput = document.getElementById('kw-new-input');
    const addNewKwBtn = document.getElementById('btn-add-new-kw');

    const handleAddNew = () => {
      if (!newKwInput) return;
      const val = newKwInput.value.trim();
      if (!val) {
        newKwInput.focus();
        return;
      }
      addQuickKeyword(val);
      newKwInput.value = '';
      refreshList();
      showToast(`เพิ่มคีย์เวิร์ด "${val}" เรียบร้อยแล้ว`);
      newKwInput.focus();
    };

    if (addNewKwBtn) addNewKwBtn.addEventListener('click', handleAddNew);
    if (newKwInput) {
      newKwInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddNew();
        }
      });
      setTimeout(() => newKwInput.focus(), 60);
    }

    const resetBtn = document.getElementById('btn-reset-default-kws');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('คุณต้องการคืนค่าคีย์เวิร์ดเริ่มต้น ใช่หรือไม่?')) {
          resetQuickKeywords();
          refreshList();
          showToast('คืนค่าคีย์เวิร์ดเริ่มต้นเรียบร้อยแล้ว');
        }
      });
    }

    function refreshList() {
      const listContainer = document.getElementById('kw-modal-list-container');
      if (listContainer) {
        listContainer.innerHTML = buildKeywordListHtml();
        bindKeywordItemEvents();
      }
      renderQuickKeywordButtons();
    }

    function bindKeywordItemEvents() {
      const listContainer = document.getElementById('kw-modal-list-container');
      if (!listContainer) return;

      // Insert keyword into focused field and close modal
      listContainer.querySelectorAll('.btn-apply-kw').forEach(btn => {
        btn.addEventListener('click', () => {
          const text = btn.getAttribute('data-text');
          close();
          insertKeywordAtCursor(text);
        });
      });

      // Edit keyword inline
      listContainer.querySelectorAll('.btn-edit-kw').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = btn.closest('.keyword-list-item');
          if (!item) return;
          const displaySpan = item.querySelector('.kw-text-display');
          const editInput = item.querySelector('.kw-edit-input');
          const saveBtn = item.querySelector('.btn-save-edit-kw');
          const cancelBtn = item.querySelector('.btn-cancel-edit-kw');
          const applyBtn = item.querySelector('.btn-apply-kw');
          const deleteBtn = item.querySelector('.btn-delete-kw');

          displaySpan.style.display = 'none';
          editInput.style.display = 'block';
          btn.style.display = 'none';
          if (applyBtn) applyBtn.style.display = 'none';
          if (deleteBtn) deleteBtn.style.display = 'none';
          if (saveBtn) saveBtn.style.display = 'inline-flex';
          if (cancelBtn) cancelBtn.style.display = 'inline-flex';

          editInput.focus();
          editInput.select();

          editInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              saveBtn.click();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelBtn.click();
            }
          };
        });
      });

      // Save edit
      listContainer.querySelectorAll('.btn-save-edit-kw').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const item = btn.closest('.keyword-list-item');
          const editInput = item?.querySelector('.kw-edit-input');
          const newVal = editInput ? editInput.value.trim() : '';
          if (!newVal) {
            alert('กรุณากรอกข้อความคีย์เวิร์ด');
            editInput?.focus();
            return;
          }
          updateQuickKeyword(id, newVal);
          showToast(`แก้ไขคีย์เวิร์ดเป็น "${newVal}" เรียบร้อยแล้ว`);
          refreshList();
        });
      });

      // Cancel edit
      listContainer.querySelectorAll('.btn-cancel-edit-kw').forEach(btn => {
        btn.addEventListener('click', () => {
          refreshList();
        });
      });

      // Delete keyword
      listContainer.querySelectorAll('.btn-delete-kw').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          if (!id) return;
          deleteQuickKeyword(id);
          refreshList();
          showToast('ลบคีย์เวิร์ดเรียบร้อยแล้ว');
        });
      });
    }

    bindKeywordItemEvents();
  }

  function getFormData() {
    const bookingDateInput = document.getElementById('bookingDate');
    const bookingDate = (bookingDateInput && bookingDateInput.value) || currentBookingDate || todayIso;
    const usageDateInput = document.getElementById('usageDate');
    const usageDate = (usageDateInput && usageDateInput.value) || currentUsageDate || defaultUsageIso;
    const startTimeInput = document.getElementById('startTime');
    const startTime = (startTimeInput && normalize24hTime(startTimeInput.value)) || '08:30';
    const endTimeInput = document.getElementById('endTime');
    const endTime = (endTimeInput && normalize24hTime(endTimeInput.value)) || '17:00';
    const bookerName = document.getElementById('bookerName')?.value || 'สมชาย รักบริการ';
    const bookerPhone = document.getElementById('bookerPhone')?.value || '081-999-1234';
    const department = document.getElementById('department')?.value || 'ฝ่ายขายและการตลาด';
    const requestedVehicle = document.getElementById('requestedVehicle')?.value || '';
    const requestedDriver = document.getElementById('requestedDriver')?.value || '';
    const notes = document.getElementById('notes')?.value || '';

    return {
      id: 'DRAFT',
      formCode: '',
      bookingDate,
      usageDate,
      startTime,
      endTime,
      bookerName,
      bookerPhone,
      department,
      requestedVehicle,
      assignedVehicle: '',
      requestedDriver: '',
      assignedDriver: '',
      status: 'pending_approval',
      statusLabel: 'รอหัวหน้าฝ่ายอนุมัติ',
      driverJobStatus: 'not_started',
      itinerary: itineraryRows,
      notes,
      bookerSignature: bookerName
    };
  }

  function showToast(msg) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'toast-box';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>🔔</span> <span>${msg}</span>`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  render();
}
