// ApproverView.js - Department Head Approver Portal (หน้าผู้อนุมัติ)
// Workflow: แอดมินบันทึกตารางแล้วส่งมาที่นี่ -> ผู้อนุมัติตรวจตารางจัดรถและกดยืนยัน -> คนขับจึงจะเห็นงาน
import {
  formatThaiDate,
  formatSubmissionTime,
  getAllBookings,
  updateBooking,
  getAllScheduleApprovalMetas,
  getScheduleApprovalMeta,
  saveScheduleApprovalMeta,
  getAllDispatchSchedules,
  getDispatchSchedule
} from '../store.js';
import { renderPaperModal } from '../components/PaperModal.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderApproverView(container) {
  let activeTab = 'schedules'; // 'schedules' | 'pending' | 'history'
  let hasSetInitialTab = false;
  let viewingScheduleDateInHistory = null;

  function render() {
    const bookings = getAllBookings();
    const pendingList = bookings.filter(b => b.status === 'pending_approval');
    const historyList = bookings.filter(b => b.status !== 'pending_approval');

    const allScheduleMetas = getAllScheduleApprovalMetas();
    const allDispatchSchedules = getAllDispatchSchedules();

    // Query pending schedule dates (admin submitted, awaiting approver confirmation)
    const pendingScheduleDates = Object.keys(allDispatchSchedules).filter(d => {
      const meta = getScheduleApprovalMeta(d);
      const rows = allDispatchSchedules[d];
      return meta.status === 'pending_approval' && rows && rows.length > 0;
    });
    Object.keys(allScheduleMetas).forEach(d => {
      if (allScheduleMetas[d]?.status === 'pending_approval' && !pendingScheduleDates.includes(d)) {
        const rows = getDispatchSchedule(d);
        if (rows && rows.length > 0) {
          pendingScheduleDates.push(d);
        }
      }
    });

    // Query confirmed / approved schedule dates for history
    const approvedScheduleDates = Object.keys(allScheduleMetas).filter(d => {
      return allScheduleMetas[d]?.status === 'approved';
    });

    // Smart default tab selection on initial render
    if (!hasSetInitialTab) {
      hasSetInitialTab = true;
      if (pendingScheduleDates.length > 0) {
        activeTab = 'schedules';
      } else if (pendingList.length > 0) {
        activeTab = 'pending';
      } else {
        activeTab = 'schedules';
      }
    }

    container.innerHTML = `
      <div class="approver-portal-wrapper">
        
        <!-- Header -->
        <div class="content-card" style="margin-bottom: 1.5rem; background: linear-gradient(135deg, #1e293b, #0f172a); color: #fff;">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="width: 52px; height: 52px; background: #3b82f6; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.6rem;">
                👔
              </div>
              <div>
                <h2 style="font-size: 1.3rem; font-weight: 700; color: #fff;">
                  ระบบพิจารณาอนุมัติและยืนยันตารางจัดรถ (Approver Portal)
                </h2>
                <p style="font-size: 0.85rem; color: #94a3b8;">
                  สำหรับหัวหน้าฝ่าย / ผู้จัดการ ตรวจสอบใบขอใช้รถ และตรวจยืนยันตารางจัดสรรรถก่อนส่งงานให้พนักงานขับรถ
                </p>
              </div>
            </div>

            <!-- Tab Buttons -->
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button id="btn-tab-schedules" class="btn-primary" style="background: ${activeTab === 'schedules' ? '#2563eb' : 'rgba(255,255,255,0.1)'}; font-size: 0.88rem; padding: 7px 14px; position: relative;">
                <span>📊 ตารางจัดรถรอการยืนยัน</span>
                <span style="background: ${pendingScheduleDates.length > 0 ? '#ef4444' : 'rgba(255,255,255,0.3)'}; color: #fff; font-size: 0.72rem; padding: 2px 7px; border-radius: 10px; margin-left: 6px; font-weight: 700;">
                  ${pendingScheduleDates.length}
                </span>
              </button>

              <button id="btn-tab-pending" class="btn-primary" style="background: ${activeTab === 'pending' ? '#2563eb' : 'rgba(255,255,255,0.1)'}; font-size: 0.88rem; padding: 7px 14px;">
                <span>⏳ ใบขอใช้รถรออนุมัติ</span>
                <span style="background: ${pendingList.length > 0 ? '#f59e0b' : 'rgba(255,255,255,0.3)'}; color: #fff; font-size: 0.72rem; padding: 2px 7px; border-radius: 10px; margin-left: 6px; font-weight: 700;">
                  ${pendingList.length}
                </span>
              </button>

              <button id="btn-tab-hist" class="btn-primary" style="background: ${activeTab === 'history' ? '#2563eb' : 'rgba(255,255,255,0.1)'}; font-size: 0.88rem; padding: 7px 14px;">
                <span>📜 ประวัติที่ดำเนินการแล้ว</span>
                <span style="background: rgba(255,255,255,0.25); color: #fff; font-size: 0.72rem; padding: 2px 7px; border-radius: 10px; margin-left: 6px;">
                  ${historyList.length + approvedScheduleDates.length}
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Tab Body -->
        ${activeTab === 'schedules' 
          ? renderPendingSchedulesSection(pendingScheduleDates) 
          : (activeTab === 'pending' ? renderPendingSection(pendingList) : renderHistorySection(historyList, approvedScheduleDates))}

      </div>
    `;

    attachEvents();
  }

  // =========================================================================
  // Section 1: Pending Schedule Approvals (ตรวจตารางจัดรถจากแอดมินก่อนส่งให้คนขับ)
  // =========================================================================
  function renderPendingSchedulesSection(pendingScheduleDates) {
    if (pendingScheduleDates.length === 0) {
      return `
        <div class="content-card" style="text-align: center; padding: 3.5rem 1.5rem; max-width: 650px; margin: 1.5rem auto;">
          <div style="font-size: 3rem; margin-bottom: 0.75rem;">📊</div>
          <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--slate-800);">ไม่มีตารางจัดรถรอการยืนยันในขณะนี้</h3>
          <p style="color: var(--slate-500); font-size: 0.92rem; margin-top: 8px; line-height: 1.6;">
            ตารางจัดสรรรถทั้งหมดได้รับการยืนยันเรียบร้อยแล้ว หรือแอดมินยังไม่ได้บันทึกส่งตารางเข้ามา<br>
            เมื่อแอดมินกด <strong>"💾 บันทึกและส่งให้ผู้อนุมัติตรวจ"</strong> ตารางจะปรากฏที่นี่ เพื่อให้ท่านตรวจและกดยืนยันส่งงานให้คนขับดูทันที
          </p>
        </div>
      `;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 1.5rem;">
        ${pendingScheduleDates.map(dateIso => {
          const thaiDate = formatThaiDate(dateIso);
          const meta = getScheduleApprovalMeta(dateIso);
          const rows = getDispatchSchedule(dateIso) || [];
          const activeRows = rows.filter(r => r.plate || r.driverName || r.itineraryText || (r.itineraryLines && r.itineraryLines.length) || r.booker);
          const displayRows = activeRows.length > 0 ? activeRows : rows;

          return `
            <div class="content-card schedule-review-card" data-date="${dateIso}" style="border: 1.5px solid #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06); padding: 1.5rem;">
              
              <!-- Card Header -->
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 1rem; margin-bottom: 1.25rem;">
                <div>
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 1.25rem;">📋</span>
                    <h3 style="font-size: 1.25rem; font-weight: 700; color: #002060; margin: 0;">
                      ตารางจัดรถ ประจำวันที่ ${thaiDate.full}
                    </h3>
                    <span style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; font-size: 0.75rem; font-weight: 700; padding: 3px 10px; border-radius: 12px;">
                      ⏳ แอดมินส่งตารางมาเพื่อรอการตรวจสอบและยืนยัน
                    </span>
                  </div>
                  <div style="font-size: 0.8rem; color: #64748b; margin-top: 5px;">
                    ส่งตารางโดย: <strong>${escapeHtml(meta.submittedBy || 'ฝ่ายบริหารยานพาหนะ')}</strong> | 
                    ส่งเมื่อ: <strong>${meta.submittedAt ? new Date(meta.submittedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : '-'}</strong> | 
                    จำนวนยานพาหนะในตาราง: <strong>${displayRows.length} คัน</strong>
                  </div>
                </div>

                <div style="font-size: 0.85rem; color: #1e40af; background: #eff6ff; padding: 6px 14px; border-radius: 8px; border: 1px solid #bfdbfe; font-weight: 600;">
                  ⚠️ คนขับจะยังไม่เห็นงาน จนกว่าท่านจะกดยืนยันด้านล่าง
                </div>
              </div>

              <!-- Dispatch Sheet Spreadsheet View -->
              <div class="table-responsive" style="border: 1px solid #cbd5e1; border-radius: 6px; overflow-x: auto; background: #fff; margin-bottom: 1.5rem;">
                <table class="dispatch-excel-table" style="width: 100%; border-collapse: collapse; font-size: 0.88rem;">
                  <thead>
                    <tr style="background: #002060; color: #fff;">
                      <th style="width: 45px; text-align: center; padding: 8px 4px; border: 1px solid #cbd5e1;">ลำดับ</th>
                      <th style="width: 140px; text-align: center; padding: 8px 6px; border: 1px solid #cbd5e1;">ทะเบียนรถ</th>
                      <th style="width: 65px; text-align: center; padding: 8px 4px; border: 1px solid #cbd5e1;">รหัส</th>
                      <th style="width: 150px; text-align: center; padding: 8px 6px; border: 1px solid #cbd5e1;">พนักงานขับรถ</th>
                      <th style="width: 80px; text-align: center; padding: 8px 4px; border: 1px solid #cbd5e1;">เวลา</th>
                      <th style="width: 150px; text-align: center; padding: 8px 6px; border: 1px solid #cbd5e1;">ฝ่าย/แผนก</th>
                      <th style="width: 130px; text-align: center; padding: 8px 6px; border: 1px solid #cbd5e1;">ผู้จอง</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${displayRows.length === 0 ? `
                      <tr>
                        <td colspan="7" style="text-align: center; padding: 1.5rem; color: #94a3b8;">
                          ไม่มีข้อมูลยานพาหนะในตาราง
                        </td>
                      </tr>
                    ` : displayRows.map((row, idx) => {
                      const plateClass = row.plateColor === 'green' ? 'plate-bg-green' : (row.plateColor === 'yellow' ? 'plate-bg-yellow' : 'plate-bg-default');
                      const timeClass = row.timeColor === 'pink' ? 'time-bg-pink' : '';
                      const itinText = row.itineraryText || (Array.isArray(row.itineraryLines) ? row.itineraryLines.filter(Boolean).join('\n') : '');
                      const hasItinerary = !!(itinText && itinText.trim());
                      const hasComment = !!(row.comment && row.comment.trim());

                      return `
                        <!-- Main Car Row -->
                        <tr style="border-bottom: 1px solid #e2e8f0; background: #fff;">
                          <td style="text-align: center; font-weight: 700; padding: 8px 4px; border: 1px solid #e2e8f0;">${row.no || (idx + 1)}</td>
                          <td class="${plateClass}" style="text-align: center; font-weight: 700; padding: 8px 6px; border: 1px solid #e2e8f0;">
                            ${escapeHtml(row.plate || '-')}
                          </td>
                          <td style="text-align: center; font-weight: 600; padding: 8px 4px; border: 1px solid #e2e8f0; color: #475569;">
                            ${escapeHtml(row.driverCode || '-')}
                          </td>
                          <td style="padding: 8px 8px; border: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">
                            ${escapeHtml(row.driverName || '-')}
                          </td>
                          <td class="${timeClass}" style="text-align: center; font-weight: 700; padding: 8px 4px; border: 1px solid #e2e8f0;">
                            ${escapeHtml(row.time || '-')}
                          </td>
                          <td style="padding: 8px 8px; border: 1px solid #e2e8f0; color: #334155; font-size: 0.82rem;">
                            ${escapeHtml(row.department || '-')}
                          </td>
                          <td style="text-align: center; font-weight: 700; padding: 8px 6px; border: 1px solid #e2e8f0; color: #1e40af;">
                            ${escapeHtml(row.booker || '-')}
                          </td>
                        </tr>

                        <!-- Sub-row: Itinerary -->
                        ${hasItinerary ? `
                          <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                            <td colspan="7" style="padding: 8px 16px; border: 1px solid #e2e8f0;">
                              <div style="font-weight: 700; color: #1e3a8a; font-size: 0.78rem; margin-bottom: 2px;">
                                📍 แผนการเดินทางและภารกิจ:
                              </div>
                              <div style="white-space: pre-wrap; font-size: 0.85rem; color: #1e293b; line-height: 1.45;">${escapeHtml(itinText)}</div>
                            </td>
                          </tr>
                        ` : ''}

                        <!-- Sub-row: Comment -->
                        ${hasComment ? `
                          <tr style="background: #fffbeb; border-bottom: 1px solid #e2e8f0;">
                            <td colspan="7" style="padding: 6px 16px; border: 1px solid #e2e8f0;">
                              <div style="font-size: 0.82rem; color: #92400e;">
                                <strong>💬 หมายเหตุ/คอมเม้นต์:</strong> ${escapeHtml(row.comment)}
                              </div>
                            </td>
                          </tr>
                        ` : ''}
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>

              <!-- Approver Decision & Sign-off Area -->
              <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 1.25rem;">
                <div style="font-weight: 700; color: #0f172a; font-size: 0.98rem; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 6px;">
                  <span>✍️</span>
                  <span>การลงนามพิจารณาและยืนยันตารางจัดรถ (ประจำวันที่ ${thaiDate.short})</span>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-bottom: 1rem;">
                  <div>
                    <label style="font-size: 0.78rem; font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">
                      ชื่อ-นามสกุล ผู้อนุมัติ / ตำแหน่ง:
                    </label>
                    <input 
                      type="text" 
                      class="form-control sched-approver-name" 
                      value="เกรียงไกร มีอำนาจ (ผู้จัดการฝ่าย)" 
                      style="font-size: 0.88rem; padding: 6px 10px;"
                    />
                  </div>

                  <div>
                    <label style="font-size: 0.78rem; font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">
                      ความเห็นประกอบการอนุมัติ / ข้อกำชับเพิ่มเติม (ถ้ามี):
                    </label>
                    <input 
                      type="text" 
                      class="form-control sched-approver-remark" 
                      placeholder="เช่น อนุมัติตามตารางจัดรถ ขอให้คนขับขับขี่ด้วยความปลอดภัยและตรงต่อเวลา" 
                      style="font-size: 0.85rem; padding: 6px 10px;"
                    />
                  </div>
                </div>

                <!-- Action Buttons -->
                <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: flex-end;">
                  <button 
                    type="button" 
                    class="btn-secondary btn-return-schedule-admin" 
                    data-date="${dateIso}" 
                    style="color: #dc2626; border-color: #fca5a5; font-size: 0.88rem; padding: 8px 16px; font-weight: 600;"
                    title="ส่งตารางกลับให้แอดมินแก้ไขก่อนอนุมัติ"
                  >
                    💬 ส่งกลับให้แอดมินแก้ไข
                  </button>

                  <button 
                    type="button" 
                    class="btn-primary btn-confirm-schedule-approval" 
                    data-date="${dateIso}" 
                    style="background: #059669; font-weight: 700; padding: 9px 22px; font-size: 0.95rem; box-shadow: 0 2px 4px rgba(5,150,105,0.25);"
                    title="กดยืนยันเพื่ออนุมัติตารางและส่งงานให้คนขับดูทันที"
                  >
                    ✓ ยืนยันและอนุมัติตารางจัดรถ (ส่งงานให้คนขับดูทันที)
                  </button>
                </div>

              </div>

            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // =========================================================================
  // Section 2: Individual Booking Requests Pending Approval
  // =========================================================================
  function renderPendingSection(pendingList) {
    if (pendingList.length === 0) {
      return `
        <div class="content-card" style="text-align: center; padding: 3rem 1rem; max-width: 560px; margin: 1rem auto;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📋</div>
          <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--slate-800);">ไม่มีรายการใบขอใช้รถรออนุมัติในขณะนี้</h3>
          <p style="color: var(--slate-500); font-size: 0.9rem; margin-top: 4px;">
            ทุกคำขอได้รับการพิจารณาเรียบร้อยแล้ว หรือยังไม่มีคำขอใหม่จากผู้ขอใช้รถ
          </p>
        </div>
      `;
    }

    return `
      <div class="approver-grid">
        ${pendingList.map(req => {
          const usageThai = formatThaiDate(req.usageDate);
          const bookingThai = formatThaiDate(req.bookingDate);
          const itineraryItems = Array.isArray(req.itinerary) && req.itinerary.length > 0 ? req.itinerary : [];

          return `
            <div class="approval-card" data-id="${req.id}">
              <div class="approval-card-main-content">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--slate-100); padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
                  <div>
                    <strong style="color: #1e40af; font-size: 1.05rem;">${req.id}</strong>
                    <div style="font-size: 0.74rem; color: #475569; margin-top: 2px;">
                      ส่งฟอร์ม: <strong>${formatSubmissionTime(req)}</strong> (${bookingThai.short})
                    </div>
                  </div>
                  <button class="btn-outline-blue btn-view-paper-form" data-id="${req.id}" style="padding: 3px 8px; font-size: 0.75rem;">
                    📄 แบบฟอร์ม
                  </button>
                </div>

                <div class="approval-card-body">
                  <div class="info-row">
                    <span class="label">ผู้ขอใช้รถ:</span>
                    <span class="val">${escapeHtml(req.bookerName)} (${escapeHtml(req.department)})</span>
                  </div>
                  <div class="info-row">
                    <span class="label">เบอร์โทรติดต่อ:</span>
                    <span class="val">${escapeHtml(req.bookerPhone || '-')}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">วันที่ใช้งาน:</span>
                    <span class="val" style="color: #1e3a8a; font-weight: 600;">${usageThai.full}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">ช่วงเวลา:</span>
                    <span class="val">${req.startTime} - ${req.endTime} น.</span>
                  </div>
                  ${req.assignedDriver ? `
                    <div class="info-row">
                      <span class="label">พนักงานขับรถ:</span>
                      <span class="val" style="color: #059669;">${escapeHtml(req.assignedDriver)}</span>
                    </div>
                  ` : ''}
                </div>

                <!-- Itinerary items 1 - 6 with all details -->
                <div class="approver-itinerary-box">
                  <div class="approver-itinerary-header">
                    <span style="font-weight: 700; color: #1e293b; font-size: 0.82rem;">
                      รายละเอียดภารกิจและสถานที่ (ลำดับ 1 - 6)
                    </span>
                    <span class="approver-count-tag">${itineraryItems.length} รายการ</span>
                  </div>

                  <div class="approver-table-wrap">
                    <table class="approver-mini-table">
                      <thead>
                        <tr>
                          <th style="width: 40px; text-align: center;">ลำดับ</th>
                          <th>ภารกิจ / วัตถุประสงค์</th>
                          <th style="width: 110px; text-align: center;">เวลา / ผู้โดยสาร</th>
                          <th style="width: 140px;">สถานที่ปลายทาง</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${itineraryItems.length === 0 ? `
                          <tr>
                            <td colspan="4" style="text-align: center; color: var(--slate-400); padding: 8px;">
                              - ไม่มีข้อมูลแผนการเดินทาง -
                            </td>
                          </tr>
                        ` : itineraryItems.map((item, idx) => {
                          const rowNo = item.no || (idx + 1);
                          const timeStr = item.time ? `${item.time} น.` : '';
                          const passStr = item.passengers ? `${item.passengers} คน` : '';
                          const timePassengers = item.note || [timeStr, passStr].filter(Boolean).join(' / ') || '-';
                          return `
                            <tr>
                              <td style="text-align: center; font-weight: 700; color: #1d4ed8;">${rowNo}.)</td>
                              <td style="font-weight: 500; color: #1e293b; line-height: 1.35;">${escapeHtml(item.detail || '-')}</td>
                              <td style="text-align: center; white-space: nowrap;">
                                <span class="time-pass-tag">${escapeHtml(timePassengers)}</span>
                              </td>
                              <td style="color: #334155; line-height: 1.35;">
                                <span style="color: #2563eb; font-weight: 600;">📍</span> ${escapeHtml(item.destination || '-')}
                              </td>
                            </tr>
                          `;
                        }).join('')}
                      </tbody>
                    </table>
                  </div>

                  ${req.notes ? `
                    <div class="approver-card-notes">
                      <span style="font-weight: 600; color: #475569;">หมายเหตุ / ผู้โดยสารร่วม:</span>
                      <span style="color: #1e293b; margin-left: 4px;">${escapeHtml(req.notes)}</span>
                    </div>
                  ` : `
                    <div class="approver-card-notes" style="color: var(--slate-400);">
                      <span style="font-weight: 600; color: #475569;">หมายเหตุ:</span>
                      <span style="margin-left: 4px;">- ไม่มีระบุเพิ่มเติม -</span>
                    </div>
                  `}
                </div>

                <!-- Approver Sign-off Input -->
                <div class="approver-sign-inputs" style="margin-top: 0.5rem; flex-shrink: 0;">
                  <label style="font-size: 0.78rem; font-weight: 600; color: var(--slate-700); display: block; margin-bottom: 3px;">
                    ลงชื่อผู้อนุมัติ (ชื่อ-นามสกุล / ตำแหน่ง):
                  </label>
                  <input 
                    type="text" 
                    class="form-control approver-name-input" 
                    value="เกรียงไกร มีอำนาจ (ผู้จัดการฝ่าย)" 
                    style="font-size: 0.85rem; padding: 5px 8px;" 
                  />
                  
                  <input 
                    type="text" 
                    class="form-control approver-remark-input" 
                    placeholder="ความเห็นหรือเหตุผลที่ไม่อนุมัติ / หมายเหตุประกอบ" 
                    style="font-size: 0.8rem; padding: 6px 8px; margin-top: 5px;" 
                  />
                </div>
              </div>

              <!-- Action buttons -->
              <div class="approval-card-actions">
                <button class="btn-primary btn-approve-req" data-id="${req.id}" style="flex: 1; justify-content: center; background: #059669; font-size: 0.85rem; padding: 7px 10px;">
                  ✓ อนุมัติคำขอ
                </button>
                <button class="btn-secondary btn-reject-req" data-id="${req.id}" style="color: #dc2626; border-color: #fecaca; font-size: 0.85rem; padding: 7px 12px;">
                  ✕ ไม่อนุมัติ
                </button>
              </div>

            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // =========================================================================
  // Section 3: History (ตารางจัดรถที่อนุมัติแล้ว & ใบขอใช้รถที่พิจารณาแล้ว)
  // =========================================================================
  function renderHistorySection(historyList, approvedScheduleDates) {
    return `
      <div style="display: flex; flex-direction: column; gap: 1.5rem;">
        
        <!-- Part A: Approved Dispatch Schedules -->
        <div class="content-card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 10px;">
            <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--slate-800); display: flex; align-items: center; gap: 8px;">
              <span>✅</span>
              <span>ตารางจัดสรรรถที่ได้รับการอนุมัติและยืนยันแล้ว (${approvedScheduleDates.length} วัน)</span>
            </h3>
            <span style="font-size: 0.8rem; color: #059669; font-weight: 600;">
              * งานเหล่านี้ส่งให้คนขับสามารถดูและกดรับงานได้แล้ว
            </span>
          </div>

          ${approvedScheduleDates.length === 0 ? `
            <div style="text-align: center; padding: 1.5rem; color: #94a3b8; font-size: 0.9rem;">
              ยังไม่มีตารางจัดรถที่ได้รับการยืนยัน
            </div>
          ` : `
            <div class="table-responsive">
              <table class="bookings-list-table">
                <thead>
                  <tr>
                    <th>วันที่จัดรถ</th>
                    <th>ผู้อนุมัติและยืนยัน</th>
                    <th>เวลาที่ยืนยัน</th>
                    <th>ความเห็น / หมายเหตุ</th>
                    <th>สถานะ</th>
                    <th style="text-align: center;">ตารางจัดรถ</th>
                  </tr>
                </thead>
                <tbody>
                  ${approvedScheduleDates.map(dateIso => {
                    const thaiDate = formatThaiDate(dateIso);
                    const meta = getScheduleApprovalMeta(dateIso);
                    const rows = getDispatchSchedule(dateIso) || [];
                    const isViewing = viewingScheduleDateInHistory === dateIso;

                    return `
                      <tr>
                        <td>
                          <strong style="color: #002060; font-size: 0.95rem;">${thaiDate.full}</strong>
                          <div style="font-size: 0.74rem; color: #64748b; margin-top: 2px;">
                            ยานพาหนะ: ${rows.length} คัน
                          </div>
                        </td>
                        <td><strong>${escapeHtml(meta.confirmedBy || 'เกรียงไกร มีอำนาจ')}</strong></td>
                        <td style="font-size: 0.85rem; color: #334155;">
                          ${meta.confirmedAt ? new Date(meta.confirmedAt).toLocaleDateString('th-TH', { dateStyle: 'short' }) + ' ' + new Date(meta.confirmedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : '-'}
                        </td>
                        <td style="font-size: 0.82rem; color: #475569; max-width: 220px;">
                          ${escapeHtml(meta.remark || 'อนุมัติตารางจัดรถเรียบร้อย')}
                        </td>
                        <td>
                          <span style="background: #dcfce7; color: #15803d; border: 1px solid #86efac; font-size: 0.75rem; font-weight: 700; padding: 3px 8px; border-radius: 6px;">
                            ✓ ยืนยันแล้ว (ส่งให้คนขับ)
                          </span>
                        </td>
                        <td style="text-align: center;">
                          <button 
                            type="button" 
                            class="btn-outline-blue btn-toggle-history-schedule" 
                            data-date="${dateIso}" 
                            style="padding: 4px 10px; font-size: 0.78rem;"
                          >
                            ${isViewing ? 'ซ่อนตาราง' : '👁️ ดูตาราง'}
                          </button>
                        </td>
                      </tr>

                      ${isViewing ? `
                        <tr>
                          <td colspan="6" style="padding: 12px; background: #f8fafc;">
                            <div style="border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; background: #fff;">
                              <table class="dispatch-excel-table" style="width: 100%; font-size: 0.82rem;">
                                <thead>
                                  <tr style="background: #002060; color: #fff;">
                                    <th style="padding: 6px;">ลำดับ</th>
                                    <th style="padding: 6px;">ทะเบียนรถ</th>
                                    <th style="padding: 6px;">รหัส</th>
                                    <th style="padding: 6px;">คนขับ</th>
                                    <th style="padding: 6px;">เวลา</th>
                                    <th style="padding: 6px;">ฝ่าย</th>
                                    <th style="padding: 6px;">ผู้จอง</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  ${rows.map((r, i) => `
                                    <tr style="border-bottom: 1px solid #e2e8f0;">
                                      <td style="text-align: center; padding: 6px;">${r.no || (i + 1)}</td>
                                      <td style="text-align: center; font-weight: 700; padding: 6px;">${escapeHtml(r.plate || '-')}</td>
                                      <td style="text-align: center; padding: 6px;">${escapeHtml(r.driverCode || '-')}</td>
                                      <td style="padding: 6px;">${escapeHtml(r.driverName || '-')}</td>
                                      <td style="text-align: center; padding: 6px;">${escapeHtml(r.time || '-')}</td>
                                      <td style="padding: 6px;">${escapeHtml(r.department || '-')}</td>
                                      <td style="text-align: center; font-weight: 600; padding: 6px;">${escapeHtml(r.booker || '-')}</td>
                                    </tr>
                                    ${r.itineraryText ? `
                                      <tr style="background: #f1f5f9;">
                                        <td colspan="7" style="padding: 4px 12px; font-size: 0.78rem; color: #334155;">
                                          📍 ${escapeHtml(r.itineraryText)}
                                        </td>
                                      </tr>
                                    ` : ''}
                                  `).join('')}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ` : ''}
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <!-- Part B: Individual Booking Requests History -->
        <div class="content-card">
          <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 1rem; color: var(--slate-800);">
            รายการใบขอใช้รถที่ดำเนินการพิจารณาแล้ว (${historyList.length})
          </h3>
          <div class="table-responsive">
            <table class="bookings-list-table">
              <thead>
                <tr>
                  <th>รหัสคำขอ</th>
                  <th>วันที่ใช้งาน</th>
                  <th>ผู้ขอใช้รถ & แผนก</th>
                  <th>ผู้อนุมัติ</th>
                  <th>สถานะ / ความเห็น</th>
                  <th style="text-align: center;">ดูแบบฟอร์ม</th>
                </tr>
              </thead>
              <tbody>
                ${historyList.map(h => {
                  const uThai = formatThaiDate(h.usageDate);
                  return `
                    <tr>
                      <td>
                        <strong style="color: #1e40af;">${h.id}</strong>
                        <div style="font-size: 0.72rem; color: #475569; margin-top: 2px;">
                           ส่งฟอร์ม: <strong>${formatSubmissionTime(h)}</strong>
                        </div>
                        <div style="font-size: 0.68rem; color: #94a3b8;">
                          ${formatThaiDate(h.bookingDate).short}
                        </div>
                      </td>
                      <td>${uThai.short} (${h.startTime} - ${h.endTime} น.)</td>
                      <td>${escapeHtml(h.bookerName)} <div style="font-size: 0.75rem; color: var(--slate-400);">${escapeHtml(h.department)}</div></td>
                      <td>${escapeHtml(h.approverSignature || '-')}</td>
                      <td>
                        <span class="status-badge ${h.status}">${h.statusLabel}</span>
                        ${h.approverRemark ? `
                          <div style="font-size: 0.72rem; color: ${h.status === 'rejected' ? '#dc2626' : 'var(--slate-500)'}; margin-top: 3px; max-width: 220px; line-height: 1.3;">
                            <strong style="color: ${h.status === 'rejected' ? '#b91c1c' : 'inherit'};">${h.status === 'rejected' ? 'เหตุผล: ' : 'ความเห็น: '}</strong>${escapeHtml(h.approverRemark)}
                          </div>
                        ` : ''}
                      </td>
                      <td style="text-align: center;">
                        <button class="btn-outline-blue btn-view-paper-form" data-id="${h.id}" style="padding: 3px 8px; font-size: 0.75rem;">
                          📄 แบบฟอร์ม
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;
  }

  // =========================================================================
  // Events Binding
  // =========================================================================
  function attachEvents() {
    const tabSched = document.getElementById('btn-tab-schedules');
    const tabPending = document.getElementById('btn-tab-pending');
    const tabHist = document.getElementById('btn-tab-hist');

    if (tabSched) tabSched.addEventListener('click', () => { activeTab = 'schedules'; render(); });
    if (tabPending) tabPending.addEventListener('click', () => { activeTab = 'pending'; render(); });
    if (tabHist) tabHist.addEventListener('click', () => { activeTab = 'history'; render(); });

    // Toggle view schedule in history
    container.querySelectorAll('.btn-toggle-history-schedule').forEach(btn => {
      btn.addEventListener('click', () => {
        const date = btn.getAttribute('data-date');
        viewingScheduleDateInHistory = viewingScheduleDateInHistory === date ? null : date;
        render();
      });
    });

    // Confirm Schedule Approval (Admin -> Approver -> Driver)
    container.querySelectorAll('.btn-confirm-schedule-approval').forEach(btn => {
      btn.addEventListener('click', () => {
        const dateIso = btn.getAttribute('data-date');
        const card = btn.closest('.schedule-review-card');
        const approverName = card?.querySelector('.sched-approver-name')?.value.trim() || 'เกรียงไกร มีอำนาจ (ผู้จัดการฝ่าย)';
        const remark = card?.querySelector('.sched-approver-remark')?.value.trim() || 'อนุมัติตารางจัดรถเรียบร้อย';

        // 1. Save approval meta
        saveScheduleApprovalMeta(dateIso, {
          status: 'approved',
          confirmedAt: new Date().toISOString(),
          confirmedBy: approverName,
          remark: remark
        });

        // 2. Also synchronize linked bookings for this date
        const rows = getDispatchSchedule(dateIso) || [];
        const allBookings = getAllBookings();
        rows.forEach(r => {
          const linkedIds = Array.isArray(r.linkedBookingIds) ? r.linkedBookingIds : [];
          linkedIds.forEach(id => {
            const b = allBookings.find(x => x.id === id);
            if (b) {
              updateBooking(b.id, {
                status: 'dispatched',
                statusLabel: 'จัดรถแล้ว (อนุมัติตารางแล้ว)',
                approverSignature: approverName,
                assignedVehicle: r.plate || b.assignedVehicle,
                assignedDriver: r.driverName || b.assignedDriver
              });
            }
          });
        });

        showToast(`✓ ยืนยันและอนุมัติตารางจัดรถวันที่ ${formatThaiDate(dateIso).short} เรียบร้อยแล้ว! (ส่งงานให้คนขับดูทันที)`);
        render();
      });
    });

    // Return Schedule to Admin for Edits
    container.querySelectorAll('.btn-return-schedule-admin').forEach(btn => {
      btn.addEventListener('click', () => {
        const dateIso = btn.getAttribute('data-date');
        const card = btn.closest('.schedule-review-card');
        const approverName = card?.querySelector('.sched-approver-name')?.value.trim() || 'เกรียงไกร มีอำนาจ (ผู้จัดการฝ่าย)';
        const inputRemark = card?.querySelector('.sched-approver-remark')?.value.trim() || '';

        let reason = inputRemark;
        if (!reason) {
          reason = prompt('กรุณาระบุสิ่งที่ต้องการให้แอดมินแก้ไขเพิ่มเติมในตารางจัดรถ:', 'ขอให้ปรับเปลี่ยนคนขับหรือจัดคิวรถใหม่');
        }

        if (reason !== null && reason.trim()) {
          saveScheduleApprovalMeta(dateIso, {
            status: 'draft',
            confirmedAt: null,
            confirmedBy: null,
            remark: `ผู้อนุมัติส่งกลับแก้ไข: ${reason.trim()} (โดย ${approverName})`
          });

          showToast(`ส่งตารางจัดรถวันที่ ${formatThaiDate(dateIso).short} กลับให้แอดมินแก้ไขเรียบร้อย`);
          render();
        }
      });
    });

    // View Paper Form Modal
    container.querySelectorAll('.btn-view-paper-form').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const b = getAllBookings().find(x => x.id === id);
        if (b) {
          renderPaperModal(b, {
            onEdit: (booking) => {
              window.dispatchEvent(new CustomEvent('edit_booking_in_form', { detail: booking }));
            },
            onConfirm: (booking) => {
              if (booking.status === 'pending_approval') {
                updateBooking(booking.id, {
                  status: 'approved',
                  statusLabel: 'อนุมัติแล้ว (รอจัดสรรรถ/คนขับ)',
                  approverSignature: 'ผู้อนุมัติฝ่าย',
                  approverRemark: 'อนุมัติตามระเบียบการใช้รถ'
                });
                showToast(`อนุมัติคำขอ ${booking.id} สำเร็จแล้ว`);
                render();
              }
            }
          });
        }
      });
    });

    // Approve Individual Request
    container.querySelectorAll('.btn-approve-req').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const card = btn.closest('.approval-card');
        const sigName = card.querySelector('.approver-name-input').value.trim() || 'ผู้อนุมัติฝ่าย';
        const remark = card.querySelector('.approver-remark-input').value.trim();

        updateBooking(id, {
          status: 'approved',
          statusLabel: 'อนุมัติแล้ว (รอจัดสรรรถ/คนขับ)',
          approverSignature: sigName,
          approverRemark: remark || 'อนุมัติตามระเบียบการใช้รถ'
        });

        showToast(`อนุมัติคำขอ ${id} สำเร็จแล้ว ส่งต่อให้ฝ่ายสำนักงานจัดรถ`);
        render();
      });
    });

    // Reject Individual Request
    container.querySelectorAll('.btn-reject-req').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const card = btn.closest('.approval-card');
        const sigName = card ? (card.querySelector('.approver-name-input')?.value.trim() || 'ผู้อนุมัติฝ่าย') : 'ผู้อนุมัติฝ่าย';
        const inputRemark = card ? card.querySelector('.approver-remark-input')?.value.trim() : '';

        let reason = inputRemark;
        if (!reason) {
          reason = prompt('กรุณาระบุเหตุผลที่ไม่อนุมัติคำขอนี้ เพื่อแจ้งให้ผู้ขอทราบ:', 'ติดภารกิจอื่น / ไม่สอดคล้องกับระเบียบการใช้รถส่วนกลาง');
        }

        if (reason !== null && reason.trim()) {
          updateBooking(id, {
            status: 'rejected',
            statusLabel: 'ไม่อนุมัติ',
            approverSignature: sigName,
            approverRemark: reason.trim()
          });
          showToast(`บันทึกผลไม่อนุมัติคำขอ ${id} เรียบร้อยแล้ว`);
          render();
        }
      });
    });
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
