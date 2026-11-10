// AdminView.js - Fleet & Dispatch Admin Portal (หน้าแอดมิน / ฝ่ายสำนักงาน ผู้จัดรถ)
import {
  formatThaiDate,
  formatSubmissionTime,
  getAllBookings,
  updateBooking,
  VEHICLE_TYPES,
  DRIVER_POOL,
  resetToSeedData
} from '../store.js';
import { renderPaperModal } from '../components/PaperModal.js';

export function renderAdminView(container) {
  let activeFilter = 'all'; // 'all' | 'needs_dispatch' | 'dispatched'

  function render() {
    const bookings = getAllBookings();

    // Filter
    let filtered = bookings;
    if (activeFilter === 'needs_dispatch') {
      filtered = bookings.filter(b => b.status === 'approved');
    } else if (activeFilter === 'dispatched') {
      filtered = bookings.filter(b => b.status === 'dispatched' || b.status === 'completed');
    }

    const needsDispatchCount = bookings.filter(b => b.status === 'approved').length;

    container.innerHTML = `
      <div class="admin-portal-wrapper">
        
        <!-- Admin Header -->
        <div class="content-card" style="background: linear-gradient(135deg, #091e3a, #1a365d); color: #fff; margin-bottom: 1.5rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="width: 52px; height: 52px; background: #0284c7; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.6rem;">
                ⚙️
              </div>
              <div>
                <h2 style="font-size: 1.3rem; font-weight: 700; color: #fff;">
                  ระบบผู้จัดรถ & บริหารยานพาหนะ (Fleet Dispatch Admin)
                </h2>
                <p style="font-size: 0.85rem; color: #bae6fd;">
                  ฝ่ายสำนักงาน: จัดสรรรถประจำตำแหน่ง ทะเบียนรถ และมอบหมายพนักงานขับรถตามแบบฟอร์ม
                </p>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <button id="btn-reset-demo" class="btn-ghost-light" style="font-size: 0.8rem;">
                🔄 รีเซ็ตข้อมูลตัวอย่าง (Reset Demo)
              </button>
            </div>
          </div>
        </div>

        <!-- Filter tabs & stats -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
          <div class="role-nav-group" style="background: var(--slate-200); border: none;">
            <button class="role-tab-btn ${activeFilter === 'all' ? 'active' : ''}" id="filter-all" style="color: ${activeFilter === 'all' ? '#fff' : 'var(--slate-700)'};">
              📋 คำขอทั้งหมด (${bookings.length})
            </button>
            <button class="role-tab-btn ${activeFilter === 'needs_dispatch' ? 'active' : ''}" id="filter-needs" style="color: ${activeFilter === 'needs_dispatch' ? '#fff' : 'var(--slate-700)'};">
              🚨 รอฝ่ายสำนักงานจัดรถ (${needsDispatchCount})
            </button>
            <button class="role-tab-btn ${activeFilter === 'dispatched' ? 'active' : ''}" id="filter-dispatched" style="color: ${activeFilter === 'dispatched' ? '#fff' : 'var(--slate-700)'};">
              ✅ จัดสรรเสร็จสิ้นแล้ว
            </button>
          </div>

          <div style="font-size: 0.85rem; color: var(--slate-500);">
            พร้อมให้บริการ: รถส่วนกลาง <strong>5 คัน</strong> | คนขับ <strong>3 ท่าน</strong>
          </div>
        </div>

        <!-- Dispatch List -->
        <div class="content-card">
          <div class="table-responsive">
            <table class="bookings-list-table">
              <thead>
                <tr>
                  <th>รหัส / วันที่ยื่น</th>
                  <th>กำหนดวันและเวลาใช้รถ</th>
                  <th>ผู้ขอใช้รถ & แผนก</th>
                  <th>รถและคนขับที่มอบหมาย</th>
                  <th>สถานะการจัดรถ</th>
                  <th style="text-align: center;">ดำเนินการจัดรถ</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--slate-400);">
                      ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา
                    </td>
                  </tr>
                ` : filtered.map(item => {
      const uThai = formatThaiDate(item.usageDate);
      const isApprovedNeedsDispatch = item.status === 'approved';

      return `
                    <tr style="${isApprovedNeedsDispatch ? 'background-color: #f0fdf4;' : ''}">
                      <td>
                        <strong style="color: #1e40af;">${item.id}</strong>
                        <div style="font-size: 0.72rem; color: #475569; margin-top: 2px;">
                           ส่งฟอร์ม: <strong>${formatSubmissionTime(item)}</strong>
                        </div>
                        <div style="font-size: 0.68rem; color: #94a3b8;">
                          ยื่นเมื่อ ${formatThaiDate(item.bookingDate).short}
                        </div>
                      </td>
                      <td>
                        <div style="font-weight: 600;">${uThai.short}</div>
                        <div style="font-size: 0.78rem; color: var(--slate-500);">${item.startTime} - ${item.endTime} น.</div>
                      </td>
                      <td>
                        <div><strong>${item.bookerName}</strong></div>
                        <div style="font-size: 0.75rem; color: var(--slate-500);">${item.department}</div>
                        <div style="font-size: 0.72rem; color: #2563eb;">โทร: ${item.bookerPhone || '-'}</div>
                      </td>
                      <td>
                        <div>🚘 <strong>${item.assignedVehicle || item.requestedVehicle || '-'}</strong></div>
                        <div style="font-size: 0.78rem; color: ${item.assignedDriver ? '#059669' : '#d97706'};">
                          👨‍✈️ ${item.assignedDriver || '⏳ ยังไม่ได้จัดคนขับ'}
                        </div>
                      </td>
                      <td>
                        <span class="status-badge ${item.status}">
                          ${item.statusLabel}
                        </span>
                      </td>
                      <td style="text-align: center;">
                        <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                          <button class="btn-primary btn-open-dispatch" data-id="${item.id}" style="padding: 4px 10px; font-size: 0.78rem; background: ${isApprovedNeedsDispatch ? '#059669' : '#2563eb'};">
                            ${item.assignedVehicle ? '✏️ แก้ไขรถ/คนขับ' : '⚡ จัดสรรรถและคนขับ'}
                          </button>
                          <button class="btn-outline-blue btn-admin-view-paper" data-id="${item.id}" style="padding: 4px 8px; font-size: 0.78rem;">
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

      </div>
    `;

    attachEvents();
  }

  function attachEvents() {
    const fAll = document.getElementById('filter-all');
    const fNeeds = document.getElementById('filter-needs');
    const fDispatched = document.getElementById('filter-dispatched');
    const resetDemo = document.getElementById('btn-reset-demo');

    if (fAll) fAll.addEventListener('click', () => { activeFilter = 'all'; render(); });
    if (fNeeds) fNeeds.addEventListener('click', () => { activeFilter = 'needs_dispatch'; render(); });
    if (fDispatched) fDispatched.addEventListener('click', () => { activeFilter = 'dispatched'; render(); });

    if (resetDemo) {
      resetDemo.addEventListener('click', () => {
        if (confirm('คุณต้องการรีเซ็ตข้อมูลเป็นชุดเริ่มต้นของระบบหรือไม่?')) {
          resetToSeedData();
          showToast('รีเซ็ตข้อมูลตัวอย่างเรียบร้อยแล้ว');
          render();
        }
      });
    }

    container.querySelectorAll('.btn-admin-view-paper').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const b = getAllBookings().find(x => x.id === id);
        if (b) renderPaperModal(b);
      });
    });

    container.querySelectorAll('.btn-open-dispatch').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const b = getAllBookings().find(x => x.id === id);
        if (b) openDispatchModal(b);
      });
    });
  }

  function openDispatchModal(booking) {
    const modalId = 'dispatch-modal-backdrop';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const uThai = formatThaiDate(booking.usageDate);

    const html = `
      <div id="${modalId}" class="paper-modal-backdrop">
        <div class="paper-modal-dialog" style="max-width: 580px;">
          <div class="paper-modal-header" style="background: #0f172a;">
            <div style="font-size: 1rem; font-weight: 700;">
              🚗 จัดสรรรถและพนักงานขับรถ (${booking.id})
            </div>
            <button id="btn-close-dispatch-modal" class="btn-ghost-light">✕</button>
          </div>
          <div class="paper-modal-body" style="background: #fff;">
            
            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 0.85rem;">
              <div><strong>ผู้ขอ:</strong> ${booking.bookerName} (${booking.department})</div>
              <div><strong>วันเวลาที่ใช้งาน:</strong> ${uThai.full} เวลา ${booking.startTime} - ${booking.endTime} น.</div>
              <div><strong>ประเภทรถที่ต้องการ:</strong> ${booking.requestedVehicle || 'ตามการจัดสรรส่วนกลาง'}</div>
              <div><strong>ปลายทาง:</strong> ${booking.itinerary && booking.itinerary[0] ? booking.itinerary[0].destination : '-'}</div>
            </div>

            <form id="dispatch-form">
              
              <div class="form-group" style="margin-bottom: 14px;">
                <label class="form-label">
                  <span>เลือกรถที่จัดสรร (พร้อมทะเบียน)</span>
                  <span class="required">*</span>
                </label>
                <select id="dispatch-vehicle" class="form-control" required>
                  ${VEHICLE_TYPES.filter(v => v.id !== 'v_custom').map(v => `
                    <option value="${v.label} ทะเบียน ${v.plate}" ${booking.assignedVehicle && booking.assignedVehicle.includes(v.plate) ? 'selected' : ''}>
                      ${v.label} [ทะเบียน: ${v.plate}]
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 14px;">
                <label class="form-label">
                  <span>เลือกพนักงานขับรถที่มอบหมาย</span>
                  <span class="required">*</span>
                </label>
                <select id="dispatch-driver" class="form-control" required>
                  ${DRIVER_POOL.map(d => `
                    <option value="${d.id}" ${booking.assignedDriverId === d.id ? 'selected' : ''}>
                      ${d.name} (${d.phone})
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 18px;">
                <label class="form-label">
                  <span>ลงชื่อผู้จัดรถ ฝ่ายสำนักงาน</span>
                  <span class="required">*</span>
                </label>
                <input 
                  type="text" 
                  id="dispatch-admin-sig" 
                  class="form-control" 
                  value="${booking.adminSignature || 'สิริมา จัดสรรดี (ฝ่ายสำนักงาน)'}" 
                  required 
                />
              </div>

              <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button type="button" id="btn-cancel-dispatch" class="btn-secondary">ยกเลิก</button>
                <button type="submit" class="btn-primary" style="background: #059669;">
                  ✓ ยืนยันการจัดรถและแจ้งคนขับ
                </button>
              </div>

            </form>

          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const backdrop = document.getElementById(modalId);
    const closeBtn = document.getElementById('btn-close-dispatch-modal');
    const cancelBtn = document.getElementById('btn-cancel-dispatch');
    const form = document.getElementById('dispatch-form');

    const close = () => backdrop.remove();
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const vehicleVal = document.getElementById('dispatch-vehicle').value;
      const driverId = document.getElementById('dispatch-driver').value;
      const driverObj = DRIVER_POOL.find(d => d.id === driverId);
      const adminSig = document.getElementById('dispatch-admin-sig').value;

      updateBooking(booking.id, {
        assignedVehicle: vehicleVal,
        assignedDriverId: driverId,
        assignedDriver: `${driverObj.name} (โทร. ${driverObj.phone})`,
        adminSignature: adminSig,
        status: 'dispatched',
        statusLabel: 'จัดรถและคนขับแล้ว (พร้อมเดินทาง)'
      });

      close();
      showToast(`จัดสรรรถให้คำขอ ${booking.id} เรียบร้อยแล้ว! งานจะแสดงในหน้าคนขับ`);
      render();
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
