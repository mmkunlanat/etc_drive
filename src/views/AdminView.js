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
  getDefaultFleetDispatchRows,
  getAllScheduleApprovalMetas,
  getScheduleApprovalMeta,
  saveScheduleApprovalMeta
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
    // Normalize data and clean up redundant consecutive empty newlines
    rows = rawRows.map(r => {
      const rawText = r.itineraryText || (Array.isArray(r.itineraryLines) ? r.itineraryLines.join('\n') : '');
      const cleanText = rawText ? rawText.replace(/\n\s*\n+/g, '\n').trim() : '';
      return {
        ...r,
        itineraryText: cleanText,
        comment: r.comment || '',
        plateColor: r.plateColor || 'yellow',
        timeColor: r.timeColor || 'default',
        linkedBookingIds: r.linkedBookingIds || [],
        vehicleStatus: r.vehicleStatus || null
      };
    });
  }

  // Determine if a vehicle row is available or busy
  function isRowAvailable(row) {
    if (!row) return true;
    if (row.vehicleStatus === 'available') return true;
    if (row.vehicleStatus === 'busy' || row.vehicleStatus === 'maintenance') return false;

    // If driver has completed all jobs in this row → vehicle is free for the next assignment
    if (row.driverJobStatus === 'completed') return true;

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

  // Check if a specific plate is available in the current schedule.
  // Returns: 'available' | 'done' | 'busy'
  function getPlateAvailability(plateLabel, allRows, excludeRowId = null) {
    if (!plateLabel) return 'available';
    const cleanPlate = plateLabel.trim().toLowerCase();
    const otherRows = allRows.filter(r => r.id !== excludeRowId && (r.plate || '').trim().toLowerCase() === cleanPlate);
    if (otherRows.length === 0) return 'available';
    // If all matching rows are completed → vehicle is free (done, ready for next job)
    const allDone = otherRows.every(r => r.driverJobStatus === 'completed');
    if (allDone) return 'done';
    // If any row is still busy → not available
    if (otherRows.some(r => !isRowAvailable(r))) return 'busy';
    return 'available';
  }

  // Legacy wrapper for backward compat
  function isPlateAvailableInSchedule(plateLabel, allRows, excludeRowId = null) {
    const avail = getPlateAvailability(plateLabel, allRows, excludeRowId);
    return avail !== 'busy';
  }

  loadSchedule();
  syncBookingsWithSchedule();

  function render() {
    syncBookingsWithSchedule();
    const thaiDate = formatThaiDate(selectedDate);
    const bookings = getAllBookings();
    const pendingDispatchCount = bookings.filter(b => b.status === 'pending_approval' || b.status === 'approved' || b.status === 'partially_dispatched').length;
    const schedMeta = getScheduleApprovalMeta(selectedDate);
    const allScheduleMetas = getAllScheduleApprovalMetas();
    const returnedDates = Object.keys(allScheduleMetas).filter(d => allScheduleMetas[d]?.status === 'returned');

    container.innerHTML = `
      <div class="dispatch-portal-container">

        <!-- Global Alert when any date's schedule is returned by Approver -->
        ${returnedDates.length > 0 ? `
          <div class="returned-schedules-banner no-print" style="background: #fff1f2; border: 1.5px solid #fda4af; border-radius: 10px; padding: 12px 18px; margin-bottom: 0.85rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; box-shadow: 0 4px 6px -1px rgba(225, 29, 72, 0.08);">
            <div style="display: flex; align-items: flex-start; gap: 12px; flex: 1; min-width: 280px;">
              <span style="font-size: 1.5rem; line-height: 1;">🔔</span>
              <div>
                <div style="font-weight: 700; color: #be123c; font-size: 0.98rem; display: flex; align-items: center; gap: 6px;">
                  <span>แจ้งเตือน: มีตารางจัดรถ ${returnedDates.length} วัน ที่ผู้อนุมัติส่งกลับมาให้แก้ไข</span>
                </div>
                <div style="font-size: 0.82rem; color: #9f1239; margin-top: 4px; line-height: 1.45;">
                  ${returnedDates.map(d => {
                    const tDate = formatThaiDate(d);
                    const rMeta = allScheduleMetas[d];
                    const isCurrent = d === selectedDate;
                    return `
                      <span style="display: inline-block; margin-right: 14px; margin-top: 2px;">
                        • วันที่ <strong>${tDate.short}</strong>: <em>"${escapeHtml(rMeta.returnReason || rMeta.remark || 'มีรายการต้องแก้ไข')}"</em>
                        ${isCurrent ? ' <span style="background: #ffe4e6; color: #be123c; font-size: 0.72rem; padding: 1px 7px; border-radius: 6px; font-weight: 700;">(กำลังเปิดอยู่นี้)</span>' : ''}
                      </span>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${returnedDates.filter(d => d !== selectedDate).map(d => `
                <button type="button" class="btn-jump-returned-date btn-primary" data-date="${d}" style="background: #be123c; padding: 6px 14px; font-size: 0.82rem; font-weight: 600; border-radius: 6px;">
                  🔍 เปิดตารางวันที่ ${formatThaiDate(d).short} เพื่อแก้ไข
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}

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
            ${schedMeta.status === 'approved' ? `
              <span class="schedule-pipeline-tag tag-approved" style="background: #dcfce7; color: #15803d; border: 1px solid #86efac; font-size: 0.75rem; padding: 4px 10px; border-radius: 6px; font-weight: 700;">
                ✅ ผู้อนุมัติยืนยันตารางแล้ว (ส่งให้คนขับดูแล้ว)
              </span>
            ` : schedMeta.status === 'pending_approval' ? `
              <span class="schedule-pipeline-tag tag-pending" style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; font-size: 0.75rem; padding: 4px 10px; border-radius: 6px; font-weight: 700;">
                ⏳ ส่งให้ผู้อนุมัติตรวจแล้ว (รอการยืนยัน)
              </span>
            ` : schedMeta.status === 'returned' ? `
              <span class="schedule-pipeline-tag tag-returned" style="background: #ffe4e6; color: #be123c; border: 1.5px solid #fca5a5; font-size: 0.75rem; padding: 4px 10px; border-radius: 6px; font-weight: 700;">
                ⚠️ ผู้อนุมัติส่งกลับแก้ไข (มีรายการต้องปรับปรุง)
              </span>
            ` : `
              <span class="schedule-pipeline-tag tag-draft" style="background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; font-size: 0.75rem; padding: 4px 10px; border-radius: 6px; font-weight: 600;">
                ⚪ ฉบับร่าง (ยังไม่ส่งตรวจ)
              </span>
            `}
            <button id="btn-add-vehicle-row" class="btn-primary" style="padding: 6px 12px; font-size: 0.82rem; background: #0284c7;">
              ➕ เพิ่มรถ/แถวใหม่
            </button>
            <button id="btn-save-schedule" class="btn-primary" style="padding: 6px 13px; font-size: 0.82rem; background: #002060; font-weight: 600;" title="บันทึกข้อมูลตารางจัดรถในระบบ">
              💾 บันทึกตาราง
            </button>
            <button id="btn-submit-approval" class="btn-primary" style="padding: 6px 14px; font-size: 0.82rem; background: ${schedMeta.status === 'returned' ? '#e11d48' : (schedMeta.status === 'approved' ? '#d97706' : '#059669')}; font-weight: 700;" title="ส่งตารางจัดรถไปให้ผู้อนุมัติตรวจสอบและยืนยัน">
              📤 ${schedMeta.status === 'returned' ? 'แก้ไขแล้ว ส่งให้ผู้อนุมัติตรวจใหม่' : (schedMeta.status === 'approved' ? 'ส่งตรวจใหม่' : (schedMeta.status === 'pending_approval' ? 'ส่งตรวจอีกครั้ง' : 'ส่งให้ผู้อนุมัติตรวจ'))}
            </button>
            <button id="btn-print-schedule" class="btn-outline-blue" style="padding: 6px 12px; font-size: 0.82rem;">
              🖨️ พิมพ์ตารางจัดรถ
            </button>
          </div>
        </div>

        ${activeTab === 'spreadsheet' ? renderSpreadsheetView(thaiDate, schedMeta) : renderRequestsListView(bookings)}

      </div>
    `;

    attachGlobalEvents();
  }

  // Render the official spreadsheet table
  function renderSpreadsheetView(thaiDate, schedMeta) {
    const meta = schedMeta || getScheduleApprovalMeta(selectedDate);

    return `
      <!-- Approval Pipeline Alert Banner -->
      ${meta.status === 'returned' ? `
        <div class="schedule-approval-alert alert-returned" style="background: #fff1f2; border: 2px solid #f43f5e; border-radius: 10px; padding: 14px 18px; margin-bottom: 0.85rem; box-shadow: 0 4px 6px -1px rgba(244,63,94,0.12);">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: flex-start; gap: 12px; flex: 1; min-width: 280px;">
              <span style="font-size: 1.8rem; line-height: 1;">⚠️</span>
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <strong style="color: #be123c; font-size: 1.05rem;">
                    ผู้อนุมัติส่งตารางจัดรถวันที่ ${thaiDate.short} กลับมาให้แก้ไข
                  </strong>
                  <span style="background: #ffe4e6; color: #e11d48; border: 1px solid #fca5a5; font-size: 0.75rem; font-weight: 700; padding: 2px 10px; border-radius: 10px;">
                    มีรายการต้องปรับปรุง
                  </span>
                </div>
                <div style="font-size: 0.8rem; color: #9f1239; margin-top: 3px;">
                  ส่งกลับโดย: <strong>${escapeHtml(meta.returnedBy || 'ผู้อนุมัติ')}</strong>
                  ${meta.returnedAt ? ` • เมื่อ ${new Date(meta.returnedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.` : ''}
                </div>

                <!-- กล่องแสดงรายการที่ผู้อนุมัติระบุให้แก้ไขอย่างเด่นชัด -->
                <div style="background: #ffffff; border: 1.5px solid #fda4af; border-left: 5px solid #e11d48; border-radius: 6px; padding: 12px 16px; margin-top: 10px;">
                  <div style="font-weight: 700; color: #9f1239; font-size: 0.88rem; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <span>📝 รายการที่ผู้อนุมัติระบุให้แก้ไข:</span>
                  </div>
                  <div style="font-size: 0.95rem; color: #0f172a; font-weight: 600; white-space: pre-wrap; line-height: 1.55;">
                    ${escapeHtml(meta.returnReason || meta.remark || 'กรุณาตรวจสอบและปรับปรุงตารางจัดรถ')}
                  </div>
                </div>

                <div style="font-size: 0.82rem; color: #881337; margin-top: 10px; display: flex; align-items: center; gap: 6px;">
                  <span>💡</span>
                  <span>กรุณาปรับแก้ข้อมูลในตารางจัดรถด้านล่างตามรายการด้านบน เมื่อแก้ไขเสร็จแล้วให้กดปุ่ม <strong>"📤 แก้ไขแล้ว ส่งให้ผู้อนุมัติตรวจใหม่"</strong> ด้านบน</span>
                </div>
              </div>
            </div>
            
            <span style="font-size: 0.78rem; font-weight: 700; color: #be123c; background: #ffe4e6; border: 1px solid #fda4af; padding: 6px 14px; border-radius: 999px; align-self: flex-start;">
              ⚠️ สถานะ: ส่งกลับแก้ไข
            </span>
          </div>
        </div>
      ` : meta.status === 'approved' ? `
        <div class="schedule-approval-alert alert-approved" style="background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 8px; padding: 10px 16px; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.35rem;">✅</span>
            <div>
              <strong style="color: #15803d; font-size: 0.92rem;">ตารางจัดรถวันที่ ${thaiDate.short} ได้รับการอนุมัติและยืนยันแล้ว</strong>
              <div style="font-size: 0.78rem; color: #166534; margin-top: 2px;">
                ผู้อนุมัติ: <strong>${escapeHtml(meta.confirmedBy || 'ผู้จัดการ')}</strong> (${meta.confirmedAt ? formatThaiDate(meta.confirmedAt).short : '-'}) • ระบบได้ส่งมอบงานให้คนขับดูเรียบร้อยแล้ว
              </div>
            </div>
          </div>
          <span style="font-size: 0.75rem; font-weight: 700; color: #15803d; background: #dcfce7; border: 1px solid #86efac; padding: 4px 12px; border-radius: 999px;">
            ส่งงานให้คนขับดูแล้ว
          </span>
        </div>
      ` : meta.status === 'pending_approval' ? `
        <div class="schedule-approval-alert alert-pending" style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 10px 16px; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.35rem;">⏳</span>
            <div>
              <strong style="color: #b45309; font-size: 0.92rem;">ตารางจัดรถวันที่ ${thaiDate.short} ถูกส่งไปให้ผู้อนุมัติตรวจสอบและรอกดยืนยัน</strong>
              <div style="font-size: 0.78rem; color: #78350f; margin-top: 2px;">
                ส่งโดย <strong>${escapeHtml(meta.submittedBy || 'แอดมิน')}</strong> (${meta.submittedAt ? formatThaiDate(meta.submittedAt).short : '-'}) • ⚠️ พนักงานขับรถจะยังไม่เห็นงานจนกว่าผู้อนุมัติจะกดยืนยัน
              </div>
            </div>
          </div>
          <span style="font-size: 0.75rem; font-weight: 700; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 4px 12px; border-radius: 999px;">
            รอผู้อนุมัติกดยืนยัน
          </span>
        </div>
      ` : `
        <div class="schedule-approval-alert alert-draft" style="background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px; padding: 10px 16px; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.35rem;">📝</span>
            <div>
              <strong style="color: #475569; font-size: 0.9rem;">ตารางจัดรถวันที่ ${thaiDate.short} ยังเป็นฉบับร่าง</strong>
              <div style="font-size: 0.78rem; color: #64748b; margin-top: 2px;">
                เมื่อจัดรถเรียบร้อย ให้กดปุ่ม <strong>"📤 ส่งให้ผู้อนุมัติตรวจ"</strong> ด้านบน เพื่อส่งตารางไปให้ผู้อนุมัติตรวจสอบและกดยืนยันก่อนส่งงานให้คนขับ (หรือกด <strong>"💾 บันทึกตาราง"</strong> เพื่อเก็บแบบร่างไว้ก่อน)
              </div>
            </div>
          </div>
          <span style="font-size: 0.75rem; font-weight: 600; color: #64748b; background: #e2e8f0; padding: 4px 12px; border-radius: 999px;">
            ฉบับร่าง (ยังไม่ส่งตรวจ)
          </span>
        </div>
      `}

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
        ${(() => {
          // --- Driver Status Summary Panel (no-print) ---
          const hasApproved = schedMeta && schedMeta.status === 'approved';
          if (!hasApproved || rows.length === 0) return '';
          const rowsWithJob = rows.filter(r => !!(r.itineraryText && r.itineraryText.trim()) || (Array.isArray(r.linkedBookingIds) && r.linkedBookingIds.length > 0) || !!(r.booker && r.booker.trim()));
          if (rowsWithJob.length === 0) return '';
          const completedRows = rowsWithJob.filter(r => r.driverJobStatus === 'completed');
          const inProgressRows = rowsWithJob.filter(r => r.driverJobStatus === 'in_progress');
          const freeAfterCompleteRows = completedRows.filter(r => r.plate && r.plate.trim());
          if (completedRows.length === 0 && inProgressRows.length === 0) return '';
          return `
            <div class="no-print" style="background: linear-gradient(135deg,#f0fdf4 60%,#eff6ff 100%); border: 1.5px solid #86efac; border-radius: 10px; padding: 12px 16px; margin-bottom: 10px; box-shadow: 0 2px 6px rgba(22,163,74,0.08);">
              <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom: ${completedRows.length > 0 || inProgressRows.length > 0 ? '10px' : '0'};">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:1.3rem;">🚦</span>
                  <span style="font-weight:700; color:#166534; font-size:0.92rem;">สถานะงานจากพนักงานขับรถ (Real-time)</span>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  ${completedRows.length > 0 ? `<span style="background:#dcfce7;color:#15803d;border:1px solid #86efac;border-radius:999px;padding:3px 10px;font-size:0.78rem;font-weight:700;">✅ เสร็จสิ้น ${completedRows.length} คัน</span>` : ''}
                  ${inProgressRows.length > 0 ? `<span style="background:#fef9c3;color:#a16207;border:1px solid #fde047;border-radius:999px;padding:3px 10px;font-size:0.78rem;font-weight:700;">🚗 กำลังวิ่ง ${inProgressRows.length} คัน</span>` : ''}
                </div>
              </div>
              ${completedRows.length > 0 ? `
                <div style="margin-bottom:8px;">
                  <div style="font-size:0.8rem; font-weight:700; color:#166534; margin-bottom:5px;">งานที่เสร็จสิ้นแล้ว — รถพร้อมรับงานต่อ:</div>
                  <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${completedRows.map(r => {
                      const itin = Array.isArray(r.itinerary) ? r.itinerary : [];
                      const done = itin.filter(s => s && s.completed).length;
                      return `<div style="background:#fff;border:1.5px solid #86efac;border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:8px;min-width:200px;box-shadow:0 1px 3px rgba(22,163,74,0.1);">
                        <span style="font-size:1.1rem;">🏁</span>
                        <div>
                          <div style="font-weight:700;font-size:0.88rem;color:#166534;">${escapeHtml(r.plate || `คันที่ ${r.no}`)}</div>
                          <div style="font-size:0.75rem;color:#15803d;">👨‍✈️ ${escapeHtml(r.driverName || '-')}${itin.length > 0 ? ` · เสร็จ ${done}/${itin.length} งาน` : ''}</div>
                          ${r.driverConfirmedAt ? `<div style="font-size:0.7rem;color:#4ade80;">⏱ เสร็จสิ้น ${escapeHtml(r.driverJobStatus === 'completed' && r.driverConfirmedAt ? r.driverConfirmedAt : '')}</div>` : ''}
                        </div>
                        <span style="margin-left:auto;background:#dcfce7;color:#15803d;border-radius:999px;padding:2px 8px;font-size:0.72rem;font-weight:700;">✅ ว่างแล้ว</span>
                      </div>`;
                    }).join('')}
                  </div>
                </div>
              ` : ''}
              ${inProgressRows.length > 0 ? `
                <div>
                  <div style="font-size:0.8rem; font-weight:700; color:#a16207; margin-bottom:5px;">กำลังปฏิบัติงาน:</div>
                  <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${inProgressRows.map(r => {
                      const itin = Array.isArray(r.itinerary) ? r.itinerary : [];
                      const done = itin.filter(s => s && s.completed).length;
                      return `<div style="background:#fffbeb;border:1.5px solid #fde047;border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:8px;min-width:200px;">
                        <span style="font-size:1.1rem;">🚗</span>
                        <div>
                          <div style="font-weight:700;font-size:0.88rem;color:#92400e;">${escapeHtml(r.plate || `คันที่ ${r.no}`)}</div>
                          <div style="font-size:0.75rem;color:#a16207;">👨‍✈️ ${escapeHtml(r.driverName || '-')}${itin.length > 0 ? ` · ${done}/${itin.length} จุดหมาย` : ''}</div>
                        </div>
                        <span style="margin-left:auto;background:#fef9c3;color:#a16207;border-radius:999px;padding:2px 8px;font-size:0.72rem;font-weight:700;">🚗 วิ่งอยู่</span>
                      </div>`;
                    }).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        })()}

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

  // Format job description text with red time highlights
  function formatJobTextHtml(text) {
    if (!text) return '';
    let formatted = escapeHtml(text);
    formatted = formatted.replace(/(เวลา\s*\d{1,2}[\.:]\d{2}\s*[-–]\s*\d{1,2}[\.:]\d{2}\s*น\.)/g, '<span style="color: #dc2626; font-weight: 600;">$1</span>');
    formatted = formatted.replace(/(\b\d{1,2}[\.:]\d{2}\s*น\.)/g, '<span style="color: #dc2626; font-weight: 600;">$1</span>');
    formatted = formatted.replace(/(เครื่องลง\s*\d{1,2}[\.:]\d{2}\s*น\.)/g, '<span style="color: #0284c7; font-weight: 600;">$1</span>');
    formatted = formatted.replace(/(ติดต่อ\s*K\.[^\/\n]+)/g, '<span style="color: #dc2626; font-weight: 600;">$1</span>');
    return formatted;
  }

  // Render single unified itinerary editor with sequential numbering and cross delete buttons behind each job
  function renderItineraryEditor(row) {
    const text = row.itineraryText || '';
    const validLines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const allBookings = getAllBookings();
    const rowBookings = row ? allBookings.filter(b => {
      return (row.linkedBookingIds && row.linkedBookingIds.includes(b.id)) ||
             (b.assignedVehicle && row.plate && b.assignedVehicle === row.plate);
    }) : [];

    // If no jobs yet, prepare one blank line
    const displayLines = validLines.length > 0 ? validLines : [''];

    const itemsHtml = displayLines.map((line, idx) => {
      const cleanContent = line.replace(/^\s*(\d+[\.\)]|ลำดับที่\s*\d+[:\.]?)\s*/, '').trim();

      let matchedBookingId = '';
      let matchedItemNo = '';
      if (cleanContent) {
        for (const b of rowBookings) {
          if (b.itinerary && Array.isArray(b.itinerary)) {
            for (let i = 0; i < b.itinerary.length; i++) {
              const it = b.itinerary[i];
              const dest = it.destination ? it.destination.trim() : '';
              const det = it.detail ? it.detail.trim() : '';
              if ((dest && cleanContent.includes(dest)) || (det && cleanContent.includes(det))) {
                matchedBookingId = b.id;
                matchedItemNo = String(it.no || (i + 1));
                break;
              }
            }
          }
          if (matchedBookingId) break;
        }
      }

      const rowIdAttr = `data-row-id="${escapeHtml(row.id)}"`;
      const bIdAttr = matchedBookingId ? `data-booking-id="${escapeHtml(matchedBookingId)}"` : '';
      const itNoAttr = matchedItemNo ? `data-item-no="${escapeHtml(matchedItemNo)}"` : '';

      return `
        <div class="dispatch-job-item-row" data-row-id="${escapeHtml(row.id)}" data-index="${idx}">
          <span class="dispatch-job-order font-bold" style="color: #1e40af; font-size: 0.9rem; flex-shrink: 0; min-width: 22px;">${idx + 1}.</span>
          <div 
            class="dispatch-job-input-text" 
            contenteditable="true" 
            data-row-id="${escapeHtml(row.id)}" 
            data-index="${idx}" 
            placeholder="พิมพ์รายละเอียดงาน (กด Enter เพื่อเพิ่มงานใหม่)..."
          >${formatJobTextHtml(cleanContent)}</div>
          <button 
            type="button" 
            class="btn-remove-job-item no-print" 
            ${rowIdAttr} 
            data-job-text="${escapeHtml(line || cleanContent)}" 
            ${bIdAttr} 
            ${itNoAttr} 
            title="ลบงานนี้ออกจากรถคันนี้"
          >✕</button>
        </div>
      `;
    }).join('');

    return `
      <div class="dispatch-itinerary-editor no-print" data-row-id="${escapeHtml(row.id)}">
        <div class="dispatch-job-lines-container" data-row-id="${escapeHtml(row.id)}">
          ${itemsHtml}
        </div>
        <div class="dispatch-itinerary-footer no-print" style="margin-top: 6px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="btn-add-inline-job btn-ghost-light" data-row-id="${escapeHtml(row.id)}" style="color: #0284c7; font-size: 0.78rem; font-weight: 700; padding: 3px 8px; border: 1px dashed #7dd3fc; border-radius: 6px; background: #f0f9ff; cursor: pointer;">
            ➕ เพิ่มงานใหม่ (หรือกด Enter ในบรรทัดงาน)
          </button>
          <span style="font-size: 0.72rem; color: #94a3b8;">
            💡 กด Enter เพื่อขึ้นงานถัดไป • กด ✕ ด้านหลังเพื่อลบงาน
          </span>
        </div>
      </div>
      <div class="dispatch-itinerary-box print-only" data-field="itineraryText" data-row-id="${escapeHtml(row.id)}">
        ${formatItineraryWithHighlights(row.itineraryText || '', row)}
      </div>
    `;
  }

  // Render a vehicle group (Main car row + Sub-row itinerary + Sub-row comment)
  function renderVehicleRowGroup(row, index, bookerPool = []) {
    const plateClass = row.plateColor === 'green' ? 'plate-bg-green' : (row.plateColor === 'yellow' ? 'plate-bg-yellow' : 'plate-bg-default');
    const timeClass = row.timeColor === 'pink' ? 'time-bg-pink' : '';

    // --- Driver Job Status for Admin visibility ---
    const driverJobStatus = row.driverJobStatus || 'not_started';
    const driverConfirmed = Boolean(row.driverConfirmed);
    const hasJob = !!(row.itineraryText && row.itineraryText.trim()) || (Array.isArray(row.linkedBookingIds) && row.linkedBookingIds.length > 0) || !!(row.booker && row.booker.trim());

    // Parse itinerary completion from stored itinerary state
    let totalStops = 0;
    let completedStops = 0;
    if (Array.isArray(row.itinerary) && row.itinerary.length > 0) {
      totalStops = row.itinerary.length;
      completedStops = row.itinerary.filter(s => s && s.completed).length;
    }

    let driverStatusBadge = '';
    if (hasJob) {
      if (driverJobStatus === 'completed') {
        driverStatusBadge = `<span class="no-print" style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#15803d;border:1px solid #86efac;border-radius:999px;padding:2px 9px;font-size:0.72rem;font-weight:700;white-space:nowrap;" title="คนขับรายงานเสร็จสิ้นภารกิจแล้ว">✅ เสร็จสิ้นแล้ว${totalStops > 0 ? ` (${completedStops}/${totalStops})` : ''}</span>`;
      } else if (driverJobStatus === 'in_progress') {
        driverStatusBadge = `<span class="no-print" style="display:inline-flex;align-items:center;gap:4px;background:#fef9c3;color:#a16207;border:1px solid #fde047;border-radius:999px;padding:2px 9px;font-size:0.72rem;font-weight:700;white-space:nowrap;" title="คนขับกำลังปฏิบัติงานอยู่">🚗 กำลังวิ่งงาน${totalStops > 0 ? ` (${completedStops}/${totalStops})` : ''}</span>`;
      } else if (driverConfirmed) {
        driverStatusBadge = `<span class="no-print" style="display:inline-flex;align-items:center;gap:4px;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd;border-radius:999px;padding:2px 9px;font-size:0.72rem;font-weight:700;white-space:nowrap;" title="คนขับยืนยันรับงานแล้ว ยังไม่ได้เริ่มวิ่ง">✓ ยืนยันรับงานแล้ว</span>`;
      } else {
        driverStatusBadge = `<span class="no-print" style="display:inline-flex;align-items:center;gap:4px;background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;border-radius:999px;padding:2px 9px;font-size:0.72rem;font-weight:700;white-space:nowrap;" title="รอคนขับยืนยันรับงาน">⏳ รอคนขับยืนยัน</span>`;
      }
    }
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
      const plateStatus = getPlateAvailability(v.label, rows, row.id);
      const isCurrentRowPlate = row.plate && v.label.trim().toLowerCase() === row.plate.trim().toLowerCase();
      let statusBadge;
      if (isCurrentRowPlate) {
        statusBadge = `<span class="opt-status-pill" style="background:#dbeafe;color:#1d4ed8;border-color:#93c5fd;">✓ คันนี้</span>`;
      } else if (plateStatus === 'done') {
        statusBadge = `<span class="opt-status-pill" style="background:#dcfce7;color:#15803d;border-color:#86efac;">✅ ว่างแล้ว</span>`;
      } else if (plateStatus === 'busy') {
        statusBadge = `<span class="opt-status-pill pill-busy">กำลังใช้งาน</span>`;
      } else {
        statusBadge = `<span class="opt-status-pill pill-avail">ว่าง</span>`;
      }
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
                      ${statusBadge}
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

        <!-- ฝ่าย/แผนก (ช่อง text) -->
        <td class="col-dept">
          <input 
            type="text" 
            class="dispatch-cell-input text-center" 
            data-field="department" 
            data-row-id="${row.id}" 
            value="${escapeHtml(row.department || '')}" 
            placeholder="ฝ่าย/แผนก"
            autocomplete="off"
          />
          <span class="cell-print-text print-only" data-field="department">${escapeHtml(row.department || '')}</span>
        </td>

        <!-- ผู้จอง (ช่อง text) -->
        <td class="col-booker">
          <input 
            type="text" 
            class="dispatch-cell-input text-center font-bold" 
            data-field="booker" 
            data-row-id="${row.id}" 
            value="${escapeHtml(row.booker || '')}" 
            placeholder="K.ชื่อ1/K.ชื่อ2"
            autocomplete="off"
          />
          <span class="cell-print-text print-only font-bold" data-field="booker">${escapeHtml(row.booker || '')}</span>
        </td>

        <!-- Non-print Actions -->
        <td class="col-actions no-print" style="background: #f8fafc; padding: 4px;">
          ${driverStatusBadge ? `<div style="display:flex;justify-content:center;margin-bottom:4px;">${driverStatusBadge}</div>` : ''}
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
            ${renderItineraryEditor(row)}
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
                      ${b.requestedDriver ? `
                        <div style="font-size: 0.72rem; color: #0284c7; margin-top: 2px;">
                          👨‍✈️ คนขับที่ขอ: <strong>${escapeHtml(b.requestedDriver)}</strong>
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
        showToast(`✓ บันทึกตารางจัดรถวันที่ ${formatThaiDate(selectedDate).short} เรียบร้อยแล้ว (ฉบับร่าง)`);
      });
    }

    const submitApprovalBtn = document.getElementById('btn-submit-approval');
    if (submitApprovalBtn) {
      submitApprovalBtn.addEventListener('click', () => {
        saveCurrentSchedule();
        saveScheduleApprovalMeta(selectedDate, {
          status: 'pending_approval',
          submittedAt: new Date().toISOString(),
          submittedBy: 'สิริมา จัดสรรดี (ฝ่ายสำนักงาน)'
        });
        showToast(`✓ ส่งตารางจัดรถวันที่ ${formatThaiDate(selectedDate).short} ให้ผู้อนุมัติตรวจสอบและยืนยันเรียบร้อยแล้ว`);
        render();
      });
    }

    // Quick jump to returned schedule date
    container.querySelectorAll('.btn-jump-returned-date').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetDate = btn.getAttribute('data-date');
        if (targetDate) {
          saveCurrentSchedule();
          selectedDate = targetDate;
          activeTab = 'spreadsheet';
          loadSchedule();
          render();
          showToast(`เปิดตารางวันที่ ${formatThaiDate(targetDate).short} ที่มีรายการต้องแก้ไขเรียบร้อย`);
        }
      });
    });

    if (!window._adminScheduleApprovalListener) {
      window._adminScheduleApprovalListener = () => {
        render();
      };
      window.addEventListener('schedule_approval_updated', window._adminScheduleApprovalListener);
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

        // Sync all input values to DOM attribute and cell-print-text spans
        container.querySelectorAll('td').forEach(td => {
          const input = td.querySelector('.dispatch-cell-input');
          const span = td.querySelector('.cell-print-text');
          if (input) {
            input.setAttribute('value', input.value);
            if (span) {
              span.textContent = input.value || '';
            }
          }
        });

        let styleEl = document.getElementById('dynamic-print-page-style');
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'dynamic-print-page-style';
          document.head.appendChild(styleEl);
        }

        // Calculate dynamic scale based on actual card height to guarantee exact 1 page without cutting anything off
        const printCard = container.querySelector('#dispatch-print-area');
        const naturalH = printCard ? printCard.scrollHeight : 0;
        let scaleCss = '';
        if (naturalH > 670) {
          const zoomVal = Math.max(0.55, +(660 / naturalH).toFixed(3));
          scaleCss = `
            body:not(.has-paper-modal) .dispatch-paper-card {
              zoom: ${zoomVal} !important;
            }
          `;
        }

        styleEl.textContent = `
          @page {
            size: A4 landscape !important;
            margin: 4mm 6mm !important;
          }
          ${scaleCss}
        `;

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
          } else if (field === 'department') {
            targetRow.department = mergeDepartmentCodes(targetRow.department, val);
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

    // Inline itinerary job editor events
    container.querySelectorAll('.dispatch-job-input-text').forEach(inputEl => {
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const rowId = inputEl.getAttribute('data-row-id');
          const targetRow = rows.find(r => r.id === rowId);
          if (!targetRow) return;

          const editor = inputEl.closest('.dispatch-itinerary-editor');
          if (!editor) return;
          const allTextEls = Array.from(editor.querySelectorAll('.dispatch-job-input-text'));
          const currentIndex = allTextEls.indexOf(inputEl);

          // Get current clean texts from all lines
          const currentLines = allTextEls.map(el => {
            return el.innerText.replace(/^\s*(\d+[\.\)]|ลำดับที่\s*\d+[:\.]?)\s*/, '').trim();
          });

          // Insert new line right after currentIndex
          currentLines.splice(currentIndex + 1, 0, '');

          // Rebuild itineraryText
          targetRow.itineraryText = currentLines
            .filter((l, idx) => l || idx === currentIndex + 1)
            .map((l, idx) => `${idx + 1}. ${l}`)
            .join('\n');
          targetRow.itineraryLines = targetRow.itineraryText.split('\n').filter(Boolean);

          saveCurrentSchedule();
          render();

          // Focus newly created line
          setTimeout(() => {
            const newEditor = container.querySelector(`.dispatch-itinerary-editor[data-row-id="${rowId}"]`);
            if (newEditor) {
              const newInputs = newEditor.querySelectorAll('.dispatch-job-input-text');
              const nextInput = newInputs[currentIndex + 1];
              if (nextInput) {
                nextInput.focus();
              }
            }
          }, 10);
        } else if (e.key === 'Backspace' && inputEl.innerText.trim() === '') {
          const editor = inputEl.closest('.dispatch-itinerary-editor');
          if (!editor) return;
          const allTextEls = Array.from(editor.querySelectorAll('.dispatch-job-input-text'));
          if (allTextEls.length > 1) {
            e.preventDefault();
            const currentIndex = allTextEls.indexOf(inputEl);
            const rowId = inputEl.getAttribute('data-row-id');
            const targetRow = rows.find(r => r.id === rowId);
            if (!targetRow) return;

            const currentLines = allTextEls.map(el => {
              return el.innerText.replace(/^\s*(\d+[\.\)]|ลำดับที่\s*\d+[:\.]?)\s*/, '').trim();
            });

            currentLines.splice(currentIndex, 1);

            targetRow.itineraryText = currentLines
              .map((l, idx) => `${idx + 1}. ${l}`)
              .join('\n');
            targetRow.itineraryLines = targetRow.itineraryText.split('\n').filter(Boolean);

            saveCurrentSchedule();
            render();

            setTimeout(() => {
              const newEditor = container.querySelector(`.dispatch-itinerary-editor[data-row-id="${rowId}"]`);
              if (newEditor) {
                const newInputs = newEditor.querySelectorAll('.dispatch-job-input-text');
                const prevInput = newInputs[Math.max(0, currentIndex - 1)];
                if (prevInput) {
                  prevInput.focus();
                  const range = document.createRange();
                  const sel = window.getSelection();
                  range.selectNodeContents(prevInput);
                  range.collapse(false);
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
              }
            }, 10);
          }
        }
      });

      inputEl.addEventListener('input', () => {
        const editor = inputEl.closest('.dispatch-itinerary-editor');
        const rowId = inputEl.getAttribute('data-row-id');
        const targetRow = rows.find(r => r.id === rowId);
        if (!targetRow || !editor) return;

        const allTextEls = Array.from(editor.querySelectorAll('.dispatch-job-input-text'));
        const currentLines = allTextEls.map(el => {
          return el.innerText.replace(/^\s*(\d+[\.\)]|ลำดับที่\s*\d+[:\.]?)\s*/, '').trim();
        }).filter(Boolean);

        targetRow.itineraryText = currentLines.map((l, idx) => `${idx + 1}. ${l}`).join('\n');
        targetRow.itineraryLines = currentLines;

        const cell = inputEl.closest('.dispatch-itinerary-cell');
        if (cell) {
          const printBox = cell.querySelector('.dispatch-itinerary-box.print-only');
          if (printBox) {
            printBox.innerHTML = formatItineraryWithHighlights(targetRow.itineraryText || '', targetRow);
          }
        }

        if (targetRow.itineraryText.trim() === '') {
          releaseLinkedBookings(targetRow);
          targetRow.linkedBookingIds = [];
        }
        debounceAutoSave();
      });

      inputEl.addEventListener('blur', () => {
        syncBookingsWithSchedule();
        debounceAutoSave();
      });
    });

    // Add inline job button
    container.querySelectorAll('.btn-add-inline-job').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const rowId = btn.getAttribute('data-row-id');
        const targetRow = rows.find(r => r.id === rowId);
        if (!targetRow) return;

        const editor = btn.closest('.dispatch-itinerary-editor');
        const allTextEls = editor ? Array.from(editor.querySelectorAll('.dispatch-job-input-text')) : [];
        const currentLines = allTextEls.map(el => {
          return el.innerText.replace(/^\s*(\d+[\.\)]|ลำดับที่\s*\d+[:\.]?)\s*/, '').trim();
        });

        currentLines.push('');
        targetRow.itineraryText = currentLines
          .map((l, idx) => `${idx + 1}. ${l}`)
          .join('\n');
        targetRow.itineraryLines = targetRow.itineraryText.split('\n').filter(Boolean);

        saveCurrentSchedule();
        render();

        setTimeout(() => {
          const newEditor = container.querySelector(`.dispatch-itinerary-editor[data-row-id="${rowId}"]`);
          if (newEditor) {
            const newInputs = newEditor.querySelectorAll('.dispatch-job-input-text');
            const lastInput = newInputs[newInputs.length - 1];
            if (lastInput) lastInput.focus();
          }
        }, 10);
      });
    });

    // Remove single job from vehicle row
    container.querySelectorAll('.btn-remove-job-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rowId = btn.getAttribute('data-row-id');
        const jobText = btn.getAttribute('data-job-text');
        const bId = btn.getAttribute('data-booking-id') || null;
        const itNo = btn.getAttribute('data-item-no') || null;
        removeJobFromVehicle(rowId, jobText, bId, itNo);
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
      // ใช้เฉพาะ linkedBookingIds (exact match) เพื่อป้องกัน false positive จากชื่อผู้จองซ้ำ
      const referencingRows = activeRows.filter(r => {
        const hasId = r.linkedBookingIds && Array.isArray(r.linkedBookingIds) && r.linkedBookingIds.includes(booking.id);
        return hasId;
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

  // Extract specific time for a job leg (checks item.time, item.note, item.detail, and booking.startTime)
  function extractJobTime(item, booking = null) {
    if (!item) return '';
    if (item.time && typeof item.time === 'string' && item.time.trim()) {
      return item.time.trim().replace('.', ':');
    }
    if (item.note && typeof item.note === 'string') {
      const m = item.note.match(/(\d{1,2}[:.]\d{2})/);
      if (m) return m[1].replace('.', ':');
    }
    if (item.detail && typeof item.detail === 'string') {
      const m = item.detail.match(/(\d{1,2}[:.]\d{2})/);
      if (m) return m[1].replace('.', ':');
    }
    if (booking && booking.startTime && typeof booking.startTime === 'string') {
      return booking.startTime.trim().replace('.', ':');
    }
    return '';
  }

  // Format job itinerary stop text including destination, detail, time, passengers, and optional order number
  function formatJobItineraryText(item, booking = null, orderNumber = null) {
    const dest = item.destination ? item.destination.trim() : '';
    const detail = item.detail ? item.detail.trim() : '';
    const time = extractJobTime(item, booking);
    const timeStr = time ? `${time} น.` : '';

    let passStr = item.passengers ? `${item.passengers} คน` : '';
    if (!passStr && item.note) {
      const pm = item.note.match(/(\d+)\s*คน/);
      if (pm) passStr = `${pm[1]} คน`;
    }

    const metaParts = [timeStr, passStr].filter(Boolean).join(' / ');

    let mainText = '';
    if (dest && detail && dest !== detail) {
      const inner = [detail, metaParts].filter(Boolean).join(' ');
      mainText = `${dest} (${inner})`;
    } else if (dest) {
      mainText = metaParts ? `${dest} (${metaParts})` : dest;
    } else if (detail) {
      mainText = metaParts ? `${detail} (${metaParts})` : detail;
    } else {
      mainText = metaParts ? `ภารกิจ (${metaParts})` : '';
    }

    const cleanMain = mainText.replace(/^\s*(\d+[\.\)]|ลำดับที่\s*\d+[:\.]?)\s*/, '');
    const order = (orderNumber !== null && orderNumber !== undefined) ? orderNumber : (item ? item.no : null);
    if (order) {
      return `${order}. ${cleanMain}`;
    }
    return cleanMain;
  }

  // Booker Request Picker Modal - allows Admin to select undispatched jobs to fill into the car row
  function openBookerPickerModal(targetRow) {
    const modalId = 'booker-picker-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    syncBookingsWithSchedule();
    const allBookings = getAllBookings();

    // Default to 'pending' to always show available work immediately, with today's items sorted to the top
    let currentFilter = 'pending';

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

      // Sort filtered bookings: Jobs on selectedDate first, followed by pending approval, then by date & time
      filtered.sort((a, b) => {
        const aIsSelectedDate = a.usageDate === selectedDate ? 1 : 0;
        const bIsSelectedDate = b.usageDate === selectedDate ? 1 : 0;
        if (aIsSelectedDate !== bIsSelectedDate) return bIsSelectedDate - aIsSelectedDate;

        if (a.usageDate && b.usageDate && a.usageDate !== b.usageDate) {
          return a.usageDate.localeCompare(b.usageDate);
        }
        return (a.startTime || '').localeCompare(b.startTime || '');
      });

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
                    เป้าหมาย: <strong>รถลำดับที่ ${targetRow.no} (${targetRow.plate})</strong> | วันที่จัด: <strong>${todayThai.short}</strong>
                  </p>
                </div>
              </div>
              <button id="btn-close-booker-picker" class="btn-ghost-light" style="font-size: 1.1rem;">✕</button>
            </div>

            <!-- Filter Tabs -->
            <div style="background: #f1f5f9; padding: 10px 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; flex-shrink: 0;">
              <div class="admin-tab-group" style="background: #e2e8f0; padding: 2px;">
                <button type="button" class="admin-tab-pill-btn ${currentFilter === 'pending' ? 'active' : ''}" id="filter-picker-pending" style="font-size: 0.78rem; padding: 4px 10px;">
                  🚨 รอจัดสรรทั้งหมด (${countPending})
                </button>
                <button type="button" class="admin-tab-pill-btn ${currentFilter === 'today' ? 'active' : ''}" id="filter-picker-today" style="font-size: 0.78rem; padding: 4px 10px;">
                  📅 คำขอตรงกับวันที่นี้ (${countToday})
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
        const isTargetDate = b.usageDate === selectedDate;
        const undispatchedItems = getUndispatchedJobs(b);

        return `
                  <div class="booker-card-item" id="card-${b.id}" style="margin-bottom: 14px; background: #fff; border: 1.5px solid ${isTargetDate ? '#93c5fd' : '#e2e8f0'}; border-radius: 10px; padding: 12px 16px; box-shadow: ${isTargetDate ? '0 2px 8px rgba(59, 130, 246, 0.08)' : 'none'};">
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 8px;">
                      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="font-weight: 700; color: #1e40af; font-size: 0.95rem;">${b.id}</span>
                        <span style="font-weight: 600; color: #0f172a;">${escapeHtml(b.bookerName)}</span>
                        <span style="font-size: 0.8rem; color: #64748b;">(ฝ่าย: ${escapeHtml(b.department || '-')})</span>
                        ${isTargetDate ? `<span style="background: #dcfce7; color: #166534; font-weight: 700; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem;">📅 ตรงกับวันที่จัด (${uDate.short})</span>` : `<span style="background: #f1f5f9; color: #475569; font-weight: 600; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem;">📅 ขอใช้: ${uDate.short}</span>`}
                      </div>
                      <span class="status-badge ${b.status}" style="font-size: 0.75rem;">${b.statusLabel || b.status}</span>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 6px; font-size: 0.82rem; color: #475569; margin-bottom: 10px; background: #f8fafc; padding: 6px 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                      <div>📅 <strong>วันที่ใช้งาน:</strong> ${uDate.short}</div>
                      <div>⏰ <strong>เวลา:</strong> ${b.startTime} - ${b.endTime} น.</div>
                      <div>🚘 <strong>รถที่ต้องการ:</strong> ${escapeHtml(b.requestedVehicle || '-')}</div>
                      <div>👨‍✈️ <strong>คนขับที่ขอ:</strong> ${escapeHtml(b.requestedDriver || '-')}</div>
                      <div>📞 <strong>โทร:</strong> ${escapeHtml(b.bookerPhone || '-')}</div>
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
          const originalIdx = (b.itinerary || []).indexOf(item);
          const itemIndex = originalIdx >= 0 ? originalIdx : idx;
          const itemNo = item.no || (itemIndex + 1);
          const itemTime = extractJobTime(item, b);
          const timeBadge = itemTime ? `<span style="background: #fee2e2; color: #dc2626; font-weight: 700; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; display: inline-flex; align-items: center; gap: 3px;">⏰ ${itemTime} น.</span>` : '';
          const passBadge = item.passengers ? `<span style="background: #f1f5f9; color: #475569; font-weight: 600; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap;">👥 ${item.passengers} คน</span>` : '';

          const destText = item.destination ? item.destination.trim() : '';
          const detailText = item.detail ? item.detail.trim() : '';
          const noteText = item.note ? item.note.trim() : '';

          return `
                            <div class="job-choice-row" data-target-chk="chk-${b.id}-${itemIndex}" style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                              <input 
                                type="checkbox" 
                                id="chk-${b.id}-${itemIndex}"
                                class="job-picker-checkbox job-chk-${b.id}" 
                                data-booking-id="${b.id}" 
                                data-item-index="${itemIndex}" 
                                data-item-no="${itemNo}" 
                                style="cursor: pointer; width: 18px; height: 18px; flex-shrink: 0;" 
                              />
                              <label for="chk-${b.id}-${itemIndex}" style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; margin: 0; font-size: 0.85rem; flex-wrap: wrap;">
                                <span style="font-weight: 700; color: #1e40af; background: #dbeafe; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap;">
                                  ลำดับที่ ${itemNo}
                                </span>
                                ${timeBadge}
                                ${passBadge}
                                <span style="color: #0f172a; font-weight: 600; line-height: 1.4;">${escapeHtml(destText || detailText || 'งานภารกิจ')}</span>
                                ${destText && detailText && destText !== detailText ? `<span style="color: #64748b; font-size: 0.8rem;">(${escapeHtml(detailText)})</span>` : ''}
                                ${noteText && !noteText.includes(destText) ? `<span style="color: #94a3b8; font-size: 0.75rem; font-style: italic;">[${escapeHtml(noteText)}]</span>` : ''}
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

      // Row clicking to toggle checkbox smoothly
      modal.querySelectorAll('.job-choice-row').forEach(rowEl => {
        rowEl.addEventListener('click', (e) => {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
          const chkId = rowEl.getAttribute('data-target-chk');
          const chk = document.getElementById(chkId);
          if (chk) {
            chk.checked = !chk.checked;
            updateSelectionCounter();
          }
        });
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
            const itemIdx = parseInt(chk.getAttribute('data-item-index'), 10);
            const itemNo = parseInt(chk.getAttribute('data-item-no'), 10);
            if (!selections[bId]) selections[bId] = [];
            selections[bId].push({ itemIdx, itemNo });
          });

          const allCollectedTexts = [];
          const allPickedTimes = [];
          const allPickedStops = [];

          // Count existing jobs in targetRow to continue order numbering smoothly across all selected bookings
          let existingCount = (targetRow.itineraryText || '').split('\n')
            .flatMap(l => splitJobsFromLine(l))
            .filter(Boolean).length;

          Object.keys(selections).forEach(bId => {
            const booking = allBookings.find(b => b.id === bId);
            if (!booking) return;

            if (booking.department) {
              const deptCode = mapDeptCode(booking.department);
              targetRow.department = mergeDepartmentCodes(targetRow.department, deptCode);
            }
            targetRow.booker = mergeBookerNames(targetRow.booker, booking.bookerName);

            // Extract and mark selected jobs as dispatched
            const bookingSelections = selections[bId];
            const selectedIndices = bookingSelections.map(s => s.itemIdx);
            const selectedNos = bookingSelections.map(s => String(s.itemNo));
            const pickedStops = [];

            if (booking.itinerary && booking.itinerary.length > 0) {
              booking.itinerary.forEach((it, itIdx) => {
                const itNoStr = String(it.no || (itIdx + 1));
                const isSelected = selectedIndices.includes(itIdx) || selectedNos.includes(itNoStr);

                if (isSelected) {
                  it.dispatched = true;
                  it.dispatchedToVehicle = targetRow.plate;
                  it.dispatchedDate = selectedDate;
                  it.dispatchedRowNo = targetRow.no;
                  it.dispatchedRowId = targetRow.id;

                  // Pull time for this specific job
                  const stopTime = extractJobTime(it, booking);
                  if (stopTime) {
                    it.time = stopTime;
                    const dotTime = stopTime.replace(':', '.');
                    if (!allPickedTimes.includes(dotTime)) {
                      allPickedTimes.push(dotTime);
                    }
                  }

                  pickedStops.push(it);
                  allPickedStops.push(it);
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
              const synTime = booking.startTime ? booking.startTime.replace('.', ':') : '';
              const synStop = {
                detail: booking.requestedVehicle || 'เดินทางทั่วไป',
                destination: booking.notes || '',
                time: synTime
              };
              if (synTime) {
                const dotTime = synTime.replace(':', '.');
                if (!allPickedTimes.includes(dotTime)) {
                  allPickedTimes.push(dotTime);
                }
              }
              pickedStops.push(synStop);
              allPickedStops.push(synStop);
            }

            if (!targetRow.driverName && booking.requestedDriver) {
              targetRow.driverName = booking.requestedDriver;
              const matchDriver = DRIVER_POOL.find(d => d.name === booking.requestedDriver || booking.requestedDriver.includes(d.name));
              if (matchDriver && matchDriver.code && matchDriver.code !== '-') {
                targetRow.driverCode = matchDriver.code;
              }
            }

            booking.assignedVehicle = targetRow.plate;
            booking.assignedDriver = targetRow.driverName ? `${targetRow.driverName}` : 'ฝ่ายสำนักงานจัดสรรแล้ว';
            booking.assignedDate = selectedDate;
            updateBooking(booking.id, booking);

            // Build text for this booking's picked stops with individual job times and order numbers
            const stopsText = pickedStops.map(item => {
              existingCount++;
              return formatJobItineraryText(item, booking, existingCount);
            }).filter(Boolean).join('\n');

            if (stopsText) {
              allCollectedTexts.push(stopsText);
            }

            if (!targetRow.linkedBookingIds) targetRow.linkedBookingIds = [];
            if (!targetRow.linkedBookingIds.includes(booking.id)) {
              targetRow.linkedBookingIds.push(booking.id);
            }
          });

          // Fill/update vehicle row's time column with the extracted job times
          if (allPickedTimes.length > 0) {
            if (!targetRow.time || targetRow.time.trim() === '') {
              targetRow.time = allPickedTimes.join(' / ');
            } else {
              const existingTimes = targetRow.time.split('/').map(t => t.trim()).filter(Boolean);
              allPickedTimes.forEach(pt => {
                if (!existingTimes.includes(pt)) {
                  existingTimes.push(pt);
                }
              });
              targetRow.time = existingTimes.join(' / ');
            }
          }

          // Save all bookings
          saveAllBookings(allBookings);

          // Update structured itinerary on targetRow
          targetRow.itinerary = [...(targetRow.itinerary || []), ...allPickedStops];

          // Append or set itinerary text without redundant consecutive empty lines
          const combinedNewText = allCollectedTexts.filter(t => t && t.trim()).join('\n');
          if (targetRow.itineraryText && targetRow.itineraryText.trim()) {
            targetRow.itineraryText = `${targetRow.itineraryText.trim()}\n${combinedNewText}`.replace(/\n\s*\n+/g, '\n').trim();
          } else {
            targetRow.itineraryText = combinedNewText.replace(/\n\s*\n+/g, '\n').trim();
          }
          targetRow.itineraryLines = (targetRow.itineraryText || '').split('\n').filter(Boolean);
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
    const allStops = (booking.itinerary || []).filter(item => item.detail || item.destination);
    const activeStops = (selectedJobIndices && Array.isArray(selectedJobIndices) && selectedJobIndices.length > 0)
      ? selectedJobIndices.map(idx => allStops[idx]).filter(Boolean)
      : allStops.filter(it => !it.dispatched);

    const effectiveDate = targetDate || booking.usageDate || selectedDate;

    const pickedTimes = [];
    activeStops.forEach(it => {
      it.dispatched = true;
      it.dispatchedToVehicle = row.plate;
      it.dispatchedDate = effectiveDate;
      it.dispatchedRowNo = row.no;
      it.dispatchedRowId = row.id;

      // Pull time for this specific job leg
      const stopTime = extractJobTime(it, booking);
      if (stopTime) {
        it.time = stopTime;
        const dotTime = stopTime.replace(':', '.');
        if (!pickedTimes.includes(dotTime)) {
          pickedTimes.push(dotTime);
        }
      }
    });

    // Update row's time column with pulled job times
    if (pickedTimes.length > 0) {
      if (!row.time || row.time.trim() === '') {
        row.time = pickedTimes.join(' / ');
      } else {
        const existingTimes = row.time.split('/').map(t => t.trim()).filter(Boolean);
        pickedTimes.forEach(pt => {
          if (!existingTimes.includes(pt)) {
            existingTimes.push(pt);
          }
        });
        row.time = existingTimes.join(' / ');
      }
    } else if (booking.startTime && (!row.time || row.time.trim() === '')) {
      row.time = booking.startTime.replace(':', '.');
    }

    if (booking.department) {
      const deptCode = mapDeptCode(booking.department);
      row.department = mergeDepartmentCodes(row.department, deptCode);
    }
    row.booker = mergeBookerNames(row.booker, booking.bookerName);

    // Update structured itinerary
    row.itinerary = [...(row.itinerary || []), ...activeStops];

    // Count existing jobs in row to continue order numbering smoothly
    let existingCount = (row.itineraryText || '').split('\n')
      .flatMap(l => splitJobsFromLine(l))
      .filter(Boolean).length;

    // Format itinerary stops text with each job's time and order numbers
    const stopsText = activeStops.map(item => {
      existingCount++;
      return formatJobItineraryText(item, booking, existingCount);
    }).filter(Boolean).join('\n');

    if (row.itineraryText && row.itineraryText.trim()) {
      row.itineraryText = `${row.itineraryText.trim()}\n${stopsText}`.replace(/\n\s*\n+/g, '\n').trim();
    } else {
      row.itineraryText = stopsText.replace(/\n\s*\n+/g, '\n').trim();
    }
    row.itineraryLines = (row.itineraryText || '').split('\n').filter(Boolean);
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

    // Split existing bookers by "/"
    const existingNames = existing.split('/').map(n => n.trim()).filter(Boolean);
    const rawNew = newFormatted.replace(/^(K\.|k\.|นาย|นางสาว|นาง|คุณ)\s*/i, '').trim();

    // Check if new name already exists in existing names
    const alreadyExists = existingNames.some(en => {
      const rawExisting = en.replace(/^(K\.|k\.|นาย|นางสาว|นาง|คุณ)\s*/i, '').trim();
      return rawExisting === rawNew || en === newFormatted;
    });

    if (!alreadyExists) {
      existingNames.push(newFormatted);
    }
    return existingNames.join('/');
  }

  // Quick helper to map department name to abbreviation if needed
  function mapDeptCode(dept) {
    if (!dept) return '';
    const clean = String(dept).trim();
    if (clean.includes('บัญชีและการเงิน') || clean === 'ACC') return 'ACC';
    if ((clean.includes('ธุรการ') && clean.includes('บัญชี')) || clean === 'ACC/OFF') return 'ACC/OFF';
    if (clean.includes('ธุรการ') || clean === 'OFF') return 'OFF';
    if (clean.includes('ขายและการตลาด') || clean === 'SALE') return 'SALE';
    if (clean.includes('วิศวกรรม') || clean.includes('เทคโนโลยีสารสนเทศ') || clean.includes('สารสนเทศ') || clean === 'IT') return 'IT';
    if (clean.includes('ทรัพยากรบุคคล') || clean.includes('HR') || clean === 'HR') return 'HR';
    if (clean.includes('บริหาร') || clean === 'MGT') return 'MGT';
    if (clean.includes('จัดซื้อ') || clean === 'PUR') return 'PUR';
    if (clean.includes('ผลิต') || clean.includes('ปฏิบัติการ') || clean === 'PROD') return 'PROD';
    if (clean.includes('ประกันคุณภาพ') || clean.includes('QA') || clean === 'QA') return 'QA';
    return clean;
  }

  // Helper to merge department codes: if more than 1 department, separate with "/" without duplicating (e.g. "ACC/OFF", "SALE/IT")
  function mergeDepartmentCodes(existing, newDept) {
    if (!newDept || !newDept.trim()) return existing || '';
    const mapped = mapDeptCode(newDept);
    if (!mapped) return existing || '';
    if (!existing || !existing.trim()) {
      return mapped;
    }

    // Split existing and new by "/"
    const existingParts = existing.split('/').map(d => d.trim()).filter(Boolean);
    const newParts = mapped.split('/').map(d => d.trim()).filter(Boolean);

    newParts.forEach(np => {
      if (!existingParts.includes(np)) {
        existingParts.push(np);
      }
    });

    return existingParts.join('/');
  }

  // Recalculate vehicle row's department and booker from its current active linked bookings/jobs
  function updateRowDepartmentsAndBookers(row, allBookings) {
    if (!row) return;
    const bookings = allBookings || getAllBookings();

    // Find all bookings with at least one job currently dispatched to this row
    const activeBookings = bookings.filter(b => {
      const isLinked = (row.linkedBookingIds && row.linkedBookingIds.includes(b.id)) ||
                       (b.assignedVehicle && row.plate && b.assignedVehicle === row.plate);

      const hasJobInRow = (b.itinerary || []).some(it =>
        it.dispatched && (it.dispatchedRowId === row.id || (row.plate && it.dispatchedToVehicle === row.plate))
      );

      return hasJobInRow || (isLinked && (b.status === 'dispatched' || b.status === 'partially_dispatched'));
    });

    if (activeBookings.length > 0) {
      // Collect unique departments
      const deptList = [];
      activeBookings.forEach(b => {
        if (b.department) {
          const code = mapDeptCode(b.department);
          code.split('/').map(d => d.trim()).filter(Boolean).forEach(d => {
            if (!deptList.includes(d)) deptList.push(d);
          });
        }
      });
      if (deptList.length > 0) {
        row.department = deptList.join('/');
      }

      // Collect unique bookers
      const bookerList = [];
      activeBookings.forEach(b => {
        if (b.bookerName) {
          const formatted = formatBookerName(b.bookerName);
          if (formatted && !bookerList.includes(formatted)) {
            bookerList.push(formatted);
          }
        }
      });
      if (bookerList.length > 0) {
        row.booker = bookerList.join('/');
      }
    } else {
      // If no active bookings in this row and itinerary is empty
      if (!row.itineraryText || !row.itineraryText.trim()) {
        row.department = '';
        row.booker = '';
      }
    }
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
                ${stops.map((st, idx) => {
                  const itemTime = extractJobTime(st, booking);
                  return `
                  <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 0.82rem; cursor: pointer; background: #ffffff; padding: 7px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <input type="checkbox" class="target-stop-chk" data-index="${idx}" ${st.dispatched ? '' : 'checked'} style="margin-top: 3px;" />
                    <div style="flex: 1;">
                      <div style="display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap;">
                        <span style="font-weight: 700; color: #0284c7;">${idx + 1}.</span>
                        <strong style="color: #0f172a;">${escapeHtml(st.destination || st.detail || '')}</strong>
                        ${itemTime ? `<span style="background: #fee2e2; color: #dc2626; font-weight: 700; padding: 1px 6px; border-radius: 4px; font-size: 0.74rem; margin-left: 4px; display: inline-flex; align-items: center; gap: 3px;">⏰ ${itemTime} น.</span>` : ''}
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
                `;
                }).join('')}
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

        // Recalculate row's departments and bookers from remaining bookings
        updateRowDepartmentsAndBookers(r, allBookings);
        scheduleChanged = true;
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

  // Helper to split a line into individual jobs safely without splitting inside parentheses e.g. "(10:00 น. / 3 คน)"
  function splitJobsFromLine(line) {
    if (!line) return [];
    const jobs = [];
    let current = '';
    let parenDepth = 0;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '(') parenDepth++;
      else if (ch === ')') { if (parenDepth > 0) parenDepth--; }

      // Check for separator " / " or " /" outside parentheses
      if (parenDepth === 0 && ch === '/' && (
        (i > 0 && line[i - 1] === ' ') || (i < line.length - 1 && line[i + 1] === ' ')
      )) {
        const cleaned = current.trim().replace(/\/$/, '').trim();
        if (cleaned) {
          jobs.push(cleaned);
        }
        current = '';
        if (i < line.length - 1 && line[i + 1] === ' ') {
          i++; // Skip following space
        }
        continue;
      }
      current += ch;
    }
    const finalCleaned = current.trim().replace(/\/$/, '').trim();
    if (finalCleaned) {
      jobs.push(finalCleaned);
    }
    return jobs;
  }

  // Remove an individual job leg from a vehicle row and return it to undispatched state in Booker requests
  function removeJobFromVehicle(rowId, jobText, targetBookingId = null, targetItemNo = null) {
    const targetRow = rows.find(r => r.id === rowId);
    if (!targetRow) return;

    const allBookings = getAllBookings();
    let bookingChanged = false;
    const affectedBookings = [];
    const removedTimes = [];

    // 1. Match and reset booking item
    if (targetBookingId) {
      const booking = allBookings.find(b => b.id === targetBookingId);
      if (booking) {
        affectedBookings.push(booking);
        if (booking.itinerary && Array.isArray(booking.itinerary)) {
          booking.itinerary.forEach((it, idx) => {
            const itNo = it.no || (idx + 1);
            if (String(itNo) === String(targetItemNo) || !targetItemNo) {
              it.dispatched = false;
              delete it.dispatchedToVehicle;
              delete it.dispatchedDate;
              delete it.dispatchedRowNo;
              delete it.dispatchedRowId;
              bookingChanged = true;

              const t = extractJobTime(it, booking);
              if (t) removedTimes.push(t.replace(':', '.'));
            }
          });
        }
      }
    } else {
      // Find matching item by job text in linked bookings
      allBookings.forEach(b => {
        const isLinked = (targetRow.linkedBookingIds && targetRow.linkedBookingIds.includes(b.id)) ||
                         (b.assignedVehicle && targetRow.plate && b.assignedVehicle === targetRow.plate);

        if (b.itinerary && Array.isArray(b.itinerary)) {
          b.itinerary.forEach((it, idx) => {
            if (it.dispatched) {
              const dest = it.destination ? it.destination.trim() : '';
              const det = it.detail ? it.detail.trim() : '';
              const isMatch = (dest && jobText.includes(dest)) ||
                              (det && jobText.includes(det));

              if (isMatch) {
                it.dispatched = false;
                delete it.dispatchedToVehicle;
                delete it.dispatchedDate;
                delete it.dispatchedRowNo;
                delete it.dispatchedRowId;
                bookingChanged = true;
                if (!affectedBookings.includes(b)) affectedBookings.push(b);

                const t = extractJobTime(it, b);
                if (t) removedTimes.push(t.replace(':', '.'));
              }
            }
          });
        }
      });
    }

    // Extract time from job text itself (e.g. 01:00 น. or 01.00)
    const timeMatches = jobText.match(/(\d{1,2}[:.]\d{2})/g);
    if (timeMatches) {
      timeMatches.forEach(tm => {
        removedTimes.push(tm.replace(':', '.'));
      });
    }

    // 2. Update status of affected bookings
    affectedBookings.forEach(b => {
      const validItems = (b.itinerary || []).filter(it => it.detail || it.destination);
      const dispatchedItems = validItems.filter(it => it.dispatched);

      if (dispatchedItems.length === 0) {
        const targetStatus = (b.approverSignature || b.statusLabel?.includes('อนุมัติ')) ? 'approved' : 'pending_approval';
        const targetLabel = targetStatus === 'approved' ? 'อนุมัติแล้ว (รอจัดสรรรถ/ยืนยัน)' : 'รอหัวหน้าฝ่ายอนุมัติ';
        b.status = targetStatus;
        b.statusLabel = targetLabel;
        b.assignedVehicle = '';
        b.assignedDriver = '';
        delete b.assignedDate;
        delete b.isDispatchedDirectly;
      } else {
        b.status = 'partially_dispatched';
        b.statusLabel = `จัดรถแล้วบางส่วน (${dispatchedItems.length}/${validItems.length} งาน)`;
      }
      updateBooking(b.id, b);

      // Check if targetRow still has any other job from this booking
      const stillHasJobInThisRow = (b.itinerary || []).some(it =>
        it.dispatched && (it.dispatchedRowId === targetRow.id || it.dispatchedToVehicle === targetRow.plate)
      );

      if (!stillHasJobInThisRow && targetRow.linkedBookingIds) {
        targetRow.linkedBookingIds = targetRow.linkedBookingIds.filter(id => id !== b.id);
      }
    });

    // Recalculate row's departments and bookers from remaining active bookings/jobs
    updateRowDepartmentsAndBookers(targetRow, allBookings);

    // 3. Remove jobText from targetRow.itineraryText cleanly
    if (targetRow.itineraryText) {
      const lines = targetRow.itineraryText.split('\n');
      const newLines = [];

      lines.forEach(line => {
        const jobsInLine = splitJobsFromLine(line);
        const remainingJobs = jobsInLine.filter(j => {
          const cleanJ = j.trim();
          const cleanTarget = jobText.trim();
          if (cleanJ === cleanTarget) return false;
          if (cleanTarget.length > 8 && cleanJ.includes(cleanTarget)) return false;
          if (cleanJ.length > 8 && cleanTarget.includes(cleanJ)) return false;
          return true;
        });
        if (remainingJobs.length > 0) {
          newLines.push(remainingJobs.join(' / '));
        }
      });

      targetRow.itineraryText = newLines.join('\n').trim();
      targetRow.itineraryLines = newLines;

      if (!targetRow.itineraryText) {
        targetRow.showItineraryBox = false;
      }
    }

    // 4. Clean up time in targetRow.time
    if (targetRow.time && removedTimes.length > 0) {
      const existingTimes = targetRow.time.split('/').map(t => t.trim()).filter(Boolean);
      const updatedTimes = existingTimes.filter(t => !removedTimes.includes(t));
      targetRow.time = updatedTimes.join(' / ');
    }

    // 5. Clean up structured itinerary if present
    if (targetRow.itinerary && Array.isArray(targetRow.itinerary)) {
      targetRow.itinerary = targetRow.itinerary.filter(it => {
        const dest = it.destination ? it.destination.trim() : '';
        const det = it.detail ? it.detail.trim() : '';
        return !((dest && jobText.includes(dest)) || (det && jobText.includes(det)));
      });
    }

    if (bookingChanged) {
      saveAllBookings(allBookings);
    }
    saveCurrentSchedule();
    syncBookingsWithSchedule();
    render();
    const shortLabel = jobText.length > 30 ? jobText.slice(0, 30) + '...' : jobText;
    showToast(`✓ ลบงาน "${shortLabel}" ออกจากรถคันที่ ${targetRow.no} เรียบร้อยแล้ว (งานกลับไปรอจัดใหม่)`);
  }

  // Format itinerary with subtle red/blue highlights and small delete cross buttons for each dispatched job
  function formatItineraryWithHighlights(text, row = null) {
    if (!text) return '';
    const allBookings = getAllBookings();

    // Find all bookings and items linked to this row
    const rowBookings = row ? allBookings.filter(b => {
      const isLinked = (row.linkedBookingIds && row.linkedBookingIds.includes(b.id)) ||
                       (b.assignedVehicle && row.plate && b.assignedVehicle === row.plate);
      return isLinked;
    }) : [];

    let jobGlobalCounter = 0;
    // Filter out empty lines completely to prevent excessive vertical gaps between jobs
    const validLines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (validLines.length === 0) return '';

    return validLines.map(line => {
      // Split line into individual jobs
      const jobs = splitJobsFromLine(line);
      if (jobs.length === 0) {
        return '';
      }

      const formattedJobs = jobs.map(job => {
        jobGlobalCounter++;
        const rawJobTrim = job.trim();

        // Strip existing order number prefix (e.g. "1. ", "1) ", "ลำดับที่ 1: ") so jobs are numbered sequentially
        const orderMatch = rawJobTrim.match(/^(\d+[\.\)]|ลำดับที่\s*\d+[:\.]?)\s*(.*)$/);
        let jobContent = rawJobTrim;

        if (orderMatch) {
          jobContent = orderMatch[2].trim();
        }
        const orderPrefix = `${jobGlobalCounter}.`;

        let formatted = escapeHtml(jobContent);
        // Highlight time ranges e.g. "เวลา 13.00-16.30 น.", "เวลา 13.00 - 17.00 น.", "18.00 น."
        formatted = formatted.replace(/(เวลา\s*\d{1,2}[\.:]\d{2}\s*[-–]\s*\d{1,2}[\.:]\d{2}\s*น\.)/g, '<span style="color: #dc2626; font-weight: 600;">$1</span>');
        formatted = formatted.replace(/(\b\d{1,2}[\.:]\d{2}\s*น\.)/g, '<span style="color: #dc2626; font-weight: 600;">$1</span>');
        formatted = formatted.replace(/(เครื่องลง\s*\d{1,2}[\.:]\d{2}\s*น\.)/g, '<span style="color: #0284c7; font-weight: 600;">$1</span>');
        formatted = formatted.replace(/(ติดต่อ\s*K\.[^\/\n]+)/g, '<span style="color: #dc2626; font-weight: 600;">$1</span>');

        // Match with specific booking item if available
        let matchedBookingId = '';
        let matchedItemNo = '';

        for (const b of rowBookings) {
          if (b.itinerary && Array.isArray(b.itinerary)) {
            for (let idx = 0; idx < b.itinerary.length; idx++) {
              const it = b.itinerary[idx];
              const dest = it.destination ? it.destination.trim() : '';
              const det = it.detail ? it.detail.trim() : '';
              if ((dest && job.includes(dest)) || (det && job.includes(det))) {
                matchedBookingId = b.id;
                matchedItemNo = String(it.no || (idx + 1));
                break;
              }
            }
          }
          if (matchedBookingId) break;
        }

        const rowIdAttr = row ? `data-row-id="${escapeHtml(row.id)}"` : '';
        const bIdAttr = matchedBookingId ? `data-booking-id="${escapeHtml(matchedBookingId)}"` : '';
        const itNoAttr = matchedItemNo ? `data-item-no="${escapeHtml(matchedItemNo)}"` : '';

        return `<span class="dispatch-job-segment" style="display: inline-flex; align-items: baseline; margin-right: 2px;"><span class="dispatch-job-order font-bold" style="color: #1e40af; margin-right: 5px; flex-shrink: 0;" contenteditable="false">${escapeHtml(orderPrefix)}</span><span>${formatted}</span><button type="button" class="btn-remove-job-item no-print" ${rowIdAttr} data-job-text="${escapeHtml(job)}" ${bIdAttr} ${itNoAttr} title="ลบงานนี้ออกจากรถคันนี้" contenteditable="false">✕</button></span>`;
      });

      return `<div class="dispatch-itinerary-line">${formattedJobs.join('<span class="dispatch-job-separator" style="color: #94a3b8; margin: 0 4px; font-weight: 600;" contenteditable="false">/</span>')}</div>`;
    }).filter(Boolean).join('');
  }

  render();
}
