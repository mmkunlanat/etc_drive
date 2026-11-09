// PaperModal.js - High-fidelity authentic replica of form FM-OFF-001/3/01-06-66
import { formatThaiDate } from '../store.js';

export function renderPaperModal(booking, onClose) {
  const existing = document.getElementById('paper-modal-backdrop');
  if (existing) existing.remove();

  const bookingThai = formatThaiDate(booking.bookingDate);
  const usageThai = formatThaiDate(booking.usageDate);

  // Ensure 6 rows for table to match original form (rows 1 to 6)
  const rows = [];
  const maxRows = 6;
  for (let i = 0; i < maxRows; i++) {
    const item = (booking.itinerary && booking.itinerary[i]) || { detail: '', note: '', time: '', passengers: '', destination: '' };
    const noteText = item.note || [item.time ? `${item.time} น.` : '', item.passengers ? `${item.passengers} คน` : ''].filter(Boolean).join(' / ');
    rows.push({
      no: i + 1,
      detail: item.detail || '',
      note: noteText,
      destination: item.destination || ''
    });
  }

  const modalHtml = `
    <div id="paper-modal-backdrop" class="paper-modal-backdrop">
      <div class="paper-modal-dialog">
        <div class="paper-modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.2rem;">📄</span>
            <div>
              <strong style="font-size: 0.95rem;">แบบฟอร์มเอกสารทางการ: FM-OFF-001</strong>
              <div style="font-size: 0.75rem; color: #94a3b8;">รหัสคำขอ: ${booking.id} (${booking.statusLabel})</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="btn-print-paper" class="btn-primary" style="padding: 5px 14px; font-size: 0.85rem;">
              🖨️ สั่งพิมพ์เอกสาร (Print A4)
            </button>
            <button id="btn-close-paper-modal" class="btn-ghost-light" style="padding: 5px 10px; font-size: 1.1rem;">
              ✕
            </button>
          </div>
        </div>
        <div class="paper-modal-body">
          <!-- Official Paper Sheet -->
          <div class="official-paper-sheet" id="printable-paper">
            
            <div class="paper-top-right-meta">
              <div class="meta-line">
                <span>วันที่จอง</span>
                <span class="dotted-line">${bookingThai.short || '-'}</span>
              </div>
            </div>

            <div class="paper-doc-title">ใบขออนุมัติการใช้รถ</div>

            <div class="paper-row" style="margin-top: 1.25rem;">
              <div class="fill-item" style="flex: 1 1 280px;">
                <span>ฝ่าย/แผนก</span>
                <span class="dotted-line" style="flex-grow: 1;">${booking.department || '-'}</span>
              </div>
              <div class="fill-item" style="flex: 1 1 320px;">
                <span>ขออนุมัติใช้รถ</span>
                <span class="dotted-line" style="flex-grow: 1;">${booking.assignedVehicle || booking.requestedVehicle || '-'}</span>
              </div>
            </div>

            <div class="paper-row" style="margin-top: 0.6rem;">
              <div class="fill-item">
                <span>วันที่ใช้งาน</span>
                <span class="dotted-line" style="min-width: 50px;">${usageThai.day || '-'}</span>
              </div>
              <div class="fill-item">
                <span>เดือน</span>
                <span class="dotted-line" style="min-width: 90px;">${usageThai.monthName || '-'}</span>
              </div>
              <div class="fill-item">
                <span>พ.ศ.</span>
                <span class="dotted-line" style="min-width: 60px;">${usageThai.buddhistYear || '-'}</span>
              </div>
              <div class="fill-item" style="margin-left: auto;">
                <span>ตั้งแต่เวลา</span>
                <span class="dotted-line" style="min-width: 60px;">${booking.startTime || '--:--'}</span>
                <span>น. ถึง</span>
                <span class="dotted-line" style="min-width: 60px;">${booking.endTime || '--:--'}</span>
                <span>น.</span>
              </div>
            </div>

            <!-- Table of Destinations -->
            <table class="paper-table">
              <thead>
                <tr>
                  <th style="width: 55px;">ลำดับที่</th>
                  <th>รายละเอียด</th>
                  <th style="width: 140px;">เวลา / จำนวนคน</th>
                  <th style="width: 250px;">สถานที่</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td style="text-align: center; font-weight: 600;">${r.no}.)</td>
                    <td>${r.detail}</td>
                    <td style="text-align: center;">${r.note}</td>
                    <td>${r.destination}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <!-- Notes -->
            <div class="paper-notes-box">
              <span style="font-weight: 600;">หมายเหตุ (อื่นๆ/ผู้โดยสาร)</span>
              <span class="dotted-line" style="min-width: 75%; text-align: left; padding-left: 8px;">
                ${booking.notes || '- ไม่มีข้อความเพิ่มเติม -'}
              </span>
            </div>

            <!-- Signatures Table (3 parts) -->
            <table class="paper-signatures-table">
              <thead>
                <tr>
                  <th colspan="2">หน่วยงานผู้ขอใช้รถ</th>
                  <th>ฝ่ายสำนักงาน</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div style="font-size: 11px; color: #4b6b94; margin-bottom: 6px;">ลงชื่อผู้ขอใช้รถ</div>
                    <div style="min-height: 35px; display: flex; align-items: center; justify-content: center; font-family: cursive; font-size: 16px; color: #1e3a8a;">
                      ${booking.bookerSignature || booking.bookerName || '...........................................'}
                    </div>
                    <div class="sig-name-line">
                      (${booking.bookerName || '...........................................'})
                    </div>
                  </td>
                  <td>
                    <div style="font-size: 11px; color: #4b6b94; margin-bottom: 6px;">ลงชื่อผู้อนุมัติ</div>
                    <div style="min-height: 35px; display: flex; align-items: center; justify-content: center; font-family: cursive; font-size: 16px; color: #1e3a8a;">
                      ${booking.approverSignature || '...........................................'}
                    </div>
                    <div class="sig-name-line">
                      (${booking.approverSignature ? booking.approverSignature : '...........................................'})
                    </div>
                  </td>
                  <td>
                    <div style="font-size: 11px; color: #4b6b94; margin-bottom: 6px;">ลงชื่อผู้จัดรถ</div>
                    <div style="min-height: 35px; display: flex; align-items: center; justify-content: center; font-family: cursive; font-size: 16px; color: #1e3a8a;">
                      ${booking.adminSignature || '...........................................'}
                    </div>
                    <div class="sig-name-line">
                      (${booking.adminSignature ? booking.adminSignature : '...........................................'})
                    </div>
                    ${booking.assignedDriver ? `
                      <div style="font-size: 11px; color: #1e40af; margin-top: 4px; font-weight: 500;">
                        ผู้ขับขี่: ${booking.assignedDriver}
                      </div>
                    ` : ''}
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Official Footer matching the paper -->
            <div class="paper-footer-bar">
              <div>
                <span>หมายเหตุ : กรุณากรอกรายละเอียดให้ครบถ้วน และส่ง </span>
                <span class="paper-footer-warning">"ใบขออนุมัติการใช้รถ" ภายใน 15.00 น.</span>
              </div>
              <div class="paper-form-code">${booking.formCode || 'FM-OFF-001/3/01-06-66'}</div>
            </div>

          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Close handlers
  const backdrop = document.getElementById('paper-modal-backdrop');
  const closeBtn = document.getElementById('btn-close-paper-modal');
  const printBtn = document.getElementById('btn-print-paper');

  const close = () => {
    window.removeEventListener('keydown', handleKey);
    backdrop.remove();
    if (onClose) onClose();
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') close();
  };

  window.addEventListener('keydown', handleKey);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  printBtn.addEventListener('click', () => {
    window.print();
  });
}
