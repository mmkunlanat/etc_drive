// AdminView.js - Fleet & Dispatch Admin Portal (ตารางจัดรถ)
// Spec: Exact spreadsheet match to company vehicle dispatch sheet ("ตารางจัดรถ")
// Features: Inline editable cells, Booker request picker, Job comments, Date switcher, Print export
import {
  formatThaiDate,
  formatSubmissionTime,
  getAllBookings,
  saveAllBookings,
  updateBooking,
  VEHICLE_TYPES,
  DRIVER_POOL,
  DRIVER_CODES,
  DISPATCH_DEPARTMENTS,
  getTodayISODate,
  addDaysToDate,
  getAllDispatchSchedules,
  getDispatchSchedule,
  saveDispatchSchedule,
  getDefaultFleetDispatchRows
} from '../store.js';
import { renderPaperModal } from '../components/PaperModal.js';

export function renderAdminView(container) {
  // Current active date - default to today
  let selectedDate = getTodayISODate();
  let activeTab = 'spreadsheet'; // 'spreadsheet' | 'requests_list'
  let rows = [];
  let requestStatusFilter = 'all'; // 'all' | 'pending' | 'dispatched' | 'completed' | 'rejected'
  let requestDateFilter = 'all'; // 'all' | 'today' | 'tomorrow' | YYYY-MM-DD
  let requestSearchQuery = '';
  let searchTimer = null;

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
      linkedBookingIds: r.linkedBookingIds || [],
      vehicleStatus: r.vehicleStatus || null
    }));
  }

  // Determine if a vehicle row is available or busy
  function isRowAvailable(row) {
    if (!row) return true;
    if (row.vehicleStatus === 'available') return true;
    if (row.vehicleStatus === 'busy' || row.vehicleStatus === 'maintenance') return false;

    const hasItinerary = !!(row.itineraryText && row.itineraryText.trim());
    const hasBooker = !!(row.booker && row.booker.trim());
    const hasLinked = Array.isArray(row.linkedBookingIds) && row.linkedBookingIds.length > 0;
    const hasDriver = !!(row.driverName && row.driverName.trim() && row.driverName !== '#N/A');
    const hasTime = !!(row.time && row.time.trim());
    const hasBusyComment = !!(row.comment && /ซ่อม|ศูนย์|สลับ|เช่า|เสีย|ไม่พร้อม/i.test(row.comment.trim()));

    if (hasItinerary || hasBooker || hasLinked || hasBusyComment || (hasDriver && hasTime)) {
      return false; // ไม่ว่าง
    }
    return true; // ว่าง
  }

  // Check if a specific plate is available in the current schedule
  function isPlateAvailableInSchedule(plateLabel, allRows, excludeRowId = null) {
    if (!plateLabel) return true;
    const cleanPlate = plateLabel.trim().toLowerCase();
    const otherRows = allRows.filter(r => r.id !== excludeRowId && (r.plate || '').trim().toLowerCase() === cleanPlate);
    if (otherRows.length === 0) return true;
    return !otherRows.some(r => !isRowAvailable(r));
  }

  loadSchedule();
  syncBookingsWithSchedule();

  function render() {
    syncBookingsWithSchedule();
    const thaiDate = formatThaiDate(selectedDate);
    const bookings = getAllBookings();
    const pendingDispatchCount = bookings.filter(b => b.status === 'pending_approval' || b.status === 'approved' || b.status === 'partially_dispatched').length;

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
            <div class="admin-tab-group">
              <button id="btn-tab-sheet" type="button" class="admin-tab-pill-btn ${activeTab === 'spreadsheet' ? 'active' : ''}">
                📊 ตารางจัดรถ (Spreadsheet)
              </button>
              <button id="btn-tab-list" type="button" class="admin-tab-pill-btn ${activeTab === 'requests_list' ? 'active' : ''}">
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
      <div class="dispatch-top-toolbar no-print" style="margin-bottom: 0.75rem; background: #f8fafc; border: 1px solid #cbd5e1;">
        <div class="dispatch-date-nav">
          <span style="font-weight: 700; color: #002060; font-size: 0.95rem;">เลือกวันที่จัดรถ:</span>
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
        </div>

        <div style="font-size: 0.82rem; color: #64748b;">
          <strong>ทิป:</strong> สามารถคลิกพิมพ์แก้ไขข้อมูลในตารางได้โดยตรง / เลือกงานที่ Booker ส่งมา / ใส่คอมเมนต์ในแต่ละคัน
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
                  ยังไม่มีข้อมูลการจัดรถในวันนี้ คลิกปุ่ม <strong>+ เพิ่มรถ/แถวใหม่</strong> หรือดึงงานจาก <strong>📥 งาน Booker</strong>
                </td>
              </tr>
            ` : (() => {
        const defaultBookers = ['K.ลัดดา', 'K.สุชานรี', 'K.สมชาย', 'K.นฤมล', 'K.ภานุวัตร', 'K.วิภา'];
        const allBookings = getAllBookings();
        const bookerPool = [...defaultBookers];
        allBookings.forEach(b => {
          if (b.bookerName) {
            const f = formatBookerName(b.bookerName);
            if (f && !bookerPool.includes(f)) {
              bookerPool.push(f);
            }
          }
        });
        return rows.map((row, index) => renderVehicleRowGroup(row, index, bookerPool)).join('');
      })()}
          </tbody>
        </table>

      </div>
    `;
  }

  // Render a vehicle group (Main car row + Sub-row itinerary + Sub-row comment)
  function renderVehicleRowGroup(row, index, bookerPool = []) {
    const plateClass = row.plateColor === 'green' ? 'plate-bg-green' : (row.plateColor === 'yellow' ? 'plate-bg-yellow' : 'plate-bg-default');
    const timeClass = row.timeColor === 'pink' ? 'time-bg-pink' : '';
    const hasItinerary = !!(row.itineraryText && row.itineraryText.trim());
    const hasComment = !!(row.comment && row.comment.trim());
    const showItinerary = hasItinerary || row.showItineraryBox;
    const showComment = hasComment || row.showCommentBox;

    return `
      <!-- Main Row (Car & Assignment) -->
      <tr class="dispatch-main-tr" data-row-id="${row.id}" data-plate="${escapeHtml(row.plate || '')}">
        <!-- ลำดับ -->
        <td class="col-no">
          <input 
            type="text" 
            class="dispatch-cell-input text-center font-bold" 
            data-field="no" 
            data-row-id="${row.id}" 
            value="${row.no || index + 1}" 
          />
          <span class="cell-print-text print-only font-bold" data-field="no">${row.no || index + 1}</span>
        </td>

        <!-- ทะเบียนรถ (ตัวเลือกที่พิมพ์แก้ไขได้) -->
        <td class="col-plate ${plateClass}">
          <div class="cell-combobox-wrap">
            <input 
              type="text" 
              class="dispatch-cell-input text-center font-bold cell-combobox-input" 
              data-field="plate" 
              data-row-id="${row.id}" 
              value="${escapeHtml(row.plate || '')}" 
              placeholder="พิมพ์/เลือกทะเบียน"
              autocomplete="off"
            />
            <button 
              type="button" 
              class="btn-cell-dropdown-arrow no-print" 
              data-toggle-dropdown="plate-${row.id}" 
              tabindex="-1"
              title="เลือกทะเบียนรถ"
            >
              ▾
            </button>
            <div class="cell-dropdown-menu no-print" id="dropdown-plate-${row.id}" style="display: none; min-width: 230px;">
              ${VEHICLE_TYPES.map(v => {
      const optAvail = isPlateAvailableInSchedule(v.label, rows, row.id);
      return `
                  <div 
                    class="cell-opt-item" 
                    data-field="plate" 
                    data-val="${escapeHtml(v.label)}" 
                    data-color="${v.color || 'yellow'}" 
                    data-row-id="${row.id}"
                  >
                    <span>${escapeHtml(v.label)}</span>
                    <div style="display: flex; align-items: center; gap: 4px;">
                      <span class="opt-status-pill ${optAvail ? 'pill-avail' : 'pill-busy'}">
                        ${optAvail ? 'ว่าง' : 'ไม่ว่าง'}
                      </span>
                      <span class="cell-opt-badge ${v.color || 'yellow'}">
                        ${v.color === 'green' ? 'เขียว' : (v.color === 'yellow' ? 'เหลือง' : 'ทั่วไป')}
                      </span>
                    </div>
                  </div>
                `;
    }).join('')}
            </div>
          </div>
          <span class="cell-print-text print-only font-bold" data-field="plate">${escapeHtml(row.plate || '')}</span>
        </td>

        <!-- รหัส (ตัวเลือกที่พิมพ์แก้ไขได้) -->
        <td class="col-code">
          <div class="cell-combobox-wrap">
            <input 
              type="text" 
              class="dispatch-cell-input text-center font-semibold cell-combobox-input" 
              data-field="driverCode" 
              data-row-id="${row.id}" 
              value="${escapeHtml(row.driverCode || '')}" 
              placeholder="#N/A"
              autocomplete="off"
            />
            <button 
              type="button" 
              class="btn-cell-dropdown-arrow no-print" 
              data-toggle-dropdown="code-${row.id}" 
              tabindex="-1"
              title="เลือกรหัสคนขับ"
            >
              ▾
            </button>
            <div class="cell-dropdown-menu no-print" id="dropdown-code-${row.id}" style="display: none; min-width: 140px;">
              ${DRIVER_CODES.map(dc => `
                <div 
                  class="cell-opt-item" 
                  data-field="driverCode" 
                  data-val="${escapeHtml(dc.code)}" 
                  data-driver="${escapeHtml(dc.driverName)}"
                  data-row-id="${row.id}"
                >
                  <strong>${escapeHtml(dc.code)}</strong>
                  <span class="cell-opt-subtext">${escapeHtml(dc.driverName || '-')}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <span class="cell-print-text print-only font-semibold" data-field="driverCode">${escapeHtml(row.driverCode || '')}</span>
        </td>

        <!-- พนักงานขับรถ (ตัวเลือกที่พิมพ์แก้ไขได้) -->
        <td class="col-driver">
          <div class="cell-combobox-wrap">
            <input 
              type="text" 
              class="dispatch-cell-input text-center cell-combobox-input" 
              data-field="driverName" 
              data-row-id="${row.id}" 
              value="${escapeHtml(row.driverName || '')}" 
              placeholder="ระบุคนขับ"
              autocomplete="off"
            />
            <button 
              type="button" 
              class="btn-cell-dropdown-arrow no-print" 
              data-toggle-dropdown="driver-${row.id}" 
              tabindex="-1"
              title="เลือกพนักงานขับรถ"
            >
              ▾
            </button>
            <div class="cell-dropdown-menu no-print" id="dropdown-driver-${row.id}" style="display: none; min-width: 160px;">
              ${DRIVER_POOL.map(d => `
                <div 
                  class="cell-opt-item" 
                  data-field="driverName" 
                  data-val="${escapeHtml(d.name)}" 
                  data-code="${escapeHtml(d.code || '')}"
                  data-row-id="${row.id}"
                >
                  <span>${escapeHtml(d.name)}</span>
                  <span class="cell-opt-subtext">${d.code && d.code !== '-' ? `รหัส ${d.code}` : ''}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <span class="cell-print-text print-only" data-field="driverName">${escapeHtml(row.driverName || '')}</span>
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
          <span class="cell-print-text print-only" data-field="time">${escapeHtml(row.time || '')}</span>
        </td>

        <!-- ฝ่าย/แผนก (ตัวเลือกที่พิมพ์แก้ไขได้) -->
        <td class="col-dept">
          <div class="cell-combobox-wrap">
            <input 
              type="text" 
              class="dispatch-cell-input text-center cell-combobox-input" 
              data-field="department" 
              data-row-id="${row.id}" 
              value="${escapeHtml(row.department || '')}" 
              placeholder="ฝ่าย/แผนก"
              autocomplete="off"
            />
            <button 
              type="button" 
              class="btn-cell-dropdown-arrow no-print" 
              data-toggle-dropdown="dept-${row.id}" 
              tabindex="-1"
              title="เลือกฝ่าย/แผนก"
            >
              ▾
            </button>
            <div class="cell-dropdown-menu no-print" id="dropdown-dept-${row.id}" style="display: none; min-width: 190px;">
              ${DISPATCH_DEPARTMENTS.map(dp => `
                <div 
                  class="cell-opt-item" 
                  data-field="department" 
                  data-val="${escapeHtml(dp.code)}" 
                  data-row-id="${row.id}"
                >
                  <strong>${escapeHtml(dp.code)}</strong>
                  <span class="cell-opt-subtext">${escapeHtml(dp.label.replace(dp.code, '').replace(/[\(\)]/g, '').trim())}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <span class="cell-print-text print-only" data-field="department">${escapeHtml(row.department || '')}</span>
        </td>

        <!-- ผู้จอง (ถ้ามีมากกว่า 1 ให้ / และ ใส่ชื่อผู้จองอีกคนได้เลย) -->
        <td class="col-booker">
          <div class="cell-combobox-wrap">
            <input 
              type="text" 
              class="dispatch-cell-input text-center cell-combobox-input" 
              data-field="booker" 
              data-row-id="${row.id}" 
              value="${escapeHtml(row.booker || '')}" 
              placeholder="K.ชื่อ1/K.ชื่อ2"
              autocomplete="off"
            />
            <button 
              type="button" 
              class="btn-cell-dropdown-arrow no-print" 
              data-toggle-dropdown="booker-${row.id}" 
              tabindex="-1"
              title="เลือกชื่อผู้จอง (หากมีมากกว่า 1 คน จะใส่ / ให้อัตโนมัติ)"
            >
              ▾
            </button>
            <div class="cell-dropdown-menu no-print" id="dropdown-booker-${row.id}" style="display: none; min-width: 170px;">
              ${bookerPool.map(bName => `
                <div 
                  class="cell-opt-item" 
                  data-field="booker" 
                  data-val="${escapeHtml(bName)}" 
                  data-row-id="${row.id}"
                >
                  <strong>${escapeHtml(bName)}</strong>
                </div>
              `).join('')}
            </div>
          </div>
          <span class="cell-print-text print-only font-bold" data-field="booker">${escapeHtml(row.booker || '')}</span>
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
                class="dispatch-comment-input no-print" 
                data-field="comment" 
                data-row-id="${row.id}" 
                value="${escapeHtml(row.comment || '')}" 
                placeholder="พิมพ์คอมเม้นในงานนี้ (เช่น สลับใช้งานกับแชมปิ้ง วันที่ 29/10/2569)" 
                autofocus
              />
              <div class="dispatch-comment-print-text print-only">
                ${escapeHtml(row.comment || '')}
              </div>
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

  // Render secondary tab: Booker requests list with practical filters & dispatch actions
  function renderRequestsListView(bookings) {
    const todayIso = getTodayISODate();
    const tomorrowIso = addDaysToDate(todayIso, 1);

    const totalCount = bookings.length;
    const pendingCount = bookings.filter(b => ['pending_approval', 'approved', 'partially_dispatched'].includes(b.status)).length;
    const dispatchedCount = bookings.filter(b => b.status === 'dispatched').length;
    const completedCount = bookings.filter(b => b.status === 'completed').length;
    const rejectedCount = bookings.filter(b => b.status === 'rejected').length;

    // Filter bookings based on status, date, and search query
    let filtered = [...bookings];

    if (requestStatusFilter === 'pending') {
      filtered = filtered.filter(b => ['pending_approval', 'approved', 'partially_dispatched'].includes(b.status));
    } else if (requestStatusFilter === 'dispatched') {
      filtered = filtered.filter(b => b.status === 'dispatched');
    } else if (requestStatusFilter === 'completed') {
      filtered = filtered.filter(b => b.status === 'completed');
    } else if (requestStatusFilter === 'rejected') {
      filtered = filtered.filter(b => b.status === 'rejected');
    }

    if (requestDateFilter === 'today') {
      filtered = filtered.filter(b => b.usageDate === todayIso);
    } else if (requestDateFilter === 'tomorrow') {
      filtered = filtered.filter(b => b.usageDate === tomorrowIso);
    } else if (requestDateFilter !== 'all' && requestDateFilter) {
      filtered = filtered.filter(b => b.usageDate === requestDateFilter);
    }

    if (requestSearchQuery && requestSearchQuery.trim()) {
      const q = requestSearchQuery.trim().toLowerCase();
      filtered = filtered.filter(b => {
        const stops = (b.itinerary || []).map(i => (i.destination || '') + ' ' + (i.detail || '')).join(' ');
        return (b.id && b.id.toLowerCase().includes(q)) ||
          (b.bookerName && b.bookerName.toLowerCase().includes(q)) ||
          (b.department && b.department.toLowerCase().includes(q)) ||
          (b.bookerPhone && b.bookerPhone.includes(q)) ||
          (b.assignedVehicle && b.assignedVehicle.toLowerCase().includes(q)) ||
          (b.assignedDriver && b.assignedDriver.toLowerCase().includes(q)) ||
          stops.toLowerCase().includes(q);
      });
    }

    // Sort: งานที่ยังไม่จัดขึ้นมาอยู่ด้านบนสุด (approved, partially_dispatched, pending_approval)
    // ส่วนงานที่จัดรถแล้ว (dispatched) และงานที่เสร็จสิ้น (completed) ย้ายลงไปอยู่ด้านล่าง
    filtered.sort((a, b) => {
      const getPriority = (item) => {
        // Priority 1: อนุมัติแล้ว รอจัดรถ (ต้องการจัดลงตารางทันที)
        if (item.status === 'approved') return 1;
        // Priority 2: จัดรถแล้วบางส่วน (ยังมีงานค้างรอจัด)
        if (item.status === 'partially_dispatched') return 2;
        // Priority 3: รอหัวหน้าฝ่ายอนุมัติ
        if (item.status === 'pending_approval') return 3;
        // Priority 4: จัดรถลงตารางเรียบร้อยแล้ว
        if (item.status === 'dispatched') return 4;
        // Priority 5: เสร็จสิ้นภารกิจ
        if (item.status === 'completed') return 5;
        // Priority 6: ไม่อนุมัติ / ยกเลิก
        if (item.status === 'rejected' || item.status === 'cancelled') return 6;
        return 7;
      };

      const pA = getPriority(a);
      const pB = getPriority(b);
      if (pA !== pB) return pA - pB;

      // ในกลุ่มสถานะเดียวกัน: เรียงตามวันที่ใช้งานก่อน (วันที่ใกล้สุดขึ้นก่อน)
      if (a.usageDate && b.usageDate && a.usageDate !== b.usageDate) {
        return a.usageDate.localeCompare(b.usageDate);
      }

      // เรียงตามเวลาใช้งาน
      if (a.startTime && b.startTime && a.startTime !== b.startTime) {
        return a.startTime.localeCompare(b.startTime);
      }

      // ตามด้วยรหัสคำขอ
      return (b.id || '').localeCompare(a.id || '');
    });

    return `
      <div class="content-card">
        <!-- Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="font-size: 1.18rem; font-weight: 700; color: #002060; margin: 0; display: flex; align-items: center; gap: 8px;">
              <span>📋 คำขอจองรถจากผู้ใช้งาน (Booker Requests)</span>
            </h3>
            <p style="font-size: 0.85rem; color: #64748b; margin: 4px 0 0 0;">
              ตรวจสอบคำขออนุมัติ จัดสรรรถลงตารางรายวัน และติดตามสถานะงาน
            </p>
          </div>
          <button id="btn-back-to-sheet" class="btn-primary" style="font-size: 0.82rem; background: #002060; display: inline-flex; align-items: center; gap: 6px;">
            📊 กลับไปยังตารางจัดรถ (Spreadsheet)
          </button>
        </div>

        <!-- Filter & Search Toolbar -->
        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 1.25rem;">
          <!-- Status Tabs -->
          <div class="requests-status-tabs">
            <button type="button" class="req-status-tab-btn ${requestStatusFilter === 'all' ? 'active' : ''}" data-status="all">
              📋 คำขอทั้งหมด <span class="tab-count-pill">${totalCount}</span>
            </button>
            <button type="button" class="req-status-tab-btn ${requestStatusFilter === 'pending' ? 'active' : ''}" data-status="pending" style="${pendingCount > 0 ? 'border-color: #f59e0b;' : ''}">
              ⏳ รอจัดรถ <span class="tab-count-pill ${pendingCount > 0 ? 'badge-amber' : ''}">${pendingCount}</span>
            </button>
            <button type="button" class="req-status-tab-btn ${requestStatusFilter === 'dispatched' ? 'active' : ''}" data-status="dispatched">
              🚗 จัดรถแล้ว <span class="tab-count-pill badge-green">${dispatchedCount}</span>
            </button>
            <button type="button" class="req-status-tab-btn ${requestStatusFilter === 'completed' ? 'active' : ''}" data-status="completed">
              🏁 เสร็จสิ้น <span class="tab-count-pill">${completedCount}</span>
            </button>
            <button type="button" class="req-status-tab-btn ${requestStatusFilter === 'rejected' ? 'active' : ''}" data-status="rejected">
              ❌ ไม่อนุมัติ <span class="tab-count-pill badge-rose">${rejectedCount}</span>
            </button>
          </div>

          <!-- Date Chips & Search Box -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-size: 0.82rem; font-weight: 600; color: #475569;">📅 วันที่ใช้งาน:</span>
              <button type="button" class="req-date-chip-btn ${requestDateFilter === 'all' ? 'active' : ''}" data-date-filter="all">ทุกวัน</button>
              <button type="button" class="req-date-chip-btn ${requestDateFilter === 'today' ? 'active' : ''}" data-date-filter="today">วันนี้ (${formatThaiDate(todayIso).short})</button>
              <button type="button" class="req-date-chip-btn ${requestDateFilter === 'tomorrow' ? 'active' : ''}" data-date-filter="tomorrow">วันพรุ่งนี้ (${formatThaiDate(tomorrowIso).short})</button>
              <input 
                type="date" 
                id="req-custom-date-filter" 
                class="form-control" 
                style="font-size: 0.8rem; padding: 3px 8px; width: 140px; height: 30px;" 
                value="${['all', 'today', 'tomorrow'].includes(requestDateFilter) ? '' : requestDateFilter}" 
                title="เลือกวันที่เจาะจง" 
              />
              ${requestDateFilter !== 'all' ? `<button type="button" id="btn-clear-date-filter" class="btn-ghost-light" style="font-size: 0.75rem; color: #dc2626; padding: 2px 6px;">✕ ล้างวันที่</button>` : ''}
            </div>

            <div style="display: flex; align-items: center; gap: 8px; min-width: 260px; flex: 1; max-width: 380px;">
              <div style="position: relative; width: 100%;">
                <input 
                  type="text" 
                  id="req-search-input" 
                  class="form-control" 
                  placeholder="🔍 ค้นหารหัส, ผู้ขอ, แผนก, จุดหมาย..." 
                  value="${escapeHtml(requestSearchQuery)}" 
                  style="padding-right: 28px; font-size: 0.82rem; height: 32px;"
                />
                ${requestSearchQuery ? `<button type="button" id="btn-clear-search" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; font-size: 0.85rem; cursor: pointer; color: #94a3b8;" title="ล้างคำค้น">✕</button>` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Bookings Table -->
        <div class="table-responsive">
          <table class="bookings-list-table">
            <thead>
              <tr>
                <th style="min-width: 140px;">รหัสคำขอ & ส่งฟอร์ม</th>
                <th style="min-width: 130px;">วันและเวลาที่ใช้รถ</th>
                <th style="min-width: 140px;">ผู้ขอ & ฝ่าย</th>
                <th style="min-width: 220px;">ภารกิจ & จุดหมายปลายทาง</th>
                <th style="min-width: 150px;">รถและคนขับที่จัด</th>
                <th style="min-width: 110px;">สถานะ</th>
                <th style="text-align: center; min-width: 180px;">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `
                <tr>
                  <td colspan="7" style="text-align: center; padding: 3rem 1rem; color: #94a3b8;">
                    <div style="font-size: 1.8rem; margin-bottom: 8px;">🔍</div>
                    <div style="font-weight: 600; color: #64748b; font-size: 0.95rem;">ไม่พบรายการคำขอที่ตรงกับเงื่อนไข</div>
                    <div style="font-size: 0.82rem; margin-top: 4px; color: #94a3b8;">ลองเปลี่ยนสถานะ วันที่ใช้งาน หรือคำค้นหา</div>
                    ${(requestStatusFilter !== 'all' || requestDateFilter !== 'all' || requestSearchQuery) ? `
                      <button type="button" id="btn-reset-req-filters" class="btn-secondary" style="margin-top: 12px; font-size: 0.8rem; padding: 5px 14px;">
                        🔄 ล้างตัวกรองทั้งหมด
                      </button>
                    ` : ''}
                  </td>
                </tr>
              ` : filtered.map(b => {
      const uThai = formatThaiDate(b.usageDate);
      const isToday = b.usageDate === todayIso;
      const isTomorrow = b.usageDate === tomorrowIso;
      const isPendingDispatch = ['pending_approval', 'approved', 'partially_dispatched'].includes(b.status);
      const isDispatched = b.status === 'dispatched';
      const isCompleted = b.status === 'completed';
      const stops = (b.itinerary || []).filter(item => item.detail || item.destination);

      return `
                  <tr style="${isPendingDispatch ? 'background-color: #f0fdf4;' : ''}">
                    <td>
                      <strong style="color: #002060; font-size: 0.9rem;">${b.id}</strong>
                      <div style="font-size: 0.72rem; color: #334155; margin-top: 3px;">
                        ส่งฟอร์ม: <strong>${formatSubmissionTime(b)}</strong>
                      </div>
                      <div style="font-size: 0.68rem; color: #94a3b8;">
                        ยื่นเมื่อ ${formatThaiDate(b.bookingDate).short}
                      </div>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 4px;">
                        <span>${uThai.short}</span>
                        ${isToday ? '<span class="badge-date-tag tag-today">วันนี้</span>' : ''}
                        ${isTomorrow ? '<span class="badge-date-tag tag-tomorrow">วันพรุ่งนี้</span>' : ''}
                      </div>
                      <div style="font-size: 0.78rem; color: #64748b; margin-top: 2px;">
                        ${b.startTime} - ${b.endTime} น.
                      </div>
                    </td>
                    <td>
                      <div style="font-weight: 600; color: #0f172a;">${escapeHtml(b.bookerName)}</div>
                      <div style="font-size: 0.76rem; color: #64748b;">${escapeHtml(b.department || '-')}</div>
                      <div style="font-size: 0.72rem; color: #2563eb; margin-top: 2px;">📞 ${escapeHtml(b.bookerPhone || '-')}</div>
                    </td>
                    <td style="font-size: 0.82rem;">
                      ${stops.length === 0 ? '<span style="color: #94a3b8;">- ไม่ระบุจุดหมาย -</span>' : `
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                          ${stops.map((it, idx) => `
                            <div style="line-height: 1.35;">
                              <div style="display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap;">
                                <span style="font-weight: 700; color: #0284c7; font-size: 0.76rem;">${idx + 1}.</span>
                                <span style="color: #0f172a; font-weight: 600;">${escapeHtml(it.destination || it.detail || '')}</span>
                                ${it.time ? `<span style="font-size: 0.72rem; color: #059669; font-weight: 600; margin-left: 2px;">[${it.time} น.]</span>` : ''}
                                ${it.passengers ? `<span style="font-size: 0.72rem; color: #64748b;">(${it.passengers} คน)</span>` : ''}
                                ${it.dispatched ? `<span style="font-size: 0.68rem; color: #16a34a; font-weight: 600; margin-left: 2px;">✓</span>` : ''}
                              </div>
                              ${it.detail && it.destination && it.detail !== it.destination ? `
                                <div style="font-size: 0.74rem; color: #64748b; padding-left: 14px; margin-top: 1px; line-height: 1.3;">
                                  (${escapeHtml(it.detail)})
                                </div>
                              ` : ''}
                            </div>
                          `).join('')}
                        </div>
                      `}
                      ${b.requestedVehicle ? `
                        <div style="font-size: 0.72rem; color: #475569; margin-top: 4px; padding-top: 3px; border-top: 1px dashed #e2e8f0;">
                          ประเภทรถที่ขอ: <strong>${escapeHtml(b.requestedVehicle)}</strong>
                        </div>
                      ` : ''}
                    </td>
                    <td>
                      ${b.assignedVehicle ? `
                        <div style="font-size: 0.85rem; font-weight: 700; color: #1e3a8a; display: flex; align-items: center; gap: 4px;">
                          🚘 ${escapeHtml(b.assignedVehicle)}
                        </div>
                        ${b.assignedDriver ? `<div style="font-size: 0.76rem; color: #059669; margin-top: 2px;">👨‍✈️ ${escapeHtml(b.assignedDriver)}</div>` : ''}
                        ${b.assignedDate ? `<div style="font-size: 0.7rem; color: #64748b; margin-top: 2px;">📅 ${formatThaiDate(b.assignedDate).short}</div>` : ''}
                      ` : `
                        <div style="font-size: 0.78rem; color: #94a3b8; font-style: italic;">(ยังไม่ได้จัดรถ)</div>
                      `}
                    </td>
                    <td>
                      <span class="status-badge ${b.status}">
                        ${b.statusLabel || b.status}
                      </span>
                    </td>
                    <td style="text-align: center;">
                      <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                        ${isPendingDispatch ? `
                          <button type="button" class="btn-primary btn-quick-assign-to-sheet" data-id="${b.id}" style="padding: 5px 12px; font-size: 0.8rem; background: #0284c7; display: inline-flex; align-items: center; gap: 4px;">
                            ⚡ จัดลงตาราง
                          </button>
                        ` : ''}
                        ${isDispatched ? `
                          <button type="button" class="btn-primary btn-view-in-sheet" data-id="${b.id}" data-date="${b.assignedDate || b.usageDate}" data-vehicle="${escapeHtml(b.assignedVehicle || '')}" style="padding: 5px 10px; font-size: 0.78rem; background: #1e40af; display: inline-flex; align-items: center; gap: 4px;" title="เปิดตารางจัดรถวันที่ใช้งาน และเน้นแถวรถคันนี้">
                            📊 ดูในตาราง
                          </button>
                          <button type="button" class="btn-outline-blue btn-reassign-sheet" data-id="${b.id}" style="padding: 5px 8px; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 4px;" title="ย้ายไปรถคันอื่น">
                            🔄 ย้ายคัน
                          </button>
                          <button type="button" class="btn-danger-outline btn-unassign-dispatch" data-id="${b.id}" style="padding: 5px 8px; font-size: 0.78rem;" title="ยกเลิกการจัดรถ นำงานกลับไปรอจัดสรร">
                            ✕ ยกเลิกจัด
                          </button>
                        ` : ''}
                        ${isCompleted ? `
                          <button type="button" class="btn-outline-blue btn-view-in-sheet" data-id="${b.id}" data-date="${b.assignedDate || b.usageDate}" data-vehicle="${escapeHtml(b.assignedVehicle || '')}" style="padding: 5px 10px; font-size: 0.78rem;">
                            📊 ดูในตาราง
                          </button>
                        ` : ''}
                        <button type="button" class="btn-outline-blue btn-view-paper" data-id="${b.id}" style="padding: 5px 8px; font-size: 0.78rem;" title="เปิดดูใบขออนุมัติ">
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
        if (activeTab !== 'spreadsheet') {
          activeTab = 'spreadsheet';
          render();
        }
        saveCurrentSchedule();

        // Update all companion .cell-print-text and .dispatch-comment-print-text elements
        container.querySelectorAll('.dispatch-main-tr').forEach(tr => {
          const rowId = tr.getAttribute('data-row-id');
          const r = rows.find(x => x.id === rowId);
          if (r) {
            tr.querySelectorAll('.cell-print-text').forEach(span => {
              const field = span.getAttribute('data-field');
              if (field && r[field] !== undefined) {
                span.textContent = r[field] || '';
              }
            });
          }
        });
        container.querySelectorAll('.dispatch-comment-tr').forEach(tr => {
          const rowId = tr.getAttribute('data-row-id');
          const r = rows.find(x => x.id === rowId);
          if (r) {
            const span = tr.querySelector('.dispatch-comment-print-text');
            if (span) span.textContent = r.comment || '';
          }
        });

        // Sync input values to DOM attribute for fallback
        container.querySelectorAll('input').forEach(input => {
          input.setAttribute('value', input.value);
        });

        window.print();
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

    // Universal Cell Combobox Dropdown Toggle & Options Handler
    container.querySelectorAll('.btn-cell-dropdown-arrow').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const toggleKey = btn.getAttribute('data-toggle-dropdown');
        const menu = document.getElementById(`dropdown-${toggleKey}`);
        if (menu) {
          const isVisible = menu.style.display !== 'none';
          container.querySelectorAll('.cell-dropdown-menu').forEach(m => { m.style.display = 'none'; });
          menu.style.display = isVisible ? 'none' : 'block';
        }
      });
    });

    // Click input to open dropdown and filter as typing
    container.querySelectorAll('.cell-combobox-input').forEach(input => {
      input.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrap = input.closest('.cell-combobox-wrap');
        const menu = wrap ? wrap.querySelector('.cell-dropdown-menu') : null;
        if (menu && menu.style.display === 'none') {
          container.querySelectorAll('.cell-dropdown-menu').forEach(m => { m.style.display = 'none'; });
          menu.style.display = 'block';
        }
      });

      input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const wrap = input.closest('.cell-combobox-wrap');
        const menu = wrap ? wrap.querySelector('.cell-dropdown-menu') : null;
        if (menu) {
          menu.style.display = 'block';
          menu.querySelectorAll('.cell-opt-item').forEach(item => {
            const itemText = item.innerText.toLowerCase();
            item.style.display = itemText.includes(query) ? 'flex' : 'none';
          });
        }
      });
    });

    // Selecting an option from any combobox
    container.querySelectorAll('.cell-opt-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const field = item.getAttribute('data-field');
        const val = item.getAttribute('data-val');
        const rowId = item.getAttribute('data-row-id');
        const targetRow = rows.find(r => r.id === rowId);

        if (targetRow && field) {
          if (field === 'booker') {
            targetRow.booker = mergeBookerNames(targetRow.booker, val);
          } else {
            targetRow[field] = val;
          }

          // Smart auto-linking between fields
          if (field === 'plate') {
            targetRow.plateColor = item.getAttribute('data-color') || 'yellow';
          } else if (field === 'driverCode') {
            const linkedDriver = item.getAttribute('data-driver');
            if (linkedDriver !== undefined && linkedDriver !== null) {
              targetRow.driverName = linkedDriver;
            }
          } else if (field === 'driverName') {
            const linkedCode = item.getAttribute('data-code');
            if (linkedCode && linkedCode !== '-') {
              targetRow.driverCode = linkedCode;
            }
          }

          saveCurrentSchedule();
          render();
        }
      });
    });

    // Close open dropdowns when clicking anywhere outside
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.cell-combobox-wrap')) {
        container.querySelectorAll('.cell-dropdown-menu').forEach(m => { m.style.display = 'none'; });
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
          if (field === 'itineraryText' && val.trim() === '') {
            releaseLinkedBookings(targetRow);
            targetRow.linkedBookingIds = [];
          }
          debounceAutoSave();
        }
      });
      box.addEventListener('blur', () => {
        syncBookingsWithSchedule();
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
        if (b) {
          renderPaperModal(b, {
            onEdit: (booking) => {
              window.dispatchEvent(new CustomEvent('edit_booking_in_form', { detail: booking }));
            },
            onConfirm: (booking) => {
              showToast(`ยืนยันการตรวจสอบคำขอ ${booking.id} เรียบร้อยแล้ว`);
            }
          });
        }
      });
    });

    // Requests list filters & search events
    container.querySelectorAll('.req-status-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        requestStatusFilter = btn.getAttribute('data-status');
        render();
      });
    });

    container.querySelectorAll('.req-date-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        requestDateFilter = btn.getAttribute('data-date-filter');
        render();
      });
    });

    const customDateInput = document.getElementById('req-custom-date-filter');
    if (customDateInput) {
      customDateInput.addEventListener('change', (e) => {
        if (e.target.value) {
          requestDateFilter = e.target.value;
          render();
        }
      });
    }

    const clearDateBtn = document.getElementById('btn-clear-date-filter');
    if (clearDateBtn) {
      clearDateBtn.addEventListener('click', () => {
        requestDateFilter = 'all';
        render();
      });
    }

    const searchInput = document.getElementById('req-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        requestSearchQuery = e.target.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          render();
          const newInput = document.getElementById('req-search-input');
          if (newInput) {
            newInput.focus();
            const len = newInput.value.length;
            newInput.setSelectionRange(len, len);
          }
        }, 200);
      });
    }

    const clearSearchBtn = document.getElementById('btn-clear-search');
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        requestSearchQuery = '';
        render();
      });
    }

    const resetFiltersBtn = document.getElementById('btn-reset-req-filters');
    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', () => {
        requestStatusFilter = 'all';
        requestDateFilter = 'all';
        requestSearchQuery = '';
        render();
      });
    }

    // Requests list actions: Quick assign, Reassign, View in sheet, Unassign
    container.querySelectorAll('.btn-quick-assign-to-sheet').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const b = getAllBookings().find(x => x.id === id);
        if (b) openBookerTargetVehiclePickerModal(b);
      });
    });

    container.querySelectorAll('.btn-reassign-sheet').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const b = getAllBookings().find(x => x.id === id);
        if (b) openBookerTargetVehiclePickerModal(b);
      });
    });

    container.querySelectorAll('.btn-view-in-sheet').forEach(btn => {
      btn.addEventListener('click', () => {
        const date = btn.getAttribute('data-date');
        const vehicle = btn.getAttribute('data-vehicle');
        jumpToScheduleRow(date, vehicle);
      });
    });

    container.querySelectorAll('.btn-unassign-dispatch').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        unassignBookingFromSchedule(id);
      });
    });
  }

  // Handle single row actions
  function handleRowAction(action, rowId) {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    if (action === 'toggle-vehicle-status') {
      const currentAvail = isRowAvailable(row);
      row.vehicleStatus = currentAvail ? 'busy' : 'available';
      saveCurrentSchedule();
      render();
      showToast(`เปลี่ยนสถานะรถ ${row.plate} เป็น "${row.vehicleStatus === 'available' ? 'ว่าง' : 'ไม่ว่าง'}" เรียบร้อยแล้ว`);
      return;
    } else if (action === 'toggle-plate-menu') {
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
      releaseLinkedBookings(row);
      row.showItineraryBox = false;
      row.itineraryText = '';
      row.linkedBookingIds = [];
      saveCurrentSchedule();
      syncBookingsWithSchedule();
      render();
      showToast('✓ ล้างงานในแถวนี้แล้ว — งานเด้งกลับไปสถานะ "รอจัดสรร" เรียบร้อยแล้ว');
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
        releaseLinkedBookings(row);
        rows = rows.filter(r => r.id !== rowId);
        // re-index no
        rows.forEach((r, idx) => { r.no = String(idx + 1); });
        saveCurrentSchedule();
        syncBookingsWithSchedule();
        render();
        showToast('✓ ลบแถวรถเรียบร้อยแล้ว — งานที่ลบออกเด้งกลับไปสถานะ "รอจัดสรร" เรียบร้อยแล้ว');
      }
    }
  }

  // Release jobs back to pool if a car row is cleared or deleted
  function releaseLinkedBookings(row) {
    const allBookings = getAllBookings();
    let hasChanges = false;
    const targetIds = row.linkedBookingIds || [];
    let matchedAny = false;

    allBookings.forEach(booking => {
      const bookerFirstName = booking.bookerName ? booking.bookerName.replace(/^(นาย|นางสาว|นาง|คุณ|K\.)\s*/i, '').split(' ')[0] : '';
      const hasIdMatch = targetIds.includes(booking.id);
      const hasPlateMatch = row.plate && booking.assignedVehicle && (booking.assignedVehicle.includes(row.plate) || row.plate.includes(booking.assignedVehicle));
      const hasBookerMatch = bookerFirstName && row.booker && row.booker.includes(bookerFirstName);
      const hasItemMatch = (booking.itinerary || []).some(it =>
        it.dispatchedRowId === row.id ||
        it.dispatchedToVehicle === row.plate ||
        (row.itineraryText && it.detail && row.itineraryText.includes(it.detail.trim().slice(0, 15)))
      );

      const isMatch = hasIdMatch || hasPlateMatch || hasBookerMatch || hasItemMatch;

      if (isMatch) {
        matchedAny = true;
        if (booking.itinerary && Array.isArray(booking.itinerary)) {
          booking.itinerary.forEach(it => {
            if (isMatch || it.dispatchedRowId === row.id || it.dispatchedToVehicle === row.plate || it.dispatchedRowNo === row.no) {
              it.dispatched = false;
              delete it.dispatchedToVehicle;
              delete it.dispatchedDate;
              delete it.dispatchedRowNo;
              delete it.dispatchedRowId;
            }
          });
        }

        delete booking.isDispatchedDirectly;
        booking.status = (booking.approverSignature || booking.statusLabel?.includes('อนุมัติ')) ? 'approved' : 'pending_approval';
        booking.statusLabel = booking.status === 'approved' ? 'อนุมัติแล้ว (รอจัดสรรรถ/ยืนยัน)' : 'รอหัวหน้าฝ่ายอนุมัติ';
        booking.assignedVehicle = '';
        booking.assignedDriver = '';
        booking.assignedDriverId = '';
        hasChanges = true;
      }
    });

    // If this row had non-empty itinerary text and was not matched with any existing booking (e.g. manually entered)
    // create a booking request so that the work bounces back and is NEVER lost!
    if (!matchedAny && row.itineraryText && row.itineraryText.trim() !== '') {
      const parsedItems = row.itineraryText.split('\n')
        .flatMap(line => line.split('/'))
        .map(t => t.trim())
        .filter(t => t.length > 2)
        .map((t, idx) => ({
          no: idx + 1,
          detail: t,
          destination: '',
          dispatched: false
        }));

      if (parsedItems.length > 0) {
        const fallbackBooking = {
          id: `REQ-${Date.now().toString().slice(-6)}`,
          formCode: '',
          bookingDate: selectedDate,
          usageDate: selectedDate,
          startTime: row.time ? row.time.replace('.', ':') : '08:30',
          endTime: '17:00',
          bookerName: row.booker ? row.booker.replace(/^K\./, '') : 'ผู้จอง (จากตารางจัดรถ)',
          bookerPhone: '081-000-0000',
          department: row.department || 'สำนักงาน',
          requestedVehicle: row.plate || 'รถสำนักงาน',
          assignedVehicle: '',
          requestedDriver: 'ขอพนักงานขับรถของบริษัท',
          assignedDriver: '',
          assignedDriverId: '',
          status: 'approved',
          statusLabel: 'อนุมัติแล้ว (รอจัดสรรรถ/ยืนยัน)',
          driverJobStatus: 'not_started',
          itinerary: parsedItems,
          notes: 'งานคืนกลับจากตารางจัดรถ',
          createdAt: new Date().toISOString()
        };
        allBookings.push(fallbackBooking);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      saveAllBookings(allBookings);
    }
    row.linkedBookingIds = [];
  }

  // Synchronize bookings status with current dispatch schedules:
  // If a booking or job is not currently present in any car row in the schedule, it MUST bounce back to "รอจัด"!
  function syncBookingsWithSchedule() {
    const allBookings = getAllBookings();
    const allSchedules = getAllDispatchSchedules();
    let hasChanges = false;

    // Collect all active rows across all dates (with non-empty itinerary text)
    const activeRows = [];
    Object.keys(allSchedules).forEach(dateKey => {
      const dateRows = (dateKey === selectedDate) ? rows : (allSchedules[dateKey] || []);
      dateRows.forEach(r => {
        const text = r.itineraryText || (Array.isArray(r.itineraryLines) ? r.itineraryLines.join('\n') : '');
        if (text && text.trim() !== '') {
          activeRows.push({ ...r, itineraryText: text });
        }
      });
    });

    // Also include in-memory current rows
    rows.forEach(r => {
      const text = r.itineraryText || (Array.isArray(r.itineraryLines) ? r.itineraryLines.join('\n') : '');
      if (text && text.trim() !== '') {
        if (!activeRows.some(existing => existing.id === r.id)) {
          activeRows.push({ ...r, itineraryText: text });
        }
      }
    });

    allBookings.forEach(booking => {
      // Completed, cancelled, rejected stay as is
      if (booking.status === 'completed' || booking.status === 'cancelled' || booking.status === 'rejected') {
        return;
      }

      const bookerFirstName = booking.bookerName ? booking.bookerName.replace(/^(นาย|นางสาว|นาง|คุณ|K\.)\s*/i, '').split(' ')[0] : '';

      // Find any active row in schedule referencing this booking
      const referencingRows = activeRows.filter(r => {
        const hasId = r.linkedBookingIds && Array.isArray(r.linkedBookingIds) && r.linkedBookingIds.includes(booking.id);
        const hasBooker = bookerFirstName && r.booker && r.booker.includes(bookerFirstName);
        return hasId || hasBooker;
      });

      const validItems = (booking.itinerary || []).filter(it => it.detail || it.destination);

      if (validItems.length > 0) {
        let dispatchedCount = 0;

        validItems.forEach(it => {
          let isItemScheduled = false;

          if (referencingRows.length > 0) {
            const detailSnippet = (it.detail || '').trim().substring(0, 15);
            const destSnippet = (it.destination || '').trim().substring(0, 15);

            isItemScheduled = referencingRows.some(r => {
              if (it.dispatchedRowId && r.id === it.dispatchedRowId) return true;
              if (detailSnippet && r.itineraryText.includes(detailSnippet)) return true;
              if (destSnippet && r.itineraryText.includes(destSnippet)) return true;
              if (r.linkedBookingIds && r.linkedBookingIds.includes(booking.id)) {
                if (it.dispatchedToVehicle && (r.plate === it.dispatchedToVehicle || r.id === it.dispatchedRowId)) {
                  return true;
                }
              }
              return false;
            });
          }

          if (isItemScheduled) {
            if (!it.dispatched) {
              it.dispatched = true;
              hasChanges = true;
            }
            dispatchedCount++;
          } else {
            // Item is NOT currently scheduled in any car row -> BOUNCE BACK!
            if (it.dispatched) {
              it.dispatched = false;
              delete it.dispatchedToVehicle;
              delete it.dispatchedDate;
              delete it.dispatchedRowNo;
              delete it.dispatchedRowId;
              hasChanges = true;
            }
          }
        });

        // Update overall booking status
        if (dispatchedCount === 0) {
          // All jobs unassigned: bounce back to "รอจัด"
          const targetStatus = (booking.approverSignature || booking.statusLabel?.includes('อนุมัติ')) ? 'approved' : 'pending_approval';
          const targetLabel = targetStatus === 'approved' ? 'อนุมัติแล้ว (รอจัดสรรรถ/ยืนยัน)' : 'รอหัวหน้าฝ่ายอนุมัติ';
          if (booking.status !== targetStatus || booking.statusLabel !== targetLabel) {
            booking.status = targetStatus;
            booking.statusLabel = targetLabel;
            booking.assignedVehicle = '';
            booking.assignedDriver = '';
            booking.assignedDriverId = '';
            delete booking.isDispatchedDirectly;
            hasChanges = true;
          }
        } else if (dispatchedCount < validItems.length) {
          // Partially assigned
          const partialLabel = `จัดรถแล้วบางส่วน (${dispatchedCount}/${validItems.length} งาน)`;
          if (booking.status !== 'partially_dispatched' || booking.statusLabel !== partialLabel) {
            booking.status = 'partially_dispatched';
            booking.statusLabel = partialLabel;
            hasChanges = true;
          }
        } else {
          // Fully assigned
          if (booking.status !== 'dispatched') {
            booking.status = 'dispatched';
            booking.statusLabel = 'จัดรถแล้ว (ตารางจัดรถ)';
            hasChanges = true;
          }
        }
      } else {
        // Booking without itinerary array
        const isScheduled = referencingRows.length > 0;
        if (!isScheduled) {
          const targetStatus = (booking.approverSignature || booking.statusLabel?.includes('อนุมัติ')) ? 'approved' : 'pending_approval';
          const targetLabel = targetStatus === 'approved' ? 'อนุมัติแล้ว (รอจัดสรรรถ/ยืนยัน)' : 'รอหัวหน้าฝ่ายอนุมัติ';
          if (booking.status !== targetStatus || booking.statusLabel !== targetLabel) {
            booking.status = targetStatus;
            booking.statusLabel = targetLabel;
            booking.assignedVehicle = '';
            booking.assignedDriver = '';
            delete booking.isDispatchedDirectly;
            hasChanges = true;
          }
        } else {
          if (booking.status !== 'dispatched') {
            booking.status = 'dispatched';
            booking.statusLabel = 'จัดรถแล้ว (ตารางจัดรถ)';
            hasChanges = true;
          }
        }
      }
    });

    if (hasChanges) {
      saveAllBookings(allBookings);
    }
    return allBookings;
  }

  // Helper to extract ONLY undispatched jobs for a booking
  function getUndispatchedJobs(booking) {
    if (booking.status === 'completed' || booking.status === 'cancelled' || booking.status === 'rejected') {
      return [];
    }
    const rawItinerary = booking.itinerary || [];
    const validItems = rawItinerary.filter(it => it.detail || it.destination);
    if (validItems.length === 0) {
      if (booking.status !== 'dispatched') {
        return [{
          no: 1,
          detail: booking.requestedVehicle || 'คำขอใช้รถทั่วไป',
          destination: booking.notes || 'ตามที่ระบุในแบบฟอร์ม',
          time: booking.startTime || '',
          note: '',
          isSynthetic: true
        }];
      }
      return [];
    }
    return validItems.filter(it => !it.dispatched);
  }

  // Booker Request Picker Modal - allows Admin to select undispatched jobs to fill into the car row
  function openBookerPickerModal(targetRow) {
    const modalId = 'booker-picker-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    syncBookingsWithSchedule();
    const allBookings = getAllBookings();

    // Default to 'today' if today has pending jobs, otherwise default to 'pending' to always show available work
    const undispatchedInit = allBookings.filter(b => getUndispatchedJobs(b).length > 0);
    const countTodayInit = undispatchedInit.filter(b => b.usageDate === selectedDate).length;
    let currentFilter = countTodayInit > 0 ? 'today' : 'pending';

    function renderModalContent() {
      // Filter out bookings that have no undispatched jobs left
      const undispatchedBookings = allBookings.filter(b => getUndispatchedJobs(b).length > 0);

      const countToday = undispatchedBookings.filter(b => b.usageDate === selectedDate).length;
      const countPending = undispatchedBookings.filter(b => b.status === 'pending_approval' || b.status === 'approved' || b.status === 'partially_dispatched').length;
      const countAll = undispatchedBookings.length;

      let filtered = undispatchedBookings;
      if (currentFilter === 'today') {
        filtered = undispatchedBookings.filter(b => b.usageDate === selectedDate);
        if (filtered.length === 0 && countPending > 0) {
          filtered = undispatchedBookings.filter(b => b.status === 'pending_approval' || b.status === 'approved' || b.status === 'partially_dispatched');
        }
      } else if (currentFilter === 'pending') {
        filtered = undispatchedBookings.filter(b => b.status === 'pending_approval' || b.status === 'approved' || b.status === 'partially_dispatched');
      }

      const todayThai = formatThaiDate(selectedDate);

      return `
        <div id="${modalId}" class="booker-picker-modal-backdrop">
          <div class="booker-picker-dialog" style="max-height: 92vh; display: flex; flex-direction: column;">
            <!-- Modal Header -->
            <div class="booker-picker-header" style="flex-shrink: 0;">
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

            <!-- Filter Tabs -->
            <div style="background: #f1f5f9; padding: 10px 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; flex-shrink: 0;">
              <div class="admin-tab-group" style="background: #e2e8f0; padding: 2px;">
                <button type="button" class="admin-tab-pill-btn ${currentFilter === 'today' ? 'active' : ''}" id="filter-picker-today" style="font-size: 0.78rem; padding: 4px 10px;">
                  📅 คำขอประจำวัน (${countToday})
                </button>
                <button type="button" class="admin-tab-pill-btn ${currentFilter === 'pending' ? 'active' : ''}" id="filter-picker-pending" style="font-size: 0.78rem; padding: 4px 10px;">
                  🚨 รอจัดสรรทั้งหมด (${countPending})
                </button>
                <button type="button" class="admin-tab-pill-btn ${currentFilter === 'all' ? 'active' : ''}" id="filter-picker-all" style="font-size: 0.78rem; padding: 4px 10px;">
                  📋 คำขอทั้งหมด (${countAll})
                </button>
              </div>

              <div style="font-size: 0.78rem; color: #64748b;">
                พบงานที่ยังไม่ได้จัด <strong>${filtered.length}</strong> คำขอ
              </div>
            </div>

            <!-- Modal Body (List of bookings with ONLY undispatched jobs) -->
            <div class="booker-picker-body" style="flex: 1; overflow-y: auto; padding: 16px 20px;">
              ${filtered.length === 0 ? `
                <div style="text-align: center; padding: 3rem; color: #94a3b8;">
                  <div style="font-size: 2.2rem; margin-bottom: 8px;">🎉</div>
                  <div style="font-weight: 600; color: #475569; font-size: 1rem;">ไม่มีงานค้างรอจัดในหมวดหมู่นี้</div>
                  <div style="font-size: 0.82rem; margin-top: 6px; color: #94a3b8;">
                    งานทั้งหมดได้รับการจัดรถเรียบร้อยแล้ว หรือคลิกแท็บ "คำขอทั้งหมด" เพื่อดูงานวันอื่น
                  </div>
                </div>
              ` : filtered.map(b => {
        const uDate = formatThaiDate(b.usageDate);
        const undispatchedItems = getUndispatchedJobs(b);

        return `
                  <div class="booker-card-item" id="card-${b.id}" style="margin-bottom: 14px; background: #fff; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 12px 16px;">
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 8px;">
                      <div>
                        <span style="font-weight: 700; color: #1e40af; font-size: 0.95rem;">${b.id}</span>
                        <span style="margin-left: 8px; font-weight: 600; color: #0f172a;">${b.bookerName}</span>
                        <span style="font-size: 0.8rem; color: #64748b;">(ฝ่าย: ${b.department})</span>
                      </div>
                      <span class="status-badge ${b.status}" style="font-size: 0.75rem;">${b.statusLabel || b.status}</span>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 6px; font-size: 0.82rem; color: #475569; margin-bottom: 10px; background: #f8fafc; padding: 6px 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                      <div>📅 <strong>วันที่ใช้งาน:</strong> ${uDate.short}</div>
                      <div>⏰ <strong>เวลา:</strong> ${b.startTime} - ${b.endTime} น.</div>
                      <div>🚘 <strong>รถที่ต้องการ:</strong> ${b.requestedVehicle || '-'}</div>
                      <div>📞 <strong>โทร:</strong> ${b.bookerPhone || '-'}</div>
                    </div>

                    <!-- แสดงตัวเลือกลำดับงานที่ยังไม่ได้จัด -->
                    <div style="background: #ffffff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 12px;">
                      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; gap: 6px;">
                        <span style="font-weight: 700; color: #1e3a8a; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">
                          <span>📍</span> ตัวเลือกลำดับงานที่ยังไม่ได้จัด (${undispatchedItems.length} งาน):
                        </span>
                        <div style="display: flex; gap: 6px;">
                          <button type="button" class="btn-check-all-jobs" data-booking-id="${b.id}" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-weight: 600;">
                            ✓ เลือกทั้งหมด (${undispatchedItems.length})
                          </button>
                          <button type="button" class="btn-uncheck-all-jobs" data-booking-id="${b.id}" style="background: #f8fafc; border: 1px solid #cbd5e1; color: #64748b; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; cursor: pointer;">
                            ✕ ล้าง
                          </button>
                        </div>
                      </div>

                      <div style="display: flex; flex-direction: column; gap: 6px;">
                        ${undispatchedItems.map((item, idx) => {
          const itemNo = item.no || idx + 1;
          const cleanJobDesc = [
            item.detail ? item.detail.trim() : '',
            item.destination ? `ที่ ${item.destination.trim()}` : '',
            item.time ? `(เวลา ${item.time} น.)` : '',
            item.note ? `[${item.note.trim()}]` : ''
          ].filter(Boolean).join(' ');

          return `
                            <div class="job-choice-row" data-target-chk="chk-${b.id}-${itemNo}" style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                              <input 
                                type="checkbox" 
                                id="chk-${b.id}-${itemNo}"
                                class="job-picker-checkbox job-chk-${b.id}" 
                                data-booking-id="${b.id}" 
                                data-item-no="${itemNo}" 
                                style="cursor: pointer; width: 18px; height: 18px; flex-shrink: 0;" 
                              />
                              <label for="chk-${b.id}-${itemNo}" style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; margin: 0; font-size: 0.85rem;">
                                <span style="font-weight: 700; color: #1e40af; background: #dbeafe; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap;">
                                  ลำดับที่ ${itemNo}
                                </span>
                                <span style="color: #1e293b; line-height: 1.4;">${escapeHtml(cleanJobDesc)}</span>
                              </label>
                            </div>
                          `;
        }).join('')}
                      </div>
                    </div>
                  </div>
                `;
      }).join('')}
            </div>

            <!-- Modal Footer: Single button at the bottom right corner as requested -->
            <div class="booker-picker-footer" style="padding: 12px 24px; background: #ffffff; border-top: 1.5px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; box-shadow: 0 -4px 12px rgba(0,0,0,0.04);">
              <div id="picker-selection-info" style="font-size: 0.88rem; color: #475569; display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #0284c7;"></span>
                <span>เลือกลำดับงานแล้ว: <strong id="lbl-selected-count" style="color: #0284c7; font-size: 1rem;">0</strong> รายการ</span>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <button 
                  type="button" 
                  id="btn-cancel-picker" 
                  style="padding: 9px 18px; font-size: 0.85rem; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; color: #64748b; background: #fff; font-weight: 600;"
                >
                  ยกเลิก
                </button>
                <button 
                  type="button" 
                  id="btn-apply-selected-jobs-main" 
                  class="btn-primary" 
                  style="padding: 9px 24px; font-size: 0.92rem; background: #0284c7; font-weight: 700; border-radius: 6px; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.35); cursor: pointer;"
                >
                  ✓ ดึงลำดับงานที่เลือก ใส่ในรถคันที่ ${targetRow.no}
                </button>
              </div>
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
      const cancelBtn = document.getElementById('btn-cancel-picker');
      if (closeBtn) closeBtn.addEventListener('click', close);
      if (cancelBtn) cancelBtn.addEventListener('click', close);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
      });

      // Update selection count & highlights
      const updateSelectionCounter = () => {
        const checked = modal.querySelectorAll('.job-picker-checkbox:checked');
        const countSpan = document.getElementById('lbl-selected-count');
        if (countSpan) countSpan.textContent = String(checked.length);

        modal.querySelectorAll('.job-choice-row').forEach(rowEl => {
          const chkId = rowEl.getAttribute('data-target-chk');
          const chk = document.getElementById(chkId);
          if (chk && chk.checked) {
            rowEl.style.background = '#eff6ff';
            rowEl.style.borderColor = '#93c5fd';
          } else {
            rowEl.style.background = '#f8fafc';
            rowEl.style.borderColor = '#e2e8f0';
          }
        });
      };

      // Checkbox changes
      modal.querySelectorAll('.job-picker-checkbox').forEach(chk => {
        chk.addEventListener('change', updateSelectionCounter);
      });

      // Filter tabs
      const fToday = document.getElementById('filter-picker-today');
      const fPending = document.getElementById('filter-picker-pending');
      const fAll = document.getElementById('filter-picker-all');

      if (fToday) fToday.addEventListener('click', () => { currentFilter = 'today'; reRenderModal(); });
      if (fPending) fPending.addEventListener('click', () => { currentFilter = 'pending'; reRenderModal(); });
      if (fAll) fAll.addEventListener('click', () => { currentFilter = 'all'; reRenderModal(); });

      // Check all / uncheck all jobs for a booking
      modal.querySelectorAll('.btn-check-all-jobs').forEach(btn => {
        btn.addEventListener('click', () => {
          const bId = btn.getAttribute('data-booking-id');
          modal.querySelectorAll(`.job-chk-${bId}`).forEach(chk => { chk.checked = true; });
          updateSelectionCounter();
        });
      });

      modal.querySelectorAll('.btn-uncheck-all-jobs').forEach(btn => {
        btn.addEventListener('click', () => {
          const bId = btn.getAttribute('data-booking-id');
          modal.querySelectorAll(`.job-chk-${bId}`).forEach(chk => { chk.checked = false; });
          updateSelectionCounter();
        });
      });

      // Single apply button at the bottom right corner
      const applyBtn = document.getElementById('btn-apply-selected-jobs-main');
      if (applyBtn) {
        applyBtn.addEventListener('click', () => {
          const checkedBoxes = Array.from(modal.querySelectorAll('.job-picker-checkbox:checked'));
          if (checkedBoxes.length === 0) {
            alert(`กรุณาเลือกลำดับงานอย่างน้อย 1 งาน เพื่อจัดใส่ในรถคันที่ ${targetRow.no}`);
            return;
          }

          // Group checked jobs by bookingId
          const selections = {};
          checkedBoxes.forEach(chk => {
            const bId = chk.getAttribute('data-booking-id');
            const itemNo = parseInt(chk.getAttribute('data-item-no'), 10);
            if (!selections[bId]) selections[bId] = [];
            selections[bId].push(itemNo);
          });

          const allCollectedTexts = [];

          Object.keys(selections).forEach(bId => {
            const booking = allBookings.find(b => b.id === bId);
            if (!booking) return;

            // Fill basic vehicle row fields if empty
            if (booking.startTime && (!targetRow.time || targetRow.time.trim() === '')) {
              targetRow.time = booking.startTime.replace(':', '.');
            }
            if (booking.department && (!targetRow.department || targetRow.department.trim() === '')) {
              targetRow.department = mapDeptCode(booking.department);
            }
            targetRow.booker = mergeBookerNames(targetRow.booker, booking.bookerName);

            // Extract and mark selected jobs as dispatched
            const selectedItemNos = selections[bId];
            const pickedStops = [];

            if (booking.itinerary && booking.itinerary.length > 0) {
              booking.itinerary.forEach(it => {
                const itNo = it.no || 1;
                if (selectedItemNos.includes(itNo)) {
                  it.dispatched = true;
                  it.dispatchedToVehicle = targetRow.plate;
                  it.dispatchedDate = selectedDate;
                  it.dispatchedRowNo = targetRow.no;
                  it.dispatchedRowId = targetRow.id;
                  pickedStops.push(it);
                }
              });

              // Check if all items in this booking are dispatched
              const remaining = booking.itinerary.filter(it => (it.detail || it.destination) && !it.dispatched);
              if (remaining.length === 0) {
                booking.status = 'dispatched';
                booking.statusLabel = 'จัดรถแล้ว (ตารางจัดรถ)';
              } else {
                booking.status = 'partially_dispatched';
                booking.statusLabel = `จัดรถแล้วบางส่วน (${booking.itinerary.length - remaining.length}/${booking.itinerary.length} งาน)`;
              }
            } else {
              booking.status = 'dispatched';
              booking.statusLabel = 'จัดรถแล้ว (ตารางจัดรถ)';
              booking.isDispatchedDirectly = true;
              pickedStops.push({
                detail: booking.requestedVehicle || 'เดินทางทั่วไป',
                destination: booking.notes || ''
              });
            }

            booking.assignedVehicle = targetRow.plate;
            booking.assignedDriver = targetRow.driverName ? `${targetRow.driverName}` : 'ฝ่ายสำนักงานจัดสรรแล้ว';
            updateBooking(booking.id, booking);

            // Build text for this booking's picked stops
            const stopsText = pickedStops.map(item => {
              const parts = [];
              if (item.detail) parts.push(item.detail.trim());
              if (item.destination) parts.push(`ที่ ${item.destination.trim()}`);
              if (item.time) parts.push(`เวลา ${item.time} น.`);
              return parts.join(' ');
            }).filter(Boolean).join(' / ');

            if (stopsText) {
              allCollectedTexts.push(stopsText);
            }

            if (!targetRow.linkedBookingIds) targetRow.linkedBookingIds = [];
            if (!targetRow.linkedBookingIds.includes(booking.id)) {
              targetRow.linkedBookingIds.push(booking.id);
            }
          });

          // Save all bookings
          saveAllBookings(allBookings);

          // Append or set itinerary text
          const combinedNewText = allCollectedTexts.join('\n');
          if (targetRow.itineraryText && targetRow.itineraryText.trim()) {
            targetRow.itineraryText = `${targetRow.itineraryText.trim()}\n${combinedNewText}`;
          } else {
            targetRow.itineraryText = combinedNewText;
          }
          targetRow.showItineraryBox = true;

          saveCurrentSchedule();
          close();
          render();
          showToast(`✓ ดึงลำดับงานที่เลือก (${checkedBoxes.length} รายการ) ใส่ในรถคันที่ ${targetRow.no} เรียบร้อยแล้ว`);
        });
      }
    }

    function reRenderModal() {
      const modal = document.getElementById(modalId);
      if (modal) modal.remove();
      document.body.insertAdjacentHTML('beforeend', renderModalContent());
      attachPickerEvents();
    }

    attachPickerEvents();
  }

  // Populate row with booking data - ONLY undispatched job legs
  function applyBookingToRow(row, booking, selectedJobIndices = null, targetDate = null) {
    if (booking.startTime && (!row.time || row.time.trim() === '')) {
      row.time = booking.startTime.replace(':', '.');
    }
    if (booking.department && (!row.department || row.department.trim() === '')) {
      row.department = mapDeptCode(booking.department);
    }
    row.booker = mergeBookerNames(row.booker, booking.bookerName);

    const allStops = (booking.itinerary || []).filter(item => item.detail || item.destination);
    const activeStops = (selectedJobIndices && Array.isArray(selectedJobIndices) && selectedJobIndices.length > 0)
      ? selectedJobIndices.map(idx => allStops[idx]).filter(Boolean)
      : allStops.filter(it => !it.dispatched);

    const effectiveDate = targetDate || booking.usageDate || selectedDate;

    activeStops.forEach(it => {
      it.dispatched = true;
      it.dispatchedToVehicle = row.plate;
      it.dispatchedDate = effectiveDate;
      it.dispatchedRowNo = row.no;
      it.dispatchedRowId = row.id;
    });

    const stopsText = activeStops.map(item => {
      const parts = [];
      if (item.detail) parts.push(item.detail.trim());
      if (item.destination) parts.push(`ที่ ${item.destination.trim()}`);
      if (item.time) parts.push(`เวลา ${item.time} น.`);
      return parts.join(' ');
    }).filter(Boolean).join(' / ');

    if (row.itineraryText && row.itineraryText.trim()) {
      row.itineraryText = `${row.itineraryText.trim()}\n${stopsText}`;
    } else {
      row.itineraryText = stopsText;
    }
    row.showItineraryBox = true;

    if (!row.linkedBookingIds) row.linkedBookingIds = [];
    if (!row.linkedBookingIds.includes(booking.id)) {
      row.linkedBookingIds.push(booking.id);
    }

    const remaining = (booking.itinerary || []).filter(it => (it.detail || it.destination) && !it.dispatched);
    if (remaining.length === 0) {
      booking.status = 'dispatched';
      booking.statusLabel = 'จัดรถแล้ว (ตารางจัดรถ)';
    } else {
      booking.status = 'partially_dispatched';
      booking.statusLabel = `จัดรถแล้วบางส่วน (${booking.itinerary.length - remaining.length}/${booking.itinerary.length} งาน)`;
    }
    booking.assignedVehicle = row.plate;
    booking.assignedDriver = row.driverName ? `${row.driverName}` : 'ฝ่ายสำนักงานจัดสรรแล้ว';
    booking.assignedDate = effectiveDate;
    updateBooking(booking.id, booking);
  }

  // Helper to format booker name with K. (e.g. "ลัดดา" -> "K.ลัดดา")
  function formatBookerName(name) {
    if (!name) return '';
    let clean = name.trim();
    if (clean.startsWith('K.') || clean.startsWith('k.')) {
      return clean;
    }
    if (clean.startsWith('คุณ')) {
      return `K.${clean.replace(/^คุณ\s*/, '')}`;
    }
    clean = clean.replace(/^(นาย|นางสาว|นาง)\s*/, '');
    const firstName = clean.split(' ')[0];
    return `K.${firstName}`;
  }

  // Helper to merge booker names: if more than 1, separate with "/" without duplicating (e.g. "K.ลัดดา/K.สุชานรี")
  function mergeBookerNames(existing, newBooker) {
    const newFormatted = formatBookerName(newBooker);
    if (!newFormatted) return existing || '';
    if (!existing || existing.trim() === '') {
      return newFormatted;
    }
    // Check if new name already exists in existing string to prevent duplicates
    const rawNew = newFormatted.replace(/^K\./i, '').trim();
    if (existing.includes(rawNew)) {
      return existing;
    }
    return `${existing.trim()}/${newFormatted}`;
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

    let targetDate = booking.usageDate || selectedDate;
    let targetRows = getDispatchSchedule(targetDate);
    if (!targetRows || targetRows.length === 0) {
      targetRows = getDefaultFleetDispatchRows();
    }

    const stops = (booking.itinerary || []).filter(item => item.detail || item.destination);

    function renderModalContent() {
      return `
        <div class="booker-picker-header">
          <div>
            <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0; color: #fff; display: flex; align-items: center; gap: 6px;">
              <span>⚡ จัดสรรรถลงตารางสำหรับคำขอ ${booking.id}</span>
            </h3>
            <p style="font-size: 0.8rem; color: #bae6fd; margin: 3px 0 0 0;">
              ผู้ขอ: <strong>${escapeHtml(booking.bookerName)}</strong> (${escapeHtml(booking.department || '-')}) | เวลา: ${booking.startTime} - ${booking.endTime} น.
            </p>
          </div>
          <button id="btn-close-target-picker" class="btn-ghost-light" style="font-size: 1.1rem; padding: 4px 8px;">✕</button>
        </div>

        <div class="booker-picker-body">
          <!-- Target Date Bar -->
          <div style="display: flex; align-items: center; justify-content: space-between; background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
            <div>
              <span style="font-weight: 700; color: #1e40af; font-size: 0.88rem;">📅 วันที่จัดลงตาราง:</span>
              <strong style="color: #0f172a; margin-left: 6px; font-size: 0.95rem;">${formatThaiDate(targetDate).long}</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <label for="picker-change-target-date" style="font-size: 0.8rem; color: #475569;">เปลี่ยนวันที่:</label>
              <input 
                type="date" 
                id="picker-change-target-date" 
                value="${targetDate}" 
                style="font-size: 0.82rem; padding: 3px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;"
              />
            </div>
          </div>

          <!-- Stops / Itinerary Checklist -->
          ${stops.length > 0 ? `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: 700; font-size: 0.84rem; color: #1e3a8a;">
                  เลือกรายการภารกิจ / จุดหมายที่ต้องการจัดลงรถคันนี้:
                </span>
                <div style="display: flex; gap: 8px;">
                  <button type="button" id="btn-target-select-all" style="background: none; border: none; color: #2563eb; font-size: 0.75rem; cursor: pointer; text-decoration: underline; font-weight: 600;">เลือกทั้งหมด</button>
                  <button type="button" id="btn-target-unselect-all" style="background: none; border: none; color: #64748b; font-size: 0.75rem; cursor: pointer; text-decoration: underline;">ล้างเลือก</button>
                </div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${stops.map((st, idx) => `
                  <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 0.82rem; cursor: pointer; background: #ffffff; padding: 7px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <input type="checkbox" class="target-stop-chk" data-index="${idx}" ${st.dispatched ? '' : 'checked'} style="margin-top: 3px;" />
                    <div style="flex: 1;">
                      <div style="display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap;">
                        <span style="font-weight: 700; color: #0284c7;">${idx + 1}.</span>
                        <strong style="color: #0f172a;">${escapeHtml(st.destination || st.detail || '')}</strong>
                        ${st.time ? `<span style="color: #059669; font-weight: 600; margin-left: 6px; font-size: 0.76rem;">⏱️ ${st.time} น.</span>` : ''}
                        ${st.passengers ? `<span style="color: #64748b; margin-left: 4px; font-size: 0.76rem;">👥 ${st.passengers} คน</span>` : ''}
                        ${st.dispatched ? `<span style="color: #dc2626; font-size: 0.72rem; margin-left: 6px; font-weight: 600;">[จัดให้ ${st.dispatchedToVehicle || ''} แล้ว]</span>` : ''}
                      </div>
                      ${st.detail && st.destination && st.detail !== st.destination ? `
                        <div style="font-size: 0.74rem; color: #64748b; margin-top: 2px; padding-left: 14px; line-height: 1.3;">
                          (${escapeHtml(st.detail)})
                        </div>
                      ` : ''}
                    </div>
                  </label>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Available Vehicles in Schedule -->
          <div style="margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: 700; font-size: 0.88rem; color: #002060;">
              เลือกรถในตารางวันที่ ${formatThaiDate(targetDate).short} (${targetRows.length} คัน):
            </span>
          </div>

          <div class="target-vehicles-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 380px; overflow-y: auto;">
            ${targetRows.map((row, idx) => {
        const rowAvail = isRowAvailable(row);
        const plateClass = row.plateColor === 'green' ? 'plate-bg-green' : (row.plateColor === 'yellow' ? 'plate-bg-yellow' : 'plate-bg-default');
        return `
                <div class="target-vehicle-card" style="border: 1.5px solid ${rowAvail ? '#86efac' : '#cbd5e1'}; border-radius: 8px; background: ${rowAvail ? '#f0fdf4' : '#ffffff'}; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; transition: all 0.15s ease;">
                  <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <span class="${plateClass}" style="padding: 2px 8px; border-radius: 4px; font-weight: 800; font-size: 0.95rem; border: 1px solid rgba(0,0,0,0.15);">
                        คันที่ ${row.no || idx + 1}: ${escapeHtml(row.plate || '')}
                      </span>
                      <span class="target-picker-status-tag ${rowAvail ? 'tag-avail' : 'tag-busy'}">
                        ${rowAvail ? '🟢 ว่าง พร้อมจัด' : '🟡 มีงานแล้ว'}
                      </span>
                      ${row.driverName ? `<span style="font-size: 0.8rem; color: #059669; font-weight: 600;">👨‍✈️ ${escapeHtml(row.driverName)}</span>` : '<span style="font-size: 0.8rem; color: #94a3b8;">(ยังไม่ระบุคนขับ)</span>'}
                    </div>

                    <div style="font-size: 0.78rem; color: #475569; margin-top: 5px; display: flex; gap: 10px; flex-wrap: wrap;">
                      ${row.time ? `<span>⏰ เวลา: <strong>${row.time}</strong></span>` : ''}
                      ${row.department ? `<span>🏢 แผนก: <strong>${row.department}</strong></span>` : ''}
                      ${row.booker ? `<span>👤 ผู้โดยสาร: <strong>${escapeHtml(row.booker)}</strong></span>` : ''}
                    </div>

                    ${row.itineraryText ? `
                      <div style="font-size: 0.74rem; color: #475569; background: rgba(0,0,0,0.04); padding: 5px 8px; border-radius: 4px; margin-top: 5px; white-space: pre-line; line-height: 1.35;">
                        ${escapeHtml(row.itineraryText)}
                      </div>
                    ` : ''}
                  </div>

                  <button 
                    type="button" 
                    class="btn-select-target-row ${rowAvail ? 'btn-primary' : 'btn-outline-blue'}" 
                    data-row-id="${row.id}" 
                    style="white-space: nowrap; padding: 8px 14px; font-size: 0.82rem; font-weight: 600; ${rowAvail ? 'background: #16a34a;' : 'background: #0284c7; color: #fff;'}"
                  >
                    ⚡ ${rowAvail ? 'จัดใส่คันนี้' : 'เพิ่มงานลงคันนี้'}
                  </button>
                </div>
              `;
      }).join('')}
          </div>
        </div>
      `;
    }

    const html = `
      <div id="${modalId}" class="booker-picker-modal-backdrop">
        <div class="booker-picker-dialog" style="max-width: 620px;">
          ${renderModalContent()}
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById(modalId);
    const dialog = modal.querySelector('.booker-picker-dialog');
    const close = () => modal.remove();

    function bindModalEvents() {
      const closeBtn = document.getElementById('btn-close-target-picker');
      if (closeBtn) closeBtn.addEventListener('click', close);

      const changeDateInput = document.getElementById('picker-change-target-date');
      if (changeDateInput) {
        changeDateInput.addEventListener('change', (e) => {
          const newDate = e.target.value;
          if (newDate) {
            targetDate = newDate;
            targetRows = getDispatchSchedule(targetDate);
            if (!targetRows || targetRows.length === 0) {
              targetRows = getDefaultFleetDispatchRows();
            }
            dialog.innerHTML = renderModalContent();
            bindModalEvents();
          }
        });
      }

      const selectAllBtn = document.getElementById('btn-target-select-all');
      if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
          dialog.querySelectorAll('.target-stop-chk').forEach(c => { c.checked = true; });
        });
      }

      const unselectAllBtn = document.getElementById('btn-target-unselect-all');
      if (unselectAllBtn) {
        unselectAllBtn.addEventListener('click', () => {
          dialog.querySelectorAll('.target-stop-chk').forEach(c => { c.checked = false; });
        });
      }

      dialog.querySelectorAll('.btn-select-target-row').forEach(btn => {
        btn.addEventListener('click', () => {
          const rowId = btn.getAttribute('data-row-id');
          const targetRow = targetRows.find(r => r.id === rowId);
          if (!targetRow) return;

          let selectedIndices = null;
          const stopCheckboxes = Array.from(dialog.querySelectorAll('.target-stop-chk'));
          if (stopCheckboxes.length > 0) {
            const checkedBoxes = stopCheckboxes.filter(c => c.checked);
            if (checkedBoxes.length === 0) {
              alert('กรุณาเลือกรายการภารกิจ/จุดหมายอย่างน้อย 1 รายการเพื่อจัดลงรถ');
              return;
            }
            selectedIndices = checkedBoxes.map(c => parseInt(c.getAttribute('data-index'), 10));
          }

          applyBookingToRow(targetRow, booking, selectedIndices, targetDate);
          saveDispatchSchedule(targetDate, targetRows);

          close();

          // Switch to spreadsheet on targetDate and highlight row
          selectedDate = targetDate;
          activeTab = 'spreadsheet';
          loadSchedule();
          render();

          setTimeout(() => {
            const tr = container.querySelector(`tr[data-row-id="${targetRow.id}"]`) ||
              container.querySelector(`tr[data-plate="${targetRow.plate}"]`);
            if (tr) {
              tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
              tr.classList.add('flash-row-highlight');
              setTimeout(() => tr.classList.remove('flash-row-highlight'), 3500);
            }
          }, 150);

          showToast(`✓ จัดรถ ${targetRow.plate} ให้กับคำขอ ${booking.id} (${booking.bookerName}) เรียบร้อยแล้ว`);
        });
      });
    }

    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    bindModalEvents();
  }

  // Unassign booking from schedule and restore status to pending dispatch
  function unassignBookingFromSchedule(bookingId) {
    const allBookings = getAllBookings();
    const b = allBookings.find(x => x.id === bookingId);
    if (!b) return;

    if (!confirm(`คุณต้องการยกเลิกการจัดรถสำหรับคำขอ ${b.id} (${b.bookerName}) ใช่หรือไม่?\n\nงานจะถูกนำออกจากตารางจัดรถ และสถานะจะกลับเป็น "รอจัดสรรรถ"`)) {
      return;
    }

    const effectiveDate = b.assignedDate || b.usageDate || selectedDate;
    const sched = getDispatchSchedule(effectiveDate);
    const oldPlate = b.assignedVehicle;
    let scheduleChanged = false;

    sched.forEach(r => {
      let isTarget = false;
      if (r.linkedBookingIds && r.linkedBookingIds.includes(b.id)) {
        r.linkedBookingIds = r.linkedBookingIds.filter(id => id !== b.id);
        isTarget = true;
        scheduleChanged = true;
      }
      if (oldPlate && (r.plate === oldPlate || (b.assignedVehicle && r.plate === b.assignedVehicle))) {
        isTarget = true;
      }

      if (isTarget) {
        // Remove booker name if merged
        const bookerFirstName = b.bookerName ? b.bookerName.replace(/^(นาย|นางสาว|นาง|คุณ|K\.)\s*/i, '').split(' ')[0] : '';
        if (r.booker && bookerFirstName) {
          const names = r.booker.split('/').map(n => n.trim()).filter(n => !n.includes(bookerFirstName));
          r.booker = names.join('/');
          scheduleChanged = true;
        }

        // Clean stops from itineraryText
        if (r.itineraryText && b.itinerary) {
          const lines = r.itineraryText.split('\n').filter(line => {
            return !b.itinerary.some(it => {
              const det = it.detail ? it.detail.trim().slice(0, 15) : '';
              const dest = it.destination ? it.destination.trim() : '';
              return (det && line.includes(det)) || (dest && line.includes(dest));
            });
          });
          r.itineraryText = lines.join('\n');
          if (!r.itineraryText.trim()) {
            r.showItineraryBox = false;
          }
          scheduleChanged = true;
        }
      }
    });

    // Reset booking itinerary flags
    if (b.itinerary && Array.isArray(b.itinerary)) {
      b.itinerary.forEach(it => {
        it.dispatched = false;
        delete it.dispatchedToVehicle;
        delete it.dispatchedDate;
        delete it.dispatchedRowNo;
        delete it.dispatchedRowId;
      });
    }

    b.status = (b.approverSignature || b.statusLabel?.includes('อนุมัติ')) ? 'approved' : 'pending_approval';
    b.statusLabel = b.status === 'approved' ? 'อนุมัติแล้ว (รอจัดสรรรถ/ยืนยัน)' : 'รอหัวหน้าฝ่ายอนุมัติ';
    b.assignedVehicle = '';
    b.assignedDriver = '';
    delete b.assignedDate;
    delete b.isDispatchedDirectly;

    updateBooking(b.id, b);

    if (scheduleChanged) {
      saveDispatchSchedule(effectiveDate, sched);
    }

    if (selectedDate === effectiveDate) {
      loadSchedule();
    }

    render();
    showToast(`✓ ยกเลิกการจัดรถสำหรับคำขอ ${b.id} เรียบร้อยแล้ว (สถานะกลับเป็น รอจัดสรร)`);
  }

  // Jump from requests list to spreadsheet view and highlight vehicle row
  function jumpToScheduleRow(usageDate, plate) {
    if (usageDate) {
      selectedDate = usageDate;
    }
    activeTab = 'spreadsheet';
    loadSchedule();
    render();

    setTimeout(() => {
      let tr = null;
      if (plate) {
        tr = container.querySelector(`tr[data-plate="${plate}"]`) ||
          Array.from(container.querySelectorAll('.dispatch-table tbody tr')).find(r => r.textContent.includes(plate));
      }
      if (tr) {
        tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        tr.classList.add('flash-row-highlight');
        setTimeout(() => tr.classList.remove('flash-row-highlight'), 3500);
      }
    }, 150);

    showToast(`กำลังเปิดตารางจัดรถวันที่ ${formatThaiDate(selectedDate).short}${plate ? ` (รถ ${plate})` : ''}`);
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
      syncBookingsWithSchedule();
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
