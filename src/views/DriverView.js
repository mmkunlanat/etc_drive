// DriverView.js - Driver Portal (หน้าของพนักงานขับรถ)
// Spec: "สามารถดูได้แค่ว่าวันนี้มีงานอะไรบ้างไปที่ไหน"
import {
  getTodayISODate,
  formatThaiDate,
  getAllBookings,
  updateBooking,
  DRIVER_POOL
} from '../store.js';
import { renderPaperModal } from '../components/PaperModal.js';

export function renderDriverView(container) {
  let selectedDriverId = 'drv_1'; // Default to first driver
  const todayIso = getTodayISODate();

  function render() {
    const allBookings = getAllBookings();
    const currentDriver = DRIVER_POOL.find(d => d.id === selectedDriverId) || DRIVER_POOL[0];
    const todayThai = formatThaiDate(todayIso);

    // Filter jobs assigned to this driver for today (or matching date/driver)
    const todayTrips = allBookings.filter(b => {
      // Matches driver assignment or driver id, and date is today (or dispatched status)
      const isMyDriver = b.assignedDriverId === selectedDriverId || 
                         (b.assignedDriver && b.assignedDriver.includes(currentDriver.name));
      const isToday = b.usageDate === todayIso;
      return isMyDriver && (b.status === 'dispatched' || b.status === 'completed' || isToday);
    });

    container.innerHTML = `
      <div class="driver-portal-wrap">
        
        <!-- Driver Profile & Shift Header -->
        <div class="driver-hero-banner">
          <div class="driver-profile">
            <div class="driver-avatar">👨‍✈️</div>
            <div class="driver-info">
              <h2>${currentDriver.name}</h2>
              <p>พนักงานขับรถส่วนกลาง | ใบขับขี่: ${currentDriver.license} | 📞 ${currentDriver.phone}</p>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <div class="today-chip">
              <span>📅 วันนี้:</span>
              <strong>${todayThai.full}</strong>
            </div>

            <!-- Driver Switcher for demo/testing -->
            <select id="driver-selector" class="form-control" style="background: rgba(255,255,255,0.9); font-weight: 600; width: auto; padding: 6px 12px; font-size: 0.85rem;">
              ${DRIVER_POOL.filter(d => d.id !== 'drv_self').map(d => `
                <option value="${d.id}" ${d.id === selectedDriverId ? 'selected' : ''}>
                  คนขับ: ${d.name}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Section Title -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
          <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--slate-800); display: flex; align-items: center; gap: 8px;">
            <span>📋</span>
            <span>ตารางงานขับรถวันนี้ (ไปที่ไหนบ้าง)</span>
          </h3>
          <span style="font-size: 0.85rem; font-weight: 600; color: #2563eb; background: #eff6ff; padding: 4px 12px; border-radius: 20px;">
            มีทั้งหมด ${todayTrips.length} ภารกิจ
          </span>
        </div>

        <!-- Trips List -->
        ${todayTrips.length === 0 ? renderEmptyState(todayThai) : todayTrips.map(trip => renderTripCard(trip)).join('')}

      </div>
    `;

    attachEvents();
  }

  function renderEmptyState(todayThai) {
    return `
      <div class="content-card" style="text-align: center; padding: 3rem 1.5rem;">
        <div style="font-size: 3.5rem; margin-bottom: 0.75rem;">☕</div>
        <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--slate-800); margin-bottom: 0.4rem;">
          วันนี้ไม่มีคิวงานขับรถ
        </h3>
        <p style="color: var(--slate-500); max-width: 450px; margin: 0 auto 1.5rem; font-size: 0.9rem;">
          ไม่มีภารกิจที่ได้รับมอบหมายในวันที่ ${todayThai.full} สามารถตรวจสอบความพร้อมของยานพาหนะ หรือรอการประสานงานจากฝ่ายจัดรถครับ
        </p>
        <div style="font-size: 0.82rem; color: var(--slate-400);">
          * เมื่อฝ่ายจัดรถ (Admin) มอบหมายงานให้คุณ คิวงานจะปรากฏในหน้านี้ทันที
        </div>
      </div>
    `;
  }

  function renderTripCard(trip) {
    const isCompleted = trip.driverJobStatus === 'completed';
    const isInProgress = trip.driverJobStatus === 'in_progress';

    return `
      <div class="driver-trip-card" data-id="${trip.id}">
        
        <div class="trip-card-header">
          <div class="trip-time-badge">
            <span>⏰</span>
            <span>เวลา ${trip.startTime} - ${trip.endTime} น.</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="trip-car-info">
              🚘 ${trip.assignedVehicle || trip.requestedVehicle || 'รอยืนยันรถ'}
            </span>
            <span class="status-badge ${trip.status}">
              ${trip.statusLabel}
            </span>
          </div>
        </div>

        <!-- Destination & Route Details: "ไปที่ไหนบ้าง" -->
        <div style="font-size: 0.9rem; font-weight: 600; color: var(--slate-700); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 6px;">
          <span>📍</span>
          <span>จุดหมายและแผนการเดินทาง (Route Itinerary):</span>
        </div>

        <div class="trip-route-timeline">
          ${trip.itinerary && trip.itinerary.map((step, idx) => {
            const isLast = idx === trip.itinerary.length - 1;
            return `
              <div class="route-step ${isLast ? 'finish' : ''}">
                <div class="step-dest">
                  ${idx + 1}. ${step.destination || 'ไม่ได้ระบุ'}
                </div>
                <div class="step-detail">
                  ภารกิจ: ${step.detail || '-'}
                </div>
                ${step.note ? `
                  <div class="step-note">
                    ⏱️ นัดหมาย/ผู้โดยสาร: ${step.note}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>

        <!-- Passenger & Booker info -->
        <div class="trip-footer-details">
          <div>
            <div style="font-size: 0.88rem; font-weight: 600; color: var(--slate-800);">
              👤 ผู้ขอใช้รถ: ${trip.bookerName} (${trip.department})
            </div>
            <div style="font-size: 0.8rem; color: var(--slate-600); margin-top: 2px;">
              📝 หมายเหตุ/ผู้โดยสาร: ${trip.notes || '-'}
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${trip.bookerPhone ? `
              <a href="tel:${trip.bookerPhone}" class="call-btn">
                <span>📞 โทรติดต่อ</span>
                <span>(${trip.bookerPhone})</span>
              </a>
            ` : ''}

            <button class="btn-secondary-sm btn-driver-view-paper" data-id="${trip.id}">
              📄 ดูใบงาน FM-OFF-001
            </button>
          </div>
        </div>

        <!-- Driver Action Buttons -->
        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px dashed var(--slate-200);">
          ${isCompleted ? `
            <span style="font-size: 0.85rem; font-weight: 600; color: #059669; display: flex; align-items: center; gap: 4px;">
              ✅ ปฏิบัติภารกิจเสร็จสิ้นแล้ว
            </span>
          ` : isInProgress ? `
            <button class="btn-primary btn-complete-trip" data-id="${trip.id}" style="background: #059669; padding: 6px 16px; font-size: 0.85rem;">
              🏁 ถึงจุดหมาย / เสร็จสิ้นภารกิจ
            </button>
          ` : `
            <button class="btn-primary btn-start-trip" data-id="${trip.id}" style="padding: 6px 16px; font-size: 0.85rem;">
              🚗 เริ่มออกเดินทาง
            </button>
          `}
        </div>

      </div>
    `;
  }

  function attachEvents() {
    const driverSelect = document.getElementById('driver-selector');
    if (driverSelect) {
      driverSelect.addEventListener('change', (e) => {
        selectedDriverId = e.target.value;
        render();
      });
    }

    // View Paper Form
    container.querySelectorAll('.btn-driver-view-paper').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const b = getAllBookings().find(x => x.id === id);
        if (b) renderPaperModal(b);
      });
    });

    // Start Trip
    container.querySelectorAll('.btn-start-trip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        updateBooking(id, {
          driverJobStatus: 'in_progress',
          statusLabel: 'อยู่ระหว่างเดินทาง'
        });
        showToast('เริ่มออกเดินทางแล้ว ขอให้ขับขี่ปลอดภัยครับ');
        render();
      });
    });

    // Complete Trip
    container.querySelectorAll('.btn-complete-trip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        updateBooking(id, {
          driverJobStatus: 'completed',
          status: 'completed',
          statusLabel: 'เสร็จสิ้นภารกิจ'
        });
        showToast('บันทึกเสร็จสิ้นภารกิจเรียบร้อยแล้ว ขอบคุณครับ');
        render();
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
