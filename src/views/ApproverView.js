// ApproverView.js - Department Head Approver Portal (หน้าผู้อนุมัติ)
import {
  formatThaiDate,
  formatSubmissionTime,
  getAllBookings,
  updateBooking
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
  let activeTab = 'pending'; // 'pending' | 'history'

  function render() {
    const bookings = getAllBookings();
    const pendingList = bookings.filter(b => b.status === 'pending_approval');
    const historyList = bookings.filter(b => b.status !== 'pending_approval');

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
                  ระบบพิจารณาอนุมัติการใช้รถ (Approver Portal)
                </h2>
                <p style="font-size: 0.85rem; color: #94a3b8;">
                  สำหรับหัวหน้าฝ่าย / ผู้จัดการแผนก พิจารณาตรวจสอบความจำเป็นและอนุมัติใบขอใช้รถ
                </p>
              </div>
            </div>

            <div style="display: flex; gap: 8px;">
              <button id="btn-tab-pending" class="btn-primary" style="background: ${activeTab === 'pending' ? '#2563eb' : 'rgba(255,255,255,0.1)'}; font-size: 0.88rem; padding: 6px 14px;">
                ⏳ รอพิจารณาอนุมัติ (${pendingList.length})
              </button>
              <button id="btn-tab-hist" class="btn-primary" style="background: ${activeTab === 'history' ? '#2563eb' : 'rgba(255,255,255,0.1)'}; font-size: 0.88rem; padding: 6px 14px;">
                📜 ประวัติที่พิจารณาแล้ว (${historyList.length})
              </button>
            </div>
          </div>
        </div>

        ${activeTab === 'pending' ? renderPendingSection(pendingList) : renderHistorySection(historyList)}

      </div>
    `;

    attachEvents();
  }

  function renderPendingSection(pendingList) {
    if (pendingList.length === 0) {
      return `
        <div class="content-card" style="text-align: center; padding: 3rem 1rem; max-width: 560px; margin: 1rem auto;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📋</div>
          <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--slate-800);">ไม่มีรายการรออนุมัติในขณะนี้</h3>
          <p style="color: var(--slate-500); font-size: 0.9rem; margin-top: 4px;">
            ทุกคำขอได้รับการพิจารณาเรียบร้อยแล้ว หรือยังไม่มีคำขอใหม่จากผู้ใต้บังคับบัญชา
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
              <div>
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
                  ` : ''}
                </div>

                <!-- Approver Sign-off Input -->
                <div style="margin-top: 0.75rem;">
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
              <div style="display: flex; gap: 8px; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--slate-100);">
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

  function renderHistorySection(historyList) {
    return `
      <div class="content-card">
        <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 1rem; color: var(--slate-800);">
          รายการที่ดำเนินการพิจารณาแล้ว
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
    `;
  }

  function attachEvents() {
    const tabPending = document.getElementById('btn-tab-pending');
    const tabHist = document.getElementById('btn-tab-hist');

    if (tabPending) tabPending.addEventListener('click', () => { activeTab = 'pending'; render(); });
    if (tabHist) tabHist.addEventListener('click', () => { activeTab = 'history'; render(); });

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
