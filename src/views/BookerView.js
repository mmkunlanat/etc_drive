// BookerView.js - Main Booker Portal (หน้าของผู้จอง)
import {
  getTodayISODate,
  addDaysToDate,
  formatThaiDate,
  validateBookingAdvance,
  checkSubmissionTimeDeadline,
  DEPARTMENTS,
  getAllBookings,
  createBooking,
  deleteBooking,
  getQuickTemplates,
  addQuickTemplate,
  updateQuickTemplate,
  deleteQuickTemplate,
  resetQuickTemplates
} from '../store.js';
import { renderPaperModal } from '../components/PaperModal.js';

export function renderBookerView(container) {
  let activeSubTab = 'form'; // 'form' | 'history'
  const todayIso = getTodayISODate();
  const defaultUsageIso = addDaysToDate(todayIso, 1); // Defaults to tomorrow (1 day advance)

  let currentBookingDate = todayIso;
  let currentUsageDate = defaultUsageIso;
  let itineraryRows = [
    { no: 1, detail: '', time: '', passengers: '', note: '', destination: '' }
  ];

  function normalize24hTime(val) {
    if (!val || typeof val !== 'string') return '';
    const clean = val.trim();
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

      input.addEventListener('input', (e) => {
        let val = input.value.replace(/[^\d:]/g, '');
        if (val.length === 2 && !val.includes(':') && e.inputType !== 'deleteContentBackward') {
          val = val + ':';
        }
        if (val.length > 5) val = val.slice(0, 5);
        input.value = val;
      });

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
            <span>⏰ เวลาปัจจุบัน: ${timeCheck.currentTime}</span>
            <span style="color: ${timeCheck.isPast15 ? '#b45309' : '#059669'};">
              (${timeCheck.isPast15 ? 'เลย 15:00 น. แล้ว' : 'อยู่ในเกณฑ์เวลาปกติ'})
            </span>
          </div>
        </div>

        <!-- Subtabs: New Form vs My Requests -->
        <div class="booker-tabs-nav">
          <button id="tab-sub-form" class="booker-subtab-btn ${activeSubTab === 'form' ? 'active' : ''}">
            <span>📝 กรอกใบขออนุมัติการใช้รถ</span>
          </button>
          <button id="tab-sub-history" class="booker-subtab-btn ${activeSubTab === 'history' ? 'active' : ''}">
            <span>📋 ประวัติการจองของฉัน</span>
            <span style="font-size: 0.72rem; background: #2563eb; color: #fff; padding: 1px 7px; border-radius: 10px;">
              ${bookings.length}
            </span>
          </button>
        </div>

        ${activeSubTab === 'form' ? renderFormSection() : renderHistorySection(bookings)}

      </div>
    `;

    attachEvents();
  }

  function renderFormSection() {
    const minUsageIso = addDaysToDate(currentBookingDate, 1);
    const validation = validateBookingAdvance(currentBookingDate, currentUsageDate);
    const templates = getQuickTemplates();

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

        <form id="vehicle-booking-form">
          
          <!-- Top Row: Booking Date & Booker Name -->
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" for="bookingDate">
                <span>📅 วันที่จอง</span>
                <span class="required">* (สามารถแก้ไขได้)</span>
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
              <input type="text" id="bookerName" class="form-control" placeholder="เช่น นายณัฐพล ทวีสุข" value="สมชาย รักบริการ" required />
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
                ${DEPARTMENTS.map(d => `<option value="${d}" ${d === 'ฝ่ายขายและการตลาด' ? 'selected' : ''}>${d}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="bookerPhone">
                <span>เบอร์โทรศัพท์ติดต่อ</span>
                <span class="required">*</span>
              </label>
              <input type="tel" id="bookerPhone" class="form-control" placeholder="เช่น 081-234-5678" value="081-999-1234" required />
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
                <span>⏰ ตั้งแต่เวลา</span>
                <span class="required">* (24 ชม.)</span>
              </label>
              <div class="input-group">
                <input 
                  type="text" 
                  id="startTime" 
                  class="form-control time-input-24h" 
                  value="08:30" 
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
                <span>⏰ ถึงเวลา</span>
                <span class="required">* (24 ชม.)</span>
              </label>
              <div class="input-group">
                <input 
                  type="text" 
                  id="endTime" 
                  class="form-control time-input-24h" 
                  value="17:00" 
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
                <span>🗺️</span>
                <span>ตารางรายละเอียดภารกิจและสถานที่ (ลำดับ 1 - 6)</span>
                <span class="required" style="font-size: 0.85rem; font-weight: 600; margin-left: 6px; color: #dc2626;">* (บังคับต้องกรอก)</span>
              </h3>
              <div class="quick-templates-group">
                <span style="font-size: 0.75rem; opacity: 0.9;">เทมเพลตด่วน:</span>
                <div id="quick-templates-buttons" style="display: inline-flex; gap: 5px; flex-wrap: wrap;">
                  ${templates.map(t => `
                    <button type="button" class="quick-tpl-btn" data-id="${t.id}" title="${t.name} (${t.rows.length} รายการ)">
                      ${t.name}
                    </button>
                  `).join('')}
                </div>
                <button type="button" id="btn-manage-templates" class="quick-tpl-btn" style="background: rgba(255,255,255,0.25); font-weight: 700; font-size: 0.95rem; padding: 1px 9px; line-height: 1.2;" title="เพิ่มและจัดการเทมเพลตด่วน">
                  +
                </button>
              </div>
            </div>

            <div class="table-responsive">
              <table class="form-table" id="itinerary-table">
                <thead>
                  <tr>
                    <th style="width: 55px; text-align: center;">ลำดับที่</th>
                    <th>รายละเอียด (ภารกิจ / สิ่งของ / วัตถุประสงค์) <span class="required" style="color: #dc2626;">* (บังคับ)</span></th>
                    <th style="width: 135px;">⏰ เวลา (24 ชม.)</th>
                    <th style="width: 110px;">👥 จำนวนคน</th>
                    <th style="width: 260px;">สถานที่ (ปลายทาง / จุดแวะ) <span class="required" style="color: #dc2626;">* (บังคับ)</span></th>
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
                <span>➕ เพิ่มแถวรายการใหม่</span>
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
            >ผู้โดยสาร 3 ท่าน ได้แก่ สมชาย, วรรณา, กิตติ มีกระเป๋าเอกสารและของที่ระลึก 2 ลัง</textarea>
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

            <button type="submit" id="btn-submit-booking" class="btn-primary">
              <span>📤 ส่งใบขออนุมัติการใช้รถ</span>
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
          <div class="input-group">
            <input 
              type="number" 
              class="form-control row-passengers" 
              min="1" 
              max="100" 
              placeholder="0" 
              value="${passengers}" 
            />
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
              🗑️
            </button>
          ` : '-'}
        </td>
      </tr>
    `;
  }

  function renderHistorySection(bookings) {
    if (!bookings || bookings.length === 0) {
      return `
        <div class="content-card" style="text-align: center; padding: 3rem 1rem;">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">🚗</div>
          <h3 style="font-size: 1.2rem; color: var(--slate-700);">ยังไม่มีประวัติการขอใช้รถ</h3>
          <p style="color: var(--slate-500); margin-bottom: 1.5rem;">คุณสามารถเริ่มสร้างคำขอจองรถใหม่ได้ที่แท็บด้านบน</p>
          <button id="btn-go-to-form" class="btn-primary">
            📝 สร้างคำขอจองรถใหม่
          </button>
        </div>
      `;
    }

    return `
      <div class="content-card">
        <div class="card-header-flex">
          <div class="card-title-group">
            <h2>
              <span>📋</span>
              <span>ประวัติการขออนุมัติใช้รถทั้งหมด</span>
            </h2>
            <p>ติดตามสถานะคำขอ ตรวจสอบผลการอนุมัติ และพิมพ์แบบฟอร์ม</p>
          </div>
          <div style="font-size: 0.85rem; color: var(--slate-500);">
            ทั้งหมด <strong>${bookings.length}</strong> รายการ
          </div>
        </div>

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
              ${bookings.map(b => {
                const usageThai = formatThaiDate(b.usageDate);
                const firstDest = (b.itinerary && b.itinerary[0] && b.itinerary[0].destination) ? b.itinerary[0].destination : '-';
                return `
                  <tr>
                    <td>
                      <strong style="color: #1e40af;">${b.id}</strong>
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

    if (formTabBtn) formTabBtn.addEventListener('click', () => { activeSubTab = 'form'; render(); });
    if (histTabBtn) histTabBtn.addEventListener('click', () => { activeSubTab = 'history'; render(); });
    if (goToFormBtn) goToFormBtn.addEventListener('click', () => { activeSubTab = 'form'; render(); });

    // History actions
    container.querySelectorAll('.btn-view-paper').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const b = getAllBookings().find(x => x.id === id);
        if (b) renderPaperModal(b);
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
        if (submitBtn) submitBtn.disabled = true;
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
      // Bind 24-hour time formatting & validation
      bind24hTimeInputs(container);
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

    // Quick template handlers & dynamic buttons
    function renderQuickTemplateButtons() {
      const group = container.querySelector('#quick-templates-buttons');
      if (!group) return;
      const templates = getQuickTemplates();
      group.innerHTML = templates.map(t => `
        <button type="button" class="quick-tpl-btn" data-id="${t.id}" title="${t.name} (${t.rows.length} รายการ)">
          ${t.name}
        </button>
      `).join('');

      group.querySelectorAll('.quick-tpl-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const t = getQuickTemplates().find(x => x.id === id);
          if (t) {
            itineraryRows = t.rows.map((r, i) => {
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
                note: r.note || [time ? `${time} น.` : '', passengers ? `${passengers} คน` : ''].filter(Boolean).join(' / '),
                destination: r.destination || ''
              };
            });
            renderTableBody();
            showToast(`โหลดเทมเพลต "${t.name}" เรียบร้อยแล้ว`);
          }
        });
      });
    }

    renderQuickTemplateButtons();

    // Manage templates button
    const manageTplBtn = document.getElementById('btn-manage-templates');
    if (manageTplBtn) {
      manageTplBtn.addEventListener('click', () => {
        openTemplateManagerModal();
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
        renderPaperModal(currentData);
      });
    }

    // Reset Form
    const resetBtn = document.getElementById('btn-reset-form');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('คุณต้องการล้างข้อมูลในฟอร์มใช่หรือไม่?')) {
          currentBookingDate = todayIso;
          currentUsageDate = defaultUsageIso;
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

        // Validate itinerary - บังคับต้องกรอกตารางรายละเอียดภารกิจและสถานที่ (ลำดับ 1 - 6)
        if (itineraryRows.length === 0) {
          alert('กรุณากรอกตารางรายละเอียดภารกิจและสถานที่ (ลำดับ 1 - 6) อย่างน้อย 1 รายการ (บังคับต้องกรอก)');
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
        
        const created = createBooking(data);
        showToast(`ส่งใบขออนุมัติการใช้รถรหัส ${created.id} เรียบร้อยแล้ว!`);

        // Switch to history tab to view
        activeSubTab = 'history';
        render();

        // Also pop up official form preview
        renderPaperModal(created);
      });
    }
  }

  function openTemplateManagerModal() {
    const modalId = 'tpl-manager-modal-backdrop';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    function buildListHtml() {
      const templates = getQuickTemplates();
      if (templates.length === 0) {
        return `
          <div style="text-align: center; padding: 2.5rem 1rem; color: var(--slate-500);">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📋</div>
            <p style="font-weight: 500; font-size: 1rem;">ยังไม่มีเทมเพลตด่วนในระบบ</p>
            <p style="font-size: 0.8rem; margin-bottom: 1rem;">คุณสามารถสร้างเทมเพลตใหม่ หรือคืนค่าเทมเพลตเริ่มต้นได้</p>
            <button type="button" id="btn-modal-add-first" class="btn-primary" style="font-size: 0.85rem;">
              ➕ สร้างเทมเพลตแรก
            </button>
          </div>
        `;
      }
      return templates.map(t => {
        const routePreview = t.rows.map((r, i) => `${i + 1}. ${r.destination || r.detail || 'จุดหมาย'}`).join(' ➔ ');
        return `
          <div class="tpl-list-item" data-id="${t.id}">
            <div class="tpl-info" style="flex: 1; min-width: 0;">
              <h4>
                <span>${t.name}</span>
                <span style="font-size: 0.72rem; font-weight: normal; background: #e0e7ff; color: #3730a3; padding: 1px 7px; border-radius: 10px;">${t.rows.length} จุดหมาย</span>
              </h4>
              <p style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 360px;">
                ${routePreview}
              </p>
            </div>
            <div class="tpl-actions">
              <button type="button" class="btn-primary btn-apply-tpl" data-id="${t.id}" style="padding: 4px 9px; font-size: 0.75rem;" title="ใช้งานเทมเพลตนี้">
                📥 ใช้
              </button>
              <button type="button" class="btn-secondary btn-edit-tpl" data-id="${t.id}" style="padding: 4px 9px; font-size: 0.75rem;" title="แก้ไขเทมเพลต">
                ✏️ แก้ไข
              </button>
              <button type="button" class="btn-icon-danger btn-delete-tpl" data-id="${t.id}" style="width: 28px; height: 28px;" title="ลบเทมเพลต">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    const modalHtml = `
      <div id="${modalId}" class="paper-modal-backdrop">
        <div class="paper-modal-dialog" style="max-width: 620px;">
          <div class="paper-modal-header" style="background: linear-gradient(135deg, #1e3a8a, #2563eb);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.25rem;">⚡</span>
              <div>
                <strong style="font-size: 0.95rem; color: #fff;">จัดการเทมเพลตด่วน (Quick Templates)</strong>
                <div style="font-size: 0.75rem; color: #bfdbfe;">เพิ่ม แก้ไข หรือลบเทมเพลตแผนการเดินทาง</div>
              </div>
            </div>
            <button id="btn-close-tpl-modal" class="btn-ghost-light">✕</button>
          </div>
          <div class="paper-modal-body" style="background: #fff; padding: 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 8px;">
              <div style="font-size: 0.85rem; color: var(--slate-600);">
                รายการเทมเพลตด่วนที่พร้อมใช้งาน
              </div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button type="button" id="btn-modal-save-current" class="btn-primary" style="padding: 5px 10px; font-size: 0.8rem; background: #059669;" title="บันทึกข้อมูลจากตารางที่กรอกอยู่ในฟอร์มเป็นเทมเพลตใหม่">
                  💾 บันทึกจากตารางปัจจุบัน
                </button>
                <button type="button" id="btn-modal-create-tpl" class="btn-primary" style="padding: 5px 10px; font-size: 0.8rem;">
                  ➕ สร้างเทมเพลตใหม่
                </button>
                <button type="button" id="btn-modal-reset-tpls" class="btn-secondary" style="padding: 5px 10px; font-size: 0.8rem;" title="คืนค่าเป็น 3 เทมเพลตมาตรฐาน">
                  🔄 คืนค่าเริ่มต้น
                </button>
              </div>
            </div>

            <div id="tpl-modal-list-container" style="max-height: 380px; overflow-y: auto; padding-right: 2px;">
              ${buildListHtml()}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const backdrop = document.getElementById(modalId);
    const close = () => {
      backdrop.remove();
      renderQuickTemplateButtons();
    };

    document.getElementById('btn-close-tpl-modal')?.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });

    function bindListEvents() {
      const listContainer = document.getElementById('tpl-modal-list-container');
      if (!listContainer) return;

      listContainer.querySelectorAll('.btn-apply-tpl').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const t = getQuickTemplates().find(x => x.id === id);
          if (t) {
            itineraryRows = t.rows.map((r, i) => {
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
                note: r.note || [time ? `${time} น.` : '', passengers ? `${passengers} คน` : ''].filter(Boolean).join(' / '),
                destination: r.destination || ''
              };
            });
            renderTableBody();
            showToast(`โหลดเทมเพลต "${t.name}" เรียบร้อยแล้ว`);
            close();
          }
        });
      });

      listContainer.querySelectorAll('.btn-edit-tpl').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const t = getQuickTemplates().find(x => x.id === id);
          if (t) {
            openTemplateEditorModal(t, () => {
              listContainer.innerHTML = buildListHtml();
              bindListEvents();
              renderQuickTemplateButtons();
            });
          }
        });
      });

      listContainer.querySelectorAll('.btn-delete-tpl').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const t = getQuickTemplates().find(x => x.id === id);
          if (t && confirm(`คุณต้องการลบเทมเพลต "${t.name}" ใช่หรือไม่?`)) {
            deleteQuickTemplate(id);
            showToast(`ลบเทมเพลต "${t.name}" เรียบร้อย`);
            listContainer.innerHTML = buildListHtml();
            bindListEvents();
            renderQuickTemplateButtons();
          }
        });
      });

      document.getElementById('btn-modal-add-first')?.addEventListener('click', () => {
        openTemplateEditorModal(null, () => {
          listContainer.innerHTML = buildListHtml();
          bindListEvents();
          renderQuickTemplateButtons();
        });
      });
    }

    bindListEvents();

    document.getElementById('btn-modal-save-current')?.addEventListener('click', () => {
      collectCurrentRows();
      const validRows = itineraryRows.filter(r => r.detail.trim() && r.destination.trim());
      if (validRows.length === 0) {
        alert('กรุณากรอกข้อมูลในตารางอย่างน้อย 1 รายการก่อนบันทึกเป็นเทมเพลตด่วน');
        return;
      }
      openTemplateEditorModal({ name: '', rows: validRows }, () => {
        const listContainer = document.getElementById('tpl-modal-list-container');
        if (listContainer) {
          listContainer.innerHTML = buildListHtml();
          bindListEvents();
        }
        renderQuickTemplateButtons();
      });
    });

    document.getElementById('btn-modal-create-tpl')?.addEventListener('click', () => {
      openTemplateEditorModal(null, () => {
        const listContainer = document.getElementById('tpl-modal-list-container');
        if (listContainer) {
          listContainer.innerHTML = buildListHtml();
          bindListEvents();
        }
        renderQuickTemplateButtons();
      });
    });

    document.getElementById('btn-modal-reset-tpls')?.addEventListener('click', () => {
      if (confirm('คุณต้องการคืนค่าเทมเพลตเริ่มต้น (พบลูกค้า, สนามบิน, ส่งของ) ใช่หรือไม่?')) {
        resetQuickTemplates();
        showToast('คืนค่าเทมเพลตเริ่มต้นเรียบร้อย');
        const listContainer = document.getElementById('tpl-modal-list-container');
        if (listContainer) {
          listContainer.innerHTML = buildListHtml();
          bindListEvents();
        }
        renderQuickTemplateButtons();
      }
    });
  }

  function openTemplateEditorModal(tplToEdit = null, onSaved = null) {
    const modalId = 'tpl-editor-modal-backdrop';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const isEdit = !!(tplToEdit && tplToEdit.id);
    const initialName = tplToEdit ? tplToEdit.name : '';
    let editorRows = (tplToEdit && tplToEdit.rows && tplToEdit.rows.length > 0)
      ? JSON.parse(JSON.stringify(tplToEdit.rows)).map((r, i) => {
          let time = r.time || '';
          let passengers = r.passengers || '';
          if (!time && !passengers && r.note) {
            const p = parseNote(r.note);
            time = p.time;
            passengers = p.passengers;
          }
          return { no: i + 1, detail: r.detail || '', time, passengers, destination: r.destination || '' };
        })
      : [ { no: 1, detail: '', time: '', passengers: '', destination: '' } ];

    function renderEditorRowsHtml() {
      return editorRows.map((r, i) => `
        <tr data-index="${i}">
          <td style="text-align: center; font-weight: 600; color: var(--primary);">${i + 1}.)</td>
          <td>
            <input type="text" class="form-control tpl-row-detail" placeholder="เช่น ไปพบลูกค้าเพื่อส่งมอบสัญญา" value="${r.detail || ''}" required />
          </td>
          <td style="width: 110px;">
            <input 
              type="text" 
              class="form-control tpl-row-time time-input-24h" 
              value="${r.time || ''}" 
              placeholder="09:00"
              maxlength="5"
              list="time-list-24h"
              autocomplete="off"
              style="text-align: center;"
            />
          </td>
          <td style="width: 95px;">
            <input type="number" class="form-control tpl-row-passengers" min="1" max="100" placeholder="0" value="${r.passengers || ''}" />
          </td>
          <td style="width: 190px;">
            <input type="text" class="form-control tpl-row-destination" placeholder="เช่น บางปู สมุทรปราการ" value="${r.destination || ''}" required />
          </td>
          <td style="text-align: center;">
            ${editorRows.length > 1 ? `
              <button type="button" class="btn-icon-danger btn-tpl-delete-row" data-index="${i}" title="ลบแถว">🗑️</button>
            ` : '-'}
          </td>
        </tr>
      `).join('');
    }

    const modalHtml = `
      <div id="${modalId}" class="paper-modal-backdrop" style="z-index: 1050;">
        <div class="paper-modal-dialog" style="max-width: 680px;">
          <div class="paper-modal-header" style="background: linear-gradient(135deg, #1e3a8a, #0284c7);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.25rem;">${isEdit ? '✏️' : '➕'}</span>
              <div>
                <strong style="font-size: 0.95rem; color: #fff;">${isEdit ? 'แก้ไขเทมเพลตด่วน' : 'สร้างเทมเพลตด่วนใหม่'}</strong>
                <div style="font-size: 0.75rem; color: #e0f2fe;">กำหนดชื่อและรายละเอียดภารกิจ/สถานที่ (1 - 6 รายการ)</div>
              </div>
            </div>
            <button id="btn-close-editor-modal" class="btn-ghost-light">✕</button>
          </div>
          <div class="paper-modal-body" style="background: #fff; padding: 1.25rem;">
            
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label" for="tpl-name-input">
                <span>🏷️ ชื่อเทมเพลต</span>
                <span class="required">*</span>
              </label>
              <input 
                type="text" 
                id="tpl-name-input" 
                class="form-control" 
                placeholder="เช่น 🤝 พบลูกค้ารายใหญ่ หรือ 🚚 นำส่งตัวอย่างสินค้า" 
                value="${initialName}" 
                required 
              />
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="font-size: 0.85rem; font-weight: 600; color: var(--slate-700);">
                🗺️ รายการจุดหมาย (สูงสุด 6 แถว)
              </span>
              <button type="button" id="btn-tpl-add-row" class="btn-secondary-sm" style="font-size: 0.78rem;">
                ➕ เพิ่มแถว
              </button>
            </div>

            <div class="table-responsive" style="max-height: 260px; overflow-y: auto; border: 1px solid var(--slate-200); border-radius: var(--radius-sm); margin-bottom: 1rem;">
              <table class="form-table" style="font-size: 0.85rem;">
                <thead>
                  <tr>
                    <th style="width: 45px; text-align: center;">ลำดับ</th>
                    <th>ภารกิจ/รายละเอียด <span class="required" style="color: #dc2626;">*</span></th>
                    <th style="width: 110px;">⏰ เวลา (24 ชม.)</th>
                    <th style="width: 95px;">👥 จำนวน</th>
                    <th style="width: 190px;">📍 สถานที่ <span class="required" style="color: #dc2626;">*</span></th>
                    <th style="width: 40px; text-align: center;">ลบ</th>
                  </tr>
                </thead>
                <tbody id="tpl-editor-tbody">
                  ${renderEditorRowsHtml()}
                </tbody>
              </table>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px;">
              <button type="button" id="btn-cancel-editor" class="btn-secondary">
                ยกเลิก
              </button>
              <button type="button" id="btn-save-tpl" class="btn-primary">
                💾 บันทึกเทมเพลต
              </button>
            </div>

          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const backdrop = document.getElementById(modalId);
    const close = () => backdrop.remove();

    document.getElementById('btn-close-editor-modal')?.addEventListener('click', close);
    document.getElementById('btn-cancel-editor')?.addEventListener('click', close);

    function collectEditorRows() {
      const tbody = document.getElementById('tpl-editor-tbody');
      if (!tbody) return;
      const trs = tbody.querySelectorAll('tr');
      const rows = [];
      trs.forEach((tr, i) => {
        const detail = tr.querySelector('.tpl-row-detail')?.value || '';
        const timeInput = tr.querySelector('.tpl-row-time');
        const time = timeInput ? normalize24hTime(timeInput.value) : '';
        const passengers = tr.querySelector('.tpl-row-passengers')?.value || '';
        const destination = tr.querySelector('.tpl-row-destination')?.value || '';
        const note = [time ? `${time} น.` : '', passengers ? `${passengers} คน` : ''].filter(Boolean).join(' / ');
        rows.push({ no: i + 1, detail, time, passengers, note, destination });
      });
      editorRows = rows;
    }

    function rebindEditorRows() {
      const tbody = document.getElementById('tpl-editor-tbody');
      if (!tbody) return;
      tbody.innerHTML = renderEditorRowsHtml();
      bind24hTimeInputs(backdrop);

      tbody.querySelectorAll('.btn-tpl-delete-row').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          collectEditorRows();
          editorRows.splice(idx, 1);
          rebindEditorRows();
        });
      });
    }

    rebindEditorRows();

    document.getElementById('btn-tpl-add-row')?.addEventListener('click', () => {
      if (editorRows.length >= 6) {
        alert('เทมเพลตสามารถมีได้สูงสุด 6 แถว');
        return;
      }
      collectEditorRows();
      editorRows.push({ no: editorRows.length + 1, detail: '', time: '', passengers: '', destination: '' });
      rebindEditorRows();
    });

    document.getElementById('btn-save-tpl')?.addEventListener('click', () => {
      const nameInput = document.getElementById('tpl-name-input');
      const name = nameInput ? nameInput.value.trim() : '';
      if (!name) {
        alert('กรุณาระบุชื่อเทมเพลต');
        if (nameInput) nameInput.focus();
        return;
      }

      collectEditorRows();
      const validRows = editorRows.filter(r => r.detail.trim() && r.destination.trim());
      if (validRows.length === 0) {
        alert('กรุณากรอกรายละเอียดภารกิจและสถานที่ในเทมเพลตอย่างน้อย 1 รายการ');
        return;
      }

      if (isEdit) {
        updateQuickTemplate(tplToEdit.id, { name, rows: validRows });
        showToast(`บันทึกการแก้ไขเทมเพลต "${name}" เรียบร้อยแล้ว`);
      } else {
        addQuickTemplate({ name, rows: validRows });
        showToast(`สร้างเทมเพลต "${name}" เรียบร้อยแล้ว`);
      }

      close();
      if (onSaved) onSaved();
      renderQuickTemplateButtons();
    });
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
