// AdminView.js - Fleet & Dispatch Admin Portal (ตารางจัดรถ)
// Spec: Exact spreadsheet match to company vehicle dispatch sheet ("ตารางจัดรถ")
// Features: Inline editable cells, Booker request picker, Job comments, Date switcher, Print export
import {
  formatThaiDate,
  getAllBookings,
  updateBooking,
  VEHICLE_TYPES,
  DRIVER_POOL,
  DEMO_DISPATCH_DATE,
  getTodayISODate,
  addDaysToDate,
  getDispatchSchedule,
  saveDispatchSchedule,
  resetDispatchScheduleToDefault,
  getDefaultFleetDispatchRows
} from '../store.js';
import { renderPaperModal } from '../components/PaperModal.js';

export function renderAdminView(container) {
  // Current active date - default to demo date 2026-10-30 (30 ตุลาคม 2569) to match image
  let selectedDate = DEMO_DISPATCH_DATE;
  let activeTab = 'spreadsheet'; // 'spreadsheet' | 'requests_list'
  let rows = [];

  // Load schedule for selected date
  function loadSchedule() {
    const rawRows = getDispatchSchedule(selectedDate);
    // Normalize data
    rows = rawRows.map(r => ({
      ...r,
      itineraryText: r.itineraryText || (Array.isArray(r.itineraryLines) ? r.itineraryLines.join('\n') : ''),
      comment: r.comment || '',
      plateColor: r.plateColor || 'yellow',
      timeColor: r.timeColor || 'default',
      linkedBookingIds: r.linkedBookingIds || []
    }));
  }

  loadSchedule();

  function render() {
    const thaiDate = formatThaiDate(selectedDate);
    const bookings = getAllBookings();
    const pendingDispatchCount = bookings.filter(b => b.status === 'pending_approval' || b.status === 'approved').length;

    container.innerHTML = `
      <div class="dispatch-portal-container">

        <!-- Top Navigation & Controls Toolbar (Hidden in Print) -->
        <div class="dispatch-top-toolbar no-print">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <div style="font-weight: 700; color: #002060; font-size: 1.1rem; display: flex; align-items: center; gap: 6px;">
              <span>🚗</span>
              <span>ระบบจัดรถ & บริหารยานพาหนะ</span>
            </div>

            <!-- View Tab Switcher -->
            <div class="role-nav-group" style="background: #f1f5f9; padding: 2px; border-radius: 8px;">
              <button id="btn-tab-sheet" class="role-tab-btn ${activeTab === 'spreadsheet' ? 'active' : ''}" style="padding: 5px 12px; font-size: 0.82rem;">
                📊 ตารางจัดรถ (Spreadsheet)
              </button>
              <button id="btn-tab-list" class="role-tab-btn ${activeTab === 'requests_list' ? 'active' : ''}" style="padding: 5px 12px; font-size: 0.82rem;">
                📋 คำขอจากผู้จอง (${bookings.length})
                ${pendingDispatchCount > 0 ? `<span style="background: #ef4444; color: #fff; border-radius: 10px; padding: 1px 6px; font-size: 0.7rem; margin-left: 4px;">${pendingDispatchCount}</span>` : ''}
              </button>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <button id="btn-add-vehicle-row" class="btn-primary" style="padding: 6px 12px; font-size: 0.82rem; background: #0284c7;">
              ➕ เพิ่มรถ/แถวใหม่
            </button>
            <button id="btn-save-schedule" class="btn-primary" style="padding: 6px 14px; font-size: 0.82rem; background: #059669;">
              💾 บันทึกตาราง
            </button>
            <button id="btn-print-schedule" class="btn-outline-blue" style="padding: 6px 12px; font-size: 0.82rem;">
              🖨️ พิมพ์ตารางจัดรถ
            </button>
            <button id="btn-reset-template" class="btn-ghost-light" style="padding: 6px 10px; font-size: 0.8rem; color: #64748b;" title="คืนค่าตารางรถ 7 คันตามแบบ">
              🔄 โหลดแบบ 30 ต.ค.
            </button>
          </div>
        </div>

        ${activeTab === 'spreadsheet' ? renderSpreadsheetView(thaiDate) : renderRequestsListView(bookings)}

      </div>
    `;

    attachGlobalEvents();
  }

  // Render the official spreadsheet table
  function renderSpreadsheetView(thaiDate) {
    return `
      <!-- Date Navigation Toolbar (Hidden in Print) -->
      <div class="dispatch-top-toolbar no-print" style="margin-bottom: 1rem; background: #f8fafc; border: 1px solid #cbd5e1;">
        <div class="dispatch-date-nav">
          <span style="font-weight: 700; color: #002060; font-size: 0.95rem;">📅 เลือกวันที่จัดรถ:</span>
          <button id="btn-prev-day" class="btn-secondary" style="padding: 4px 10px; font-size: 0.82rem;">◀ วันก่อนหน้า</button>
          <input 
            type="date" 
            id="dispatch-date-input" 
            class="dispatch-date-picker-input" 
            value="${selectedDate}" 
          />
          <button id="btn-next-day" class="btn-secondary" style="padding: 4px 10px; font-size: 0.82rem;">วันถัดไป ▶</button>
          <button id="btn-go-today" class="btn-ghost-light" style="padding: 4px 8px; font-size: 0.8rem; color: #2563eb; font-weight: 600;">
            วันนี้ (${formatThaiDate(getTodayISODate()).short})
          </button>
          <button id="btn-go-demo-date" class="btn-ghost-light" style="padding: 4px 8px; font-size: 0.8rem; color: #0284c7; font-weight: 600;">
            ภาพตัวอย่าง (30 ต.ค. 2569)
          </button>
        </div>

        <div style="font-size: 0.82rem; color: #64748b;">
          💡 <strong>ทิป:</strong> สามารถคลิกพิมพ์แก้ไขข้อมูลในตารางได้โดยตรง / เลือกงานที่ Booker ส่งมา / ใส่คอมเม้นในแต่ละคัน
        </div>
      </div>

      <!-- Main Document Paper Sheet -->
      <div class="dispatch-paper-card" id="dispatch-print-area">
        
        <!-- Official Document Title Matching Screenshot -->
        <div class="dispatch-title-heading">
          ตารางจัดรถ
        </div>

        <!-- Date Subtitle Matching Screenshot -->
        <div class="dispatch-date-subheading">
          <div>
            ประจำวันที่ ${thaiDate.day} ${thaiDate.monthName} ${thaiDate.buddhistYear}
          </div>
          <div class="no-print" style="font-size: 0.82rem; font-weight: 400; color: #64748b;">
            จำนวนรถที่พร้อมจัด: <strong>${rows.length} คัน</strong>
          </div>
        </div>

        <!-- The Spreadsheet Table -->
        <table class="dispatch-excel-table">
          <thead>
            <tr>
              <th class="col-no">ลำดับ</th>
              <th class="col-plate">ทะเบียนรถ</th>
              <th class="col-code">รหัส</th>
              <th class="col-driver">พนักงานขับรถ</th>
              <th class="col-time">เวลา</th>
              <th class="col-dept">ฝ่าย/แผนก</th>
              <th class="col-booker">ผู้จอง</th>
              <th class="col-actions no-print" style="background: #cbd5e1; width: 125px;">เครื่องมือจัดรถ</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 ? `
              <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: #64748b;">
                  ยังไม่มีข้อมูลการจัดรถในวันนี้ คลิกปุ่ม <strong>+ เพิ่มรถ/แถวใหม่</strong> หรือ <strong>🔄 โหลดแบบ 30 ต.ค.</strong>
                </td>
              </tr>
            ` : rows.map((row, index) => renderVehicleRowGroup(row, index)).join('')}
          </tbody>
        </table>

        <!-- Datalists for Autocomplete & Suggestions -->
        <datalist id="vehicle-plate-datalist">
          ${VEHICLE_TYPES.map(v => `<option value="${escapeHtml(v.label)}">${v.color === 'green' ? '🟢 สีเขียว' : (v.color === 'yellow' ? '🟡 สีเหลือง' : '')}</option>`).join('')}
        </datalist>
        <datalist id="driver-code-datalist">
          <option value="5">5 (วัชรินทร์)</option>
          <option value="2">2 (ปิยะวัฒน์)</option>
          <option value="1">1 (สมศักดิ์)</option>
          <option value="3">3 (วิชัย)</option>
          <option value="4">4 (อนุสรณ์)</option>
          <option value="#N/A">#N/A</option>
        </datalist>
        <datalist id="driver-name-datalist">
          ${DRIVER_POOL.map(d => `<option value="${escapeHtml(d.name)}">${d.code ? `รหัส ${d.code} | ` : ''}${d.phone}</option>`).join('')}
        </datalist>
        <datalist id="department-datalist">
          <option value="ACC/OFF">ACC/OFF (บัญชี/สำนักงาน)</option>
          <option value="ACC">ACC (ฝ่ายบัญชีและการเงิน)</option>
          <option value="SALE">SALE (ฝ่ายขายและการตลาด)</option>
          <option value="IT/ENG">IT/ENG (วิศวกรรม/ไอที)</option>
          <option value="HR">HR (ฝ่ายทรัพยากรบุคคล)</option>
          <option value="PUR">PUR (ฝ่ายจัดซื้อ)</option>
          <option value="PROD">PROD (ฝ่ายผลิต)</option>
          <option value="QA">QA (ฝ่ายประกันคุณภาพ)</option>
        </datalist>

      </div>
    `;
  }

  // Render a vehicle group (Main car row + Sub-row itinerary + Sub-row comment)
  function renderVehicleRowGroup(row, index) {
    const plateClass = row.plateColor === 'green' ? 'plate-bg-green' : (row.plateColor === 'yellow' ? 'plate-bg-yellow' : 'plate-bg-default');
    const timeClass = row.timeColor === 'pink' ? 'time-bg-pink' : '';
    const hasItinerary = !!(row.itineraryText && row.itineraryText.trim());
    const hasComment = !!(row.comment && row.comment.trim());
    const showItinerary = hasItinerary || row.showItineraryBox;
    const showComment = hasComment || row.showCommentBox;

    return `
      <!-- Main Row (Car & Assignment) -->
      <tr class="dispatch-main-tr" data-row-id="${row.id}">
        <!-- ลำดับ -->
        <td class="col-no">
          <input 
            type="text" 
            class="dispatch-cell-input text-center font-bold" 
            data-field="no" 
            data-row-id="${row.id}" 
            value="${row.no || index + 1}" 
          />
        </td>

        <!-- ทะเบียนรถ (ตัวเลือกที่พิมพ์แก้ไขได้อิสระ) -->
        <td class="col-plate ${plateClass}">
          <div class="plate-combobox-wrap">
            <input 
              type="text" 
              list="vehicle-plate-datalist" 
              class="dispatch-cell-input text-center font-bold dispatch-plate-input" 
              data-field="plate" 
              data-row-id="${row.id}" 
              value="${escapeHtml(row.plate || '')}" 
              placeholder="พิมพ์/เลือกทะเบียน"
              autocomplete="off"
            />
            <button 
              type="button" 
              class="btn-plate-dropdown-arrow no-print" 
              data-action="toggle-plate-menu" 
              data-row-id="${row.id}" 
              title="คลิกเพื่อเลือกทะเบียนรถจากรายการ (หรือพิมพ์เองได้)"
              tabindex="-1"
            >
              ▾
            </button>
            <div class="plate-custom-dropdown-menu no-print" id="plate-dropdown-${row.id}" style="display: none;">
              ${VEHICLE_TYPES.map(v => `
                <div 
                  class="plate-opt-item" 
                  data-plate-val="${escapeHtml(v.label)}" 
                  data-color="${v.color || 'yellow'}"
                  data-row-id="${row.id}"
                >
                  <span>${escapeHtml(v.label)}</span>
                  <span class="plate-opt-badge ${v.color || 'yellow'}">
                    ${v.color === 'green' ? '🟢 สีเขียว' : (v.color === 'yellow' ? '🟡 สีเหลือง' : '⚪ ทั่วไป')}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
        </td>

        <!-- รหัส -->
        <td class="col-code">
          <input 
            type="text" 
            list="driver-code-datalist"
            class="dispatch-cell-input text-center font-semibold" 
            data-field="driverCode" 
            data-row-id="${row.id}" 
            value="${escapeHtml(row.driverCode || '')}" 
            placeholder="#N/A"
          />
        </td>

        <!-- พนักงานขับรถ -->
        <td class="col-driver">
          <input 
            type="text" 
            list="driver-name-datalist"
            class="dispatch-cell-input text-center" 
            data-field="driverName" 
            data-row-id="${row.id}" 
            value="${escapeHtml(row.driverName || '')}" 
            placeholder=""
          />
        </td>

        <!-- เวลา -->
        <td class="col-time ${timeClass}">
          <input 
            type="text" 
            class="dispatch-cell-input text-center" 
            data-field="time" 
            data-row-id="${row.id}" 
            value="${escapeHtml(row.time || '')}" 
            placeholder=""
          />
        </td>

        <!-- ฝ่าย/แผนก -->
        <td class="col-dept">
          <input 
            type="text" 
            list="department-datalist"
            class="dispatch-cell-input text-center" 
            data-field="department" 
            data-row-id="${row.id}" 
            value="${escapeHtml(row.department || '')}" 
            placeholder=""
          />
        </td>

        <!-- ผู้จอง -->
        <td class="col-booker">
          <input 
            type="text" 
            class="dispatch-cell-input text-center" 
            data-field="booker" 
            data-row-id="${row.id}" 
            value="${escapeHtml(row.booker || '')}" 
            placeholder=""
          />
        </td>

        <!-- Non-print Actions -->
        <td class="col-actions no-print" style="background: #f8fafc; padding: 4px;">
          <div style="display: flex; gap: 3px; justify-content: center; flex-wrap: wrap;">
            <button 
              type="button" 
              class="dispatch-row-action-btn btn-pick-booker" 
              data-action="pick-booker" 
              data-row-id="${row.id}" 
              title="เลือกงานที่ Booker ส่งคำขอมาเพื่อจัดใส่รถคันนี้"
            >
              📥 งาน Booker
            </button>
            ${!showItinerary ? `
              <button 
                type="button" 
                class="dispatch-row-action-btn" 
                data-action="toggle-itinerary" 
                data-row-id="${row.id}" 
                title="เพิ่มรายละเอียดงาน/เส้นทางวิ่ง"
              >
                ➕ รายละเอียด
              </button>
            ` : ''}
            <button 
              type="button" 
              class="dispatch-row-action-btn btn-add-comment" 
              data-action="toggle-comment" 
              data-row-id="${row.id}" 
              title="ใส่คอมเม้น/หมายเหตุในงานนี้"
            >
              💬 ${hasComment ? 'แก้คอมเม้น' : '+ คอมเม้น'}
            </button>
            <button 
              type="button" 
              class="dispatch-row-action-btn" 
              data-action="toggle-plate-color" 
              data-row-id="${row.id}" 
              title="เปลี่ยนสีป้ายทะเบียน (เหลือง/เขียว/ขาว)"
            >
              🎨
            </button>
            <button 
              type="button" 
              class="dispatch-row-action-btn" 
              data-action="toggle-time-pink" 
              data-row-id="${row.id}" 
              title="ไฮไลท์สีชมพูที่ช่องเวลา"
            >
              🌸
            </button>
            <button 
              type="button" 
              class="dispatch-row-action-btn btn-del-row" 
              data-action="delete-row" 
              data-row-id="${row.id}" 
              title="ลบแถวรถนี้"
            >
              🗑️
            </button>
          </div>
        </td>
      </tr>

      <!-- Sub-row 1: Itinerary / Job Destinations & Schedule Details -->
      <!-- Rendered if has text OR if editing -->
      ${showItinerary ? `
        <tr class="dispatch-itinerary-tr" data-row-id="${row.id}">
          <td colspan="7" class="dispatch-itinerary-cell">
            <div 
              class="dispatch-itinerary-box" 
              contenteditable="true" 
              data-field="itineraryText" 
              data-row-id="${row.id}" 
              placeholder="พิมพ์รายละเอียดงาน / ส่งเอกสาร / รับเช็ค / รับ-ส่งผู้โดยสาร / เที่ยวบิน / เบอร์ติดต่อ (ขึ้นบรรทัดใหม่เพื่อแยกช่วงงาน)..."
            >${formatItineraryWithHighlights(row.itineraryText || '')}</div>
          </td>
          <td class="no-print" style="background: #f8fafc; text-align: center; font-size: 0.7rem; color: #94a3b8; vertical-align: top; padding-top: 8px;">
            <button 
              type="button" 
              class="no-print" 
              data-action="clear-itinerary" 
              data-row-id="${row.id}" 
              title="ซ่อน/ลบช่องรายละเอียดงาน"
              style="background: none; border: none; color: #94a3b8; font-size: 0.72rem; cursor: pointer;"
            >
              ✕ ซ่อน
            </button>
          </td>
        </tr>
      ` : ''}

      <!-- Sub-row 2: Comment Row (Peach background, Red text matching screenshot) -->
      ${showComment ? `
        <tr class="dispatch-comment-tr" data-row-id="${row.id}">
          <td colspan="7" class="dispatch-comment-cell">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <input 
                type="text" 
                class="dispatch-comment-input" 
                data-field="comment" 
                data-row-id="${row.id}" 
                value="${escapeHtml(row.comment || '')}" 
                placeholder="พิมพ์คอมเม้นในงานนี้ (เช่น สลับใช้งานกับแชมปิ้ง วันที่ 29/10/2569)" 
                autofocus
              />
              <button 
                type="button" 
                class="no-print" 
                data-action="clear-comment" 
                data-row-id="${row.id}" 
                title="ลบคอมเม้นนี้"
                style="background: none; border: none; color: #dc2626; font-weight: bold; cursor: pointer; padding: 2px 6px; font-size: 0.85rem;"
              >
                ✕
              </button>
            </div>
          </td>
          <td class="no-print" style="background: #fff7ed; text-align: center; font-size: 0.7rem; color: #c2410c; vertical-align: middle;">
            คอมเม้น
          </td>
        </tr>
      ` : ''}
    `;
  }

  // Render secondary tab: Booker requests list with view paper modal
  function renderRequestsListView(bookings) {
    return `
      <div class="content-card">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 700; color: #0f172a;">
              📋 รายการคำขอจองรถจาก Booker ทั้งหมด
            </h3>
            <p style="font-size: 0.85rem; color: #64748b;">
              ตรวจสอบรายละเอียดคำขอ ใบขออนุมัติใช้งานรถ และกดจัดรถลงตารางจัดรถ
            </p>
          </div>
          <button id="btn-back-to-sheet" class="btn-primary" style="font-size: 0.82rem; background: #002060;">
            📊 กลับไปยังตารางจัดรถ
          </button>
        </div>

        <div class="table-responsive">
          <table class="bookings-list-table">
            <thead>
              <tr>
                <th>รหัสคำขอ</th>
                <th>วันและเวลาที่ใช้รถ</th>
                <th>ผู้ขอ & ฝ่าย</th>
                <th>ประเภทรถที่ขอ</th>
                <th>จุดหมายปลายทาง</th>
                <th>สถานะ</th>
                <th style="text-align: center;">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              ${bookings.length === 0 ? `
                <tr>
                  <td colspan="7" style="text-align: center; padding: 2.5rem; color: #94a3b8;">
                    ไม่มีรายการคำขอจองในระบบ
                  </td>
                </tr>
              ` : bookings.map(b => {
                const uThai = formatThaiDate(b.usageDate);
                const isNeedsDispatch = b.status === 'pending_approval' || b.status === 'approved';

                return `
                  <tr style="${isNeedsDispatch ? 'background-color: #f0fdf4;' : ''}">
                    <td><strong style="color: #1e40af;">${b.id}</strong></td>
                    <td>
                      <div style="font-weight: 600;">${uThai.short}</div>
                      <div style="font-size: 0.78rem; color: #64748b;">${b.startTime} - ${b.endTime} น.</div>
                    </td>
                    <td>
                      <div><strong>${b.bookerName}</strong></div>
                      <div style="font-size: 0.75rem; color: #64748b;">${b.department}</div>
                      <div style="font-size: 0.72rem; color: #2563eb;">โทร: ${b.bookerPhone || '-'}</div>
                    </td>
                    <td>
                      <div>${b.assignedVehicle ? `🚘 <strong>${b.assignedVehicle}</strong>` : (b.requestedVehicle || '-')}</div>
                      ${b.assignedDriver ? `<div style="font-size: 0.75rem; color: #059669;">👨‍✈️ ${b.assignedDriver}</div>` : ''}
                    </td>
                    <td style="max-width: 250px; font-size: 0.82rem;">
                      ${b.itinerary && b.itinerary[0] ? b.itinerary.map(i => i.destination).filter(Boolean).join(' ➔ ') : '-'}
                    </td>
                    <td>
                      <span class="status-badge ${b.status}">
                        ${b.statusLabel || b.status}
                      </span>
                    </td>
                    <td style="text-align: center;">
                      <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                        <button class="btn-primary btn-quick-assign-to-sheet" data-id="${b.id}" style="padding: 4px 10px; font-size: 0.78rem; background: #0284c7;">
                          ⚡ จัดลงตาราง
                        </button>
                        <button class="btn-outline-blue btn-view-paper" data-id="${b.id}" style="padding: 4px 8px; font-size: 0.78rem;">
                          📄 แบบฟอร์ม
                        </button>
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

  // Attach all DOM events
  function attachGlobalEvents() {
    // Tab switching
    const tabSheet = document.getElementById('btn-tab-sheet');
    const tabList = document.getElementById('btn-tab-list');
    const backToSheet = document.getElementById('btn-back-to-sheet');

    if (tabSheet) tabSheet.addEventListener('click', () => { activeTab = 'spreadsheet'; render(); });
    if (tabList) tabList.addEventListener('click', () => { activeTab = 'requests_list'; render(); });
    if (backToSheet) backToSheet.addEventListener('click', () => { activeTab = 'spreadsheet'; render(); });

    // Date navigation
    const dateInput = document.getElementById('dispatch-date-input');
    const prevDayBtn = document.getElementById('btn-prev-day');
    const nextDayBtn = document.getElementById('btn-next-day');
    const todayBtn = document.getElementById('btn-go-today');
    const demoDateBtn = document.getElementById('btn-go-demo-date');

    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        saveCurrentSchedule();
        selectedDate = e.target.value;
        loadSchedule();
        render();
      });
    }

    if (prevDayBtn) {
      prevDayBtn.addEventListener('click', () => {
        saveCurrentSchedule();
        selectedDate = addDaysToDate(selectedDate, -1);
        loadSchedule();
        render();
      });
    }

    if (nextDayBtn) {
      nextDayBtn.addEventListener('click', () => {
        saveCurrentSchedule();
        selectedDate = addDaysToDate(selectedDate, 1);
        loadSchedule();
        render();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        saveCurrentSchedule();
        selectedDate = getTodayISODate();
        loadSchedule();
        render();
      });
    }

    if (demoDateBtn) {
      demoDateBtn.addEventListener('click', () => {
        saveCurrentSchedule();
        selectedDate = DEMO_DISPATCH_DATE;
        loadSchedule();
        render();
      });
    }

    // Top action buttons
    const addRowBtn = document.getElementById('btn-add-vehicle-row');
    if (addRowBtn) {
      addRowBtn.addEventListener('click', () => {
        const nextNo = rows.length + 1;
        rows.push({
          id: `disp-row-${Date.now()}`,
          no: String(nextNo),
          plate: 'ทะเบียน (เก๋ง)',
          plateColor: 'yellow',
          driverCode: '#N/A',
          driverName: '',
          time: '',
          timeColor: 'default',
          department: '',
          booker: '',
          itineraryText: '',
          comment: '',
          linkedBookingIds: []
        });
        saveCurrentSchedule();
        render();
        showToast('เพิ่มแถวรถใหม่แล้ว สามารถพิมพ์ระบุข้อมูลได้ทันที');
      });
    }

    const saveBtn = document.getElementById('btn-save-schedule');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        saveCurrentSchedule();
        showToast('✓ บันทึกตารางจัดรถเรียบร้อยแล้ว');
      });
    }

    const printBtn = document.getElementById('btn-print-schedule');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        saveCurrentSchedule();
        window.print();
      });
    }

    const resetBtn = document.getElementById('btn-reset-template');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('คุณต้องการรีเซ็ตตารางจัดรถของวันที่เลือกนี้ ให้ตรงตามแบบภาพตัวอย่าง (7 คัน) หรือไม่?')) {
          rows = resetDispatchScheduleToDefault(selectedDate);
          loadSchedule();
          render();
          showToast('โหลดตารางตามภาพตัวอย่างเรียบร้อยแล้ว');
        }
      });
    }

    // Inline cell inputs change listeners
    container.querySelectorAll('.dispatch-cell-input, .dispatch-comment-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const rowId = e.target.getAttribute('data-row-id');
        const field = e.target.getAttribute('data-field');
        const val = e.target.value;

        const targetRow = rows.find(r => r.id === rowId);
        if (targetRow && field) {
          targetRow[field] = val;

          // If editing plate, auto-detect color from VEHICLE_TYPES
          if (field === 'plate') {
            const matched = VEHICLE_TYPES.find(v => v.label.toLowerCase() === val.trim().toLowerCase() || v.plate.toLowerCase() === val.trim().toLowerCase());
            if (matched && matched.color) {
              targetRow.plateColor = matched.color;
              const td = e.target.closest('td.col-plate');
              if (td) {
                td.className = `col-plate plate-bg-${matched.color}`;
              }
            }
          }

          // Auto-save debounced
          debounceAutoSave();
        }
      });
    });

    // Plate combobox dropdown toggle and click to select
    container.querySelectorAll('.btn-plate-dropdown-arrow').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rowId = btn.getAttribute('data-row-id');
        const menu = document.getElementById(`plate-dropdown-${rowId}`);
        if (menu) {
          const isVisible = menu.style.display !== 'none';
          container.querySelectorAll('.plate-custom-dropdown-menu').forEach(m => { m.style.display = 'none'; });
          menu.style.display = isVisible ? 'none' : 'block';
        }
      });
    });

    container.querySelectorAll('.dispatch-plate-input').forEach(input => {
      input.addEventListener('click', (e) => {
        e.stopPropagation();
        const rowId = input.getAttribute('data-row-id');
        const menu = document.getElementById(`plate-dropdown-${rowId}`);
        if (menu && menu.style.display === 'none') {
          container.querySelectorAll('.plate-custom-dropdown-menu').forEach(m => { m.style.display = 'none'; });
          menu.style.display = 'block';
        }
      });
    });

    container.querySelectorAll('.plate-opt-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const plateVal = item.getAttribute('data-plate-val');
        const color = item.getAttribute('data-color');
        const rowId = item.getAttribute('data-row-id');
        const targetRow = rows.find(r => r.id === rowId);
        if (targetRow) {
          targetRow.plate = plateVal;
          targetRow.plateColor = color;
          saveCurrentSchedule();
          render();
        }
      });
    });

    // Close open dropdowns when clicking anywhere outside
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.plate-combobox-wrap')) {
        container.querySelectorAll('.plate-custom-dropdown-menu').forEach(m => { m.style.display = 'none'; });
      }
    };
    document.removeEventListener('click', container._outsideClickHandler);
    container._outsideClickHandler = handleOutsideClick;
    document.addEventListener('click', handleOutsideClick);

    // Contenteditable itinerary box
    container.querySelectorAll('.dispatch-itinerary-box').forEach(box => {
      box.addEventListener('input', (e) => {
        const rowId = e.target.getAttribute('data-row-id');
        const field = e.target.getAttribute('data-field');
        const val = e.target.innerText;

        const targetRow = rows.find(r => r.id === rowId);
        if (targetRow && field) {
          targetRow[field] = val;
          debounceAutoSave();
        }
      });
    });

    // Row Actions: pick-booker, toggle-comment, toggle-plate-color, toggle-time-pink, delete-row
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.getAttribute('data-action');
        const rowId = btn.getAttribute('data-row-id');
        handleRowAction(action, rowId);
      });
    });

    // Paper modal view in requests list
    container.querySelectorAll('.btn-view-paper').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const b = getAllBookings().find(x => x.id === id);
        if (b) renderPaperModal(b);
      });
    });

    // Quick assign from requests list to spreadsheet
    container.querySelectorAll('.btn-quick-assign-to-sheet').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const b = getAllBookings().find(x => x.id === id);
        if (b) {
          openBookerTargetVehiclePickerModal(b);
        }
      });
    });
  }

  // Handle single row actions
  function handleRowAction(action, rowId) {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    if (action === 'toggle-plate-menu') {
      const menu = document.getElementById(`plate-dropdown-${rowId}`);
      if (menu) {
        const isVisible = menu.style.display !== 'none';
        container.querySelectorAll('.plate-custom-dropdown-menu').forEach(m => { m.style.display = 'none'; });
        menu.style.display = isVisible ? 'none' : 'block';
      }
      return;
    } else if (action === 'pick-booker') {
      openBookerPickerModal(row);
    } else if (action === 'toggle-itinerary') {
      row.showItineraryBox = true;
      render();
    } else if (action === 'clear-itinerary') {
      row.showItineraryBox = false;
      row.itineraryText = '';
      saveCurrentSchedule();
      render();
    } else if (action === 'toggle-comment') {
      if (!row.comment && !row.showCommentBox) {
        row.showCommentBox = true;
        row.comment = 'สลับใช้งานกับแชมปิ้ง วันที่ ' + formatThaiDate(addDaysToDate(selectedDate, -1)).short;
      } else {
        row.showCommentBox = !row.showCommentBox;
      }
      saveCurrentSchedule();
      render();
    } else if (action === 'clear-comment') {
      row.comment = '';
      row.showCommentBox = false;
      saveCurrentSchedule();
      render();
    } else if (action === 'toggle-plate-color') {
      if (row.plateColor === 'yellow') row.plateColor = 'green';
      else if (row.plateColor === 'green') row.plateColor = 'default';
      else row.plateColor = 'yellow';
      saveCurrentSchedule();
      render();
    } else if (action === 'toggle-time-pink') {
      row.timeColor = row.timeColor === 'pink' ? 'default' : 'pink';
      saveCurrentSchedule();
      render();
    } else if (action === 'delete-row') {
      if (confirm(`คุณต้องการลบรถแถวที่ ${row.no} (${row.plate}) ออกจากตารางหรือไม่?`)) {
        rows = rows.filter(r => r.id !== rowId);
        // re-index no
        rows.forEach((r, idx) => { r.no = String(idx + 1); });
        saveCurrentSchedule();
        render();
        showToast('ลบแถวรถเรียบร้อยแล้ว');
      }
    }
  }

  // Booker Request Picker Modal - allows Admin to select a booking to fill into the car row
  function openBookerPickerModal(targetRow) {
    const modalId = 'booker-picker-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const allBookings = getAllBookings();
    let currentFilter = 'today'; // 'today' | 'pending' | 'all'

    function renderModalContent() {
      let filtered = allBookings;
      if (currentFilter === 'today') {
        filtered = allBookings.filter(b => b.usageDate === selectedDate);
      } else if (currentFilter === 'pending') {
        filtered = allBookings.filter(b => b.status === 'pending_approval' || b.status === 'approved');
      }

      const todayThai = formatThaiDate(selectedDate);

      return `
        <div id="${modalId}" class="booker-picker-modal-backdrop">
          <div class="booker-picker-dialog">
            <div class="booker-picker-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.3rem;">📋</span>
                <div>
                  <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0; color: #fff;">
                    เลือกงานคำขอของ Booker เพื่อจัดใส่รถคันนี้
                  </h3>
                  <p style="font-size: 0.8rem; color: #bae6fd; margin: 0;">
                    เป้าหมาย: <strong>รถลำดับที่ ${targetRow.no} (${targetRow.plate})</strong>
                  </p>
                </div>
              </div>
              <button id="btn-close-booker-picker" class="btn-ghost-light" style="font-size: 1.1rem;">✕</button>
            </div>

            <div style="background: #f1f5f9; padding: 10px 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
              <div class="role-nav-group" style="background: #e2e8f0; padding: 2px;">
                <button class="role-tab-btn ${currentFilter === 'today' ? 'active' : ''}" id="filter-picker-today" style="font-size: 0.78rem; padding: 4px 10px;">
                  📅 คำขอประจำวัน (${todayThai.short})
                </button>
                <button class="role-tab-btn ${currentFilter === 'pending' ? 'active' : ''}" id="filter-picker-pending" style="font-size: 0.78rem; padding: 4px 10px;">
                  🚨 รอจัดสรรทั้งหมด (${allBookings.filter(b => b.status === 'pending_approval' || b.status === 'approved').length})
                </button>
                <button class="role-tab-btn ${currentFilter === 'all' ? 'active' : ''}" id="filter-picker-all" style="font-size: 0.78rem; padding: 4px 10px;">
                  📋 คำขอทั้งหมด (${allBookings.length})
                </button>
              </div>

              <div style="font-size: 0.78rem; color: #64748b;">
                พบ <strong>${filtered.length}</strong> รายการ
              </div>
            </div>

            <div class="booker-picker-body">
              ${filtered.length === 0 ? `
                <div style="text-align: center; padding: 3rem; color: #94a3b8;">
                  <div style="font-size: 2.2rem; margin-bottom: 8px;">📭</div>
                  <div>ไม่พบคำขอในหมวดหมู่นี้</div>
                  <div style="font-size: 0.82rem; margin-top: 6px;">ลองคลิกแท็บ "คำขอทั้งหมด" หรือ "รอจัดสรรทั้งหมด" เพื่อเลือกงานข้ามวันได้</div>
                </div>
              ` : filtered.map(b => {
                const uDate = formatThaiDate(b.usageDate);
                const itinerarySummary = b.itinerary && b.itinerary.length > 0
                  ? b.itinerary.map((it, idx) => `${idx + 1}. ${it.destination || it.detail || ''}${it.note ? ` (${it.note})` : ''}`).filter(Boolean).join(' ➔ ')
                  : 'ไม่ได้ระบุจุดหมาย';

                return `
                  <div class="booker-card-item">
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 8px;">
                      <div>
                        <span style="font-weight: 700; color: #1e40af; font-size: 0.95rem;">${b.id}</span>
                        <span style="margin-left: 8px; font-weight: 600; color: #0f172a;">${b.bookerName}</span>
                        <span style="font-size: 0.8rem; color: #64748b;">(${b.department})</span>
                      </div>
                      <span class="status-badge ${b.status}" style="font-size: 0.75rem;">${b.statusLabel || b.status}</span>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px; font-size: 0.82rem; color: #475569; margin-bottom: 8px; background: #fff; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                      <div>📅 <strong>วันที่ใช้งาน:</strong> ${uDate.short}</div>
                      <div>⏰ <strong>เวลา:</strong> ${b.startTime} - ${b.endTime} น.</div>
                      <div>🚘 <strong>รถที่ต้องการ:</strong> ${b.requestedVehicle || '-'}</div>
                      <div>📞 <strong>เบอร์ติดต่อ:</strong> ${b.bookerPhone || '-'}</div>
                    </div>

                    <div style="font-size: 0.82rem; color: #334155; margin-bottom: 10px; line-height: 1.5;">
                      <strong>📍 เส้นทาง/งาน:</strong> ${escapeHtml(itinerarySummary)}
                      ${b.notes ? `<div style="font-size: 0.78rem; color: #64748b; margin-top: 2px;">💬 <strong>หมายเหตุ:</strong> ${escapeHtml(b.notes)}</div>` : ''}
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 8px;">
                      <button 
                        type="button" 
                        class="btn-primary btn-apply-booker-job" 
                        data-booking-id="${b.id}"
                        style="padding: 6px 14px; font-size: 0.82rem; background: #0284c7;"
                      >
                        ✓ เลือกงานนี้ใส่ในรถคันนี้
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    document.body.insertAdjacentHTML('beforeend', renderModalContent());

    function attachPickerEvents() {
      const modal = document.getElementById(modalId);
      if (!modal) return;

      const close = () => modal.remove();

      const closeBtn = document.getElementById('btn-close-booker-picker');
      if (closeBtn) closeBtn.addEventListener('click', close);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
      });

      // Filter tabs
      const fToday = document.getElementById('filter-picker-today');
      const fPending = document.getElementById('filter-picker-pending');
      const fAll = document.getElementById('filter-picker-all');

      if (fToday) fToday.addEventListener('click', () => { currentFilter = 'today'; reRenderModal(); });
      if (fPending) fPending.addEventListener('click', () => { currentFilter = 'pending'; reRenderModal(); });
      if (fAll) fAll.addEventListener('click', () => { currentFilter = 'all'; reRenderModal(); });

      // Apply buttons
      modal.querySelectorAll('.btn-apply-booker-job').forEach(btn => {
        btn.addEventListener('click', () => {
          const bId = btn.getAttribute('data-booking-id');
          const booking = allBookings.find(b => b.id === bId);
          if (booking) {
            applyBookingToRow(targetRow, booking);
            close();
          }
        });
      });
    }

    function reRenderModal() {
      const modal = document.getElementById(modalId);
      if (modal) modal.remove();
      document.body.insertAdjacentHTML('beforeend', renderModalContent());
      attachPickerEvents();
    }

    attachPickerEvents();
  }

  // Populate row with booking data
  function applyBookingToRow(row, booking) {
    // 1. Time
    if (booking.startTime) {
      row.time = booking.startTime.replace(':', '.');
    }

    // 2. Department
    if (booking.department) {
      // Map long department names to clean code if applicable
      row.department = mapDeptCode(booking.department);
    }

    // 3. Booker
    row.booker = `K.${booking.bookerName}`;

    // 4. Build itinerary text
    const stopsText = (booking.itinerary || [])
      .map(item => {
        const parts = [];
        if (item.detail) parts.push(item.detail);
        if (item.destination) parts.push(`ที่ ${item.destination}`);
        if (item.note) parts.push(`(${item.note})`);
        return parts.join(' ');
      })
      .filter(Boolean)
      .join(' / ');

    let newItinerary = stopsText;
    if (booking.notes) {
      newItinerary += `\nหมายเหตุ: ${booking.notes}`;
    }

    // If row already had itinerary, append with newline
    if (row.itineraryText && row.itineraryText.trim()) {
      row.itineraryText = `${row.itineraryText.trim()}\n${newItinerary}`;
    } else {
      row.itineraryText = newItinerary;
    }

    // Link booking ID
    if (!row.linkedBookingIds) row.linkedBookingIds = [];
    if (!row.linkedBookingIds.includes(booking.id)) {
      row.linkedBookingIds.push(booking.id);
    }

    // Update booking in store as dispatched
    updateBooking(booking.id, {
      assignedVehicle: row.plate,
      assignedDriver: row.driverName ? `${row.driverName}` : 'ฝ่ายสำนักงานจัดสรรแล้ว',
      status: 'dispatched',
      statusLabel: 'จัดรถแล้ว (ตารางจัดรถ)'
    });

    saveCurrentSchedule();
    render();
    showToast(`✓ นำข้อมูลคำขอ ${booking.id} (${booking.bookerName}) ใส่ในรถคันที่ ${row.no} เรียบร้อยแล้ว (สามารถพิมพ์แก้ไขเพิ่มเติมได้)`);
  }

  // Quick helper to map department name to abbreviation if needed
  function mapDeptCode(dept) {
    if (!dept) return '';
    if (dept.includes('บัญชีและการเงิน')) return 'ACC';
    if (dept.includes('ขายและการตลาด')) return 'SALE';
    if (dept.includes('วิศวกรรม')) return 'IT/ENG';
    if (dept.includes('ทรัพยากรบุคคล')) return 'HR';
    if (dept.includes('บริหาร')) return 'MGT/OFF';
    if (dept.includes('จัดซื้อ')) return 'PUR';
    if (dept.includes('ผลิต')) return 'PROD';
    if (dept.includes('ประกันคุณภาพ')) return 'QA';
    return dept;
  }

  // Modal to choose which vehicle when clicking from the requests list
  function openBookerTargetVehiclePickerModal(booking) {
    const modalId = 'choose-vehicle-target-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const html = `
      <div id="${modalId}" class="booker-picker-modal-backdrop">
        <div class="booker-picker-dialog" style="max-width: 520px;">
          <div class="booker-picker-header">
            <div>
              <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0; color: #fff;">
                เลือกรถที่ต้องการจัดให้คำขอ ${booking.id}
              </h3>
              <p style="font-size: 0.8rem; color: #bae6fd; margin: 0;">
                ผู้จอง: ${booking.bookerName} (${booking.department})
              </p>
            </div>
            <button id="btn-close-target-picker" class="btn-ghost-light">✕</button>
          </div>
          <div class="booker-picker-body">
            <p style="font-size: 0.85rem; color: #475569; margin-bottom: 12px;">
              กรุณาเลือกรถในตารางจัดรถวันที่ <strong>${formatThaiDate(selectedDate).short}</strong>:
            </p>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${rows.map((row, idx) => `
                <button 
                  type="button" 
                  class="btn-select-target-row" 
                  data-row-id="${row.id}" 
                  style="text-align: left; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between;"
                >
                  <div>
                    <strong>คันที่ ${row.no || idx + 1}: ${row.plate}</strong>
                    <div style="font-size: 0.78rem; color: #64748b;">คนขับ: ${row.driverName || 'ยังไม่ระบุ'} | เวลา: ${row.time || '-'}</div>
                  </div>
                  <span style="color: #0284c7; font-weight: 600;">เลือกคันนี้ ➔</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById(modalId);
    const close = () => modal.remove();

    document.getElementById('btn-close-target-picker').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    modal.querySelectorAll('.btn-select-target-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const rowId = btn.getAttribute('data-row-id');
        const targetRow = rows.find(r => r.id === rowId);
        if (targetRow) {
          applyBookingToRow(targetRow, booking);
          close();
          activeTab = 'spreadsheet';
          render();
        }
      });
    });
  }

  // Save current rows to storage
  function saveCurrentSchedule() {
    saveDispatchSchedule(selectedDate, rows);
  }

  let saveTimer = null;
  function debounceAutoSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveCurrentSchedule();
    }, 400);
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

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Format itinerary with subtle red/blue highlights matching screenshot
  function formatItineraryWithHighlights(text) {
    if (!text) return '';
    const lines = text.split('\n');
    return lines.map(line => {
      let formatted = escapeHtml(line);
      // Highlight time ranges e.g. "เวลา 13.00-16.30 น.", "เวลา 13.00 - 17.00 น.", "18.00 น."
      formatted = formatted.replace(/(เวลา\s*\d{1,2}[\.:]\d{2}\s*[-–]\s*\d{1,2}[\.:]\d{2}\s*น\.)/g, '<span style="color: #dc2626; font-weight: 600;">$1</span>');
      formatted = formatted.replace(/(\b\d{1,2}[\.:]\d{2}\s*น\.)/g, '<span style="color: #dc2626; font-weight: 600;">$1</span>');
      formatted = formatted.replace(/(เครื่องลง\s*\d{1,2}[\.:]\d{2}\s*น\.)/g, '<span style="color: #0284c7; font-weight: 600;">$1</span>');
      formatted = formatted.replace(/(ติดต่อ\s*K\.[^\/\n]+)/g, '<span style="color: #dc2626; font-weight: 600;">$1</span>');
      return `<div class="dispatch-itinerary-line">${formatted}</div>`;
    }).join('');
  }

  render();
}
