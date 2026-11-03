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
  deleteBooking
} from '../store.js';
import { renderPaperModal } from '../components/PaperModal.js';

export function renderBookerView(container) {
  let activeSubTab = 'form'; // 'form' | 'history'
  let itineraryRows = [
    { no: 1, detail: '', note: '', destination: '' }
  ];

  const todayIso = getTodayISODate();
  const defaultUsageIso = addDaysToDate(todayIso, 1); // Defaults to tomorrow (1 day advance)

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
            <span style="font-size: 0.72rem; background: #e2e8f0; padding: 1px 6px; border-radius: 10px;">FM-OFF-001</span>
          </button>
          <button id="tab-sub-history" class="booker-subtab-btn ${activeSubTab === 'history' ? 'active' : ''}">
            <span>📋 ประวัติการจองของฉัน</span>
            <span style="font-size: 0.72rem; background: #2563eb; color: #fff; padding: 1px 7px; border-radius: 10px;">
              ${bookings.length}
            </span>
          </button>
        </div>

        ${activeSubTab === 'form' ? renderFormSection(todayIso, defaultUsageIso) : renderHistorySection(bookings)}

      </div>
    `;

    attachEvents();
  }

  function renderFormSection(todayIso, defaultUsageIso) {
    const todayThai = formatThaiDate(todayIso);
    const minUsageIso = addDaysToDate(todayIso, 1);
    const validation = validateBookingAdvance(todayIso, defaultUsageIso);

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
              <span>📄 แบบฟอร์ม: FM-OFF-001/3/01-06-66</span>
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
                <span>วันที่จอง</span>
                <span class="help-text">(วันที่ทำรายการ)</span>
              </label>
              <input type="date" id="bookingDate" class="form-control" value="${todayIso}" readonly />
              <small style="color: var(--slate-500); font-size: 0.75rem;">ตรงกับ: ${todayThai.full}</small>
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
                value="${defaultUsageIso}" 
                required 
              />
              <div id="usageDate-thai-preview" style="font-size: 0.78rem; font-weight: 600; color: #1d4ed8; margin-top: 3px;">
                ${formatThaiDate(defaultUsageIso).full}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="startTime">
                <span>⏰ ตั้งแต่เวลา</span>
                <span class="required">*</span>
              </label>
              <div class="input-group">
                <input type="time" id="startTime" class="form-control" value="08:30" required />
                <span class="input-addon">น.</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="endTime">
                <span>⏰ ถึงเวลา</span>
                <span class="required">*</span>
              </label>
              <div class="input-group">
                <input type="time" id="endTime" class="form-control" value="17:00" required />
                <span class="input-addon">น.</span>
              </div>
            </div>

          </div>

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
                <button type="button" class="quick-tpl-btn" data-tpl="customer">🤝 พบลูกค้า</button>
                <button type="button" class="quick-tpl-btn" data-tpl="airport">✈️ สนามบิน</button>
                <button type="button" class="quick-tpl-btn" data-tpl="cargo">📦 ส่งของ</button>
              </div>
            </div>

            <div class="table-responsive">
              <table class="form-table" id="itinerary-table">
                <thead>
                  <tr>
                    <th style="width: 60px; text-align: center;">ลำดับที่</th>
                    <th>รายละเอียด (ภารกิจ / สิ่งของ / วัตถุประสงค์) <span class="required" style="color: #dc2626;">* (บังคับ)</span></th>
                    <th style="width: 170px;">เวลา / จำนวนคน</th>
                    <th style="width: 280px;">สถานที่ (ปลายทาง / จุดแวะ) <span class="required" style="color: #dc2626;">* (บังคับ)</span></th>
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
                * บังคับกรอกอย่างน้อย 1 รายการ และรองรับสูงสุด 6 รายการตรงตามแบบฟอร์มกระดาษ FM-OFF-001
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
                <span>👁️ ดูตัวอย่างแบบฟอร์มทางการ (FM-OFF-001)</span>
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
          <input 
            type="text" 
            class="form-control row-note" 
            placeholder="เช่น 10:00 น. / 3 คน" 
            value="${row.note || ''}" 
          />
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
            <p>ติดตามสถานะคำขอ ตรวจสอบผลการอนุมัติ และพิมพ์แบบฟอร์ม FM-OFF-001</p>
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
                      <div style="font-size: 0.72rem; color: var(--slate-400);">FM-OFF-001</div>
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

    // Advance Booking Validation on Usage Date Change
    const usageDateInput = document.getElementById('usageDate');
    const bookingDateInput = document.getElementById('bookingDate');
    const ruleBanner = document.getElementById('rule-banner');
    const advanceDaysTag = document.getElementById('advance-days-tag');
    const ruleMsgText = document.getElementById('rule-message-text');
    const previewThai = document.getElementById('usageDate-thai-preview');
    const submitBtn = document.getElementById('btn-submit-booking');

    const updateValidation = () => {
      const bDate = bookingDateInput.value;
      const uDate = usageDateInput.value;
      const val = validateBookingAdvance(bDate, uDate);

      if (previewThai && uDate) {
        previewThai.textContent = formatThaiDate(uDate).full;
      }

      if (val.isValid) {
        ruleBanner.className = 'rule-check-banner valid';
        ruleBanner.querySelector('.rule-icon').textContent = '✅';
        advanceDaysTag.textContent = `จองล่วงหน้า ${val.diffDays} วัน`;
        ruleMsgText.textContent = val.message;
        usageDateInput.classList.remove('input-invalid');
        usageDateInput.classList.add('input-valid');
        submitBtn.disabled = false;
      } else {
        ruleBanner.className = 'rule-check-banner invalid';
        ruleBanner.querySelector('.rule-icon').textContent = '⚠️';
        advanceDaysTag.textContent = val.diffDays <= 0 ? 'ผิดเงื่อนไข' : `ล่วงหน้า ${val.diffDays} วัน`;
        ruleMsgText.textContent = val.message;
        usageDateInput.classList.remove('input-valid');
        usageDateInput.classList.add('input-invalid');
        submitBtn.disabled = true;
      }
    };

    if (usageDateInput) {
      usageDateInput.addEventListener('change', updateValidation);
      usageDateInput.addEventListener('input', updateValidation);
    }


    // Row addition & deletion
    const addRowBtn = document.getElementById('btn-add-row');
    if (addRowBtn) {
      addRowBtn.addEventListener('click', () => {
        if (itineraryRows.length >= 6) {
          alert('แบบฟอร์ม FM-OFF-001 กำหนดรายการไว้สูงสุด 6 แถว หากมีจุดหมายมากกว่านี้ กรุณาระบุในช่องหมายเหตุ');
          return;
        }
        collectCurrentRows();
        itineraryRows.push({ no: itineraryRows.length + 1, detail: '', note: '', destination: '' });
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
    }
    attachRowEvents();

    function collectCurrentRows() {
      const rows = [];
      const trs = container.querySelectorAll('#itinerary-tbody tr');
      trs.forEach((tr, i) => {
        const detailInput = tr.querySelector('.row-detail');
        const noteInput = tr.querySelector('.row-note');
        const destInput = tr.querySelector('.row-destination');
        const detail = detailInput ? detailInput.value : '';
        const note = noteInput ? noteInput.value : '';
        const destination = destInput ? destInput.value : '';
        rows.push({ no: i + 1, detail, note, destination });
      });
      itineraryRows = rows;
    }

    function renderTableBody() {
      const tbody = document.getElementById('itinerary-tbody');
      tbody.innerHTML = itineraryRows.map((r, i) => renderRowHtml(r, i)).join('');
      attachRowEvents();
    }

    // Quick template handlers
    container.querySelectorAll('.quick-tpl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tpl = btn.getAttribute('data-tpl');
        collectCurrentRows();
        if (tpl === 'customer') {
          itineraryRows = [
            { no: 1, detail: 'เดินทางไปพบลูกค้าเพื่อส่งมอบสัญญาและประชุมนำเสนอโครงการ', note: '10:00 น. / 3 คน', destination: 'นิคมอุตสาหกรรมบางปู จ.สมุทรปราการ' },
            { no: 2, detail: 'เดินทางกลับสำนักงานใหญ่', note: '14:30 น. / 3 คน', destination: 'สำนักงานใหญ่ พระราม 9' }
          ];
        } else if (tpl === 'airport') {
          itineraryRows = [
            { no: 1, detail: 'ไปรับผู้บริหารและคณะดูงานจากต่างประเทศ', note: '09:30 น. / 4 คน', destination: 'สนามบินสุวรรณภูมิ ประตู 4' },
            { no: 2, detail: 'ส่งคณะผู้บริหารเข้าที่พักและศูนย์ประชุม', note: '13:00 น. / 4 คน', destination: 'โรงแรม แกรนด์ เซนเตอร์พอยต์ เพลินจิต' }
          ];
        } else if (tpl === 'cargo') {
          itineraryRows = [
            { no: 1, detail: 'ขนส่งอุปกรณ์เครื่องมือและอะไหล่ซ่อมบำรุง', note: '08:30 น. / 2 คน', destination: 'คลังสินค้า บางนา กม.19' },
            { no: 2, detail: 'นำส่งเอกสารตรวจรับสินค้า', note: '13:30 น. / 2 คน', destination: 'สาขานิคมพัฒนา จ.ระยอง' }
          ];
        }
        renderTableBody();
        showToast('โหลดเทมเพลตด่วนเรียบร้อย');
      });
    });

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
          itineraryRows = [
            { no: 1, detail: '', note: '', destination: '' }
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

        const bDate = bookingDateInput.value;
        const uDate = usageDateInput.value;
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

        const data = getFormData();
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

  function getFormData() {
    const bookingDate = document.getElementById('bookingDate').value || todayIso;
    const usageDate = document.getElementById('usageDate').value || defaultUsageIso;
    const startTime = document.getElementById('startTime').value || '08:30';
    const endTime = document.getElementById('endTime').value || '17:00';
    const bookerName = document.getElementById('bookerName').value || 'สมชาย รักบริการ';
    const bookerPhone = document.getElementById('bookerPhone').value || '081-999-1234';
    const department = document.getElementById('department')?.value || 'ฝ่ายขายและการตลาด';
    const requestedVehicle = document.getElementById('requestedVehicle')?.value || '';
    const requestedDriver = document.getElementById('requestedDriver')?.value || '';
    const notes = document.getElementById('notes').value || '';

    return {
      id: 'DRAFT',
      formCode: 'FM-OFF-001/3/01-06-66',
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
