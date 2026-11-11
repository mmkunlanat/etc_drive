// DriverView.js - Driver Portal (หน้าของพนักงานขับรถ)
// Spec: ดึงข้อมูลงานจากแอดมินที่แอดมินบันทึกงานแล้ว, ดูงานวันนี้และวันถัดไปได้, ถ้ามากกว่า 1 งานต้องกดยืนยันไปทีละงาน, ทะเบียนรถเด่นชัด
import {
  getTodayISODate,
  addDaysToDate,
  formatThaiDate,
  getAllBookings,
  updateBooking,
  getDispatchSchedule,
  saveDispatchSchedule,
  getScheduleApprovalMeta,
  DRIVER_POOL
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

function parseVehiclePlate(vehicleStr) {
  if (!vehicleStr) {
    return { plate: 'รอยืนยันจัดรถ', type: 'ยังไม่ระบุคัน', colorClass: '' };
  }
  const match = vehicleStr.match(/^([^(]+)(?:\(([^)]+)\))?/);
  if (match) {
    const plate = match[1].trim();
    const type = match[2] ? match[2].trim() : 'ยานพาหนะส่วนกลาง';
    let colorClass = '';
    if (plate.startsWith('7ข')) colorClass = 'plate-green';
    else if (plate.startsWith('6') || plate.startsWith('4') || plate.startsWith('ง')) colorClass = 'plate-yellow';
    return { plate, type, colorClass };
  }
  return { plate: vehicleStr, type: 'ยานพาหนะส่วนกลาง', colorClass: '' };
}

function parseItineraryFromText(rawTextOrLines) {
  if (!rawTextOrLines) return [];
  const rawLines = typeof rawTextOrLines === 'string' 
    ? rawTextOrLines.split('\n') 
    : (Array.isArray(rawTextOrLines) ? rawTextOrLines : []);
  const cleanLines = rawLines.map(l => l.trim()).filter(Boolean);
  const items = [];
  
  cleanLines.forEach((line) => {
    const subStops = line.split('/').map(s => s.trim()).filter(Boolean);
    if (subStops.length > 1) {
      subStops.forEach(stop => {
        items.push({
          no: items.length + 1,
          detail: stop,
          destination: stop,
          note: '',
          completed: false,
          completedAt: null
        });
      });
    } else {
      items.push({
        no: items.length + 1,
        detail: line,
        destination: line,
        note: '',
        completed: false,
        completedAt: null
      });
    }
  });
  
  return items;
}

// Pull jobs directly from Admin's recorded daily dispatch schedule & linked bookings
// Each distinct booking / assignment is preserved as its own individual job
function getDriverJobsForDate(dateIso, driver, allBookings) {
  if (!driver) return [];
  
  // 1. Get Admin's recorded dispatch schedule for this date
  const dispatchRows = getDispatchSchedule(dateIso) || [];
  
  // 2. Find rows in Admin's dispatch table assigned to this driver
  const myDispatchRows = dispatchRows.filter(r => {
    if (!r) return false;
    const nameMatch = r.driverName && (
      r.driverName.trim().toLowerCase().includes(driver.name.trim().toLowerCase()) ||
      driver.name.trim().toLowerCase().includes(r.driverName.trim().toLowerCase())
    );
    const codeMatch = r.driverCode && r.driverCode !== '#N/A' && String(r.driverCode).trim() === String(driver.code).trim();
    
    // Check if the row has any actual work assigned
    const hasText = r.itineraryText && r.itineraryText.trim();
    const hasLines = Array.isArray(r.itineraryLines) && r.itineraryLines.length > 0 && r.itineraryLines.some(l => l && l.trim());
    const hasBooker = r.booker && r.booker.trim();
    const hasLinkedBookings = Array.isArray(r.linkedBookingIds) && r.linkedBookingIds.length > 0;
    const hasWork = Boolean(hasText || hasLines || hasBooker || hasLinkedBookings);
    
    return (nameMatch || codeMatch) && hasWork;
  });

  const jobs = [];
  const processedBookingIds = new Set();

  // Standardize itinerary steps so every item has completed and completedAt
  const sanitizeItinerary = (rawList) => {
    if (!Array.isArray(rawList)) return [];
    return rawList.map((step, idx) => ({
      no: step.no || (idx + 1),
      destination: step.destination || step.detail || `จุดหมายที่ ${idx + 1}`,
      detail: step.detail || step.destination || '',
      note: step.note || '',
      time: step.time || '',
      passengers: step.passengers || '',
      completed: Boolean(step.completed),
      completedAt: step.completedAt || null
    }));
  };

  // 3. Build job cards from Admin's dispatch schedule rows
  // If a row has multiple bookings, each booking MUST be its own independent job card!
  myDispatchRows.forEach(row => {
    const linkedIds = Array.isArray(row.linkedBookingIds) ? row.linkedBookingIds : [];
    const linkedBookings = linkedIds.map(id => allBookings.find(b => b.id === id)).filter(Boolean);

    if (linkedBookings.length > 0) {
      linkedBookings.forEach(b => {
        processedBookingIds.add(b.id);
        
        const rawList = (b.itinerary && b.itinerary.length > 0)
          ? b.itinerary
          : ((row.itinerary && row.itinerary.length > 0) ? row.itinerary : parseItineraryFromText(row.itineraryText || row.itineraryLines));

        const itinerary = sanitizeItinerary(rawList);
        const allCompleted = itinerary.length > 0 && itinerary.every(s => s.completed);
        const anyCompleted = itinerary.some(s => s.completed);

        let jobStatus = b.driverJobStatus || row.driverJobStatus || 'not_started';
        if (allCompleted) {
          jobStatus = 'completed';
        } else if (anyCompleted && jobStatus !== 'completed') {
          jobStatus = 'in_progress';
        }

        jobs.push({
          id: b.id,
          dispatchRowId: row.id,
          dispatchRowNo: row.no,
          isFromAdminDispatch: true,
          usageDate: dateIso,
          startTime: b.startTime || (row.time ? row.time.replace('.', ':') : '08:30'),
          endTime: b.endTime || '17:00',
          assignedVehicle: row.plate || b.assignedVehicle || 'รอยืนยันรถ',
          assignedDriver: row.driverName || driver.name,
          assignedDriverId: driver.id,
          bookerName: b.bookerName || row.booker || '-',
          bookerPhone: b.bookerPhone || '',
          department: b.department || row.department || '-',
          notes: b.notes || row.comment || '',
          itinerary: itinerary,
          status: allCompleted ? 'completed' : (b.status || 'dispatched'),
          statusLabel: allCompleted ? 'เสร็จสิ้นภารกิจ' : (b.statusLabel || 'จัดรถแล้ว (ตารางจัดรถแอดมิน)'),
          driverConfirmed: Boolean(b.driverConfirmed || row.driverConfirmed || false),
          driverConfirmedAt: b.driverConfirmedAt || row.driverConfirmedAt || '',
          driverJobStatus: jobStatus
        });
      });
    } else {
      // Standalone row in dispatch schedule without linked formal booking
      const rawList = (row.itinerary && row.itinerary.length > 0)
        ? row.itinerary
        : parseItineraryFromText(row.itineraryText || row.itineraryLines);
      
      const itinerary = sanitizeItinerary(rawList);
      const allCompleted = itinerary.length > 0 && itinerary.every(s => s.completed);
      const anyCompleted = itinerary.some(s => s.completed);

      let jobStatus = row.driverJobStatus || 'not_started';
      if (allCompleted) {
        jobStatus = 'completed';
      } else if (anyCompleted && jobStatus !== 'completed') {
        jobStatus = 'in_progress';
      }

      jobs.push({
        id: `DISP-${dateIso}-R${row.no}`,
        dispatchRowId: row.id,
        dispatchRowNo: row.no,
        isFromAdminDispatch: true,
        usageDate: dateIso,
        startTime: row.time ? row.time.replace('.', ':') : '08:30',
        endTime: '17:00',
        assignedVehicle: row.plate || 'รอยืนยันรถ',
        assignedDriver: row.driverName || driver.name,
        assignedDriverId: driver.id,
        bookerName: row.booker || '-',
        bookerPhone: '',
        department: row.department || '-',
        notes: row.comment || '',
        itinerary: itinerary,
        status: allCompleted ? 'completed' : 'dispatched',
        statusLabel: allCompleted ? 'เสร็จสิ้นภารกิจ' : 'จัดรถแล้ว (ตารางจัดรถแอดมิน)',
        driverConfirmed: Boolean(row.driverConfirmed || false),
        driverConfirmedAt: row.driverConfirmedAt || '',
        driverJobStatus: jobStatus
      });
    }
  });

  // 4. Also check direct bookings assigned to this driver for this date that weren't linked in Admin rows
  const directBookings = allBookings.filter(b => {
    if (!b || processedBookingIds.has(b.id)) return false;
    const matchId = b.assignedDriverId === driver.id;
    const matchName = b.assignedDriver && (
      b.assignedDriver.toLowerCase().includes(driver.name.toLowerCase()) ||
      driver.name.toLowerCase().includes(b.assignedDriver.toLowerCase())
    );
    const isThisDate = b.usageDate === dateIso;
    const isDispatched = b.status === 'dispatched' || b.status === 'completed' || b.status === 'approved';
    return (matchId || matchName) && isThisDate && isDispatched;
  });

  directBookings.forEach(b => {
    processedBookingIds.add(b.id);
    const itinerary = sanitizeItinerary(b.itinerary || []);
    const allCompleted = itinerary.length > 0 && itinerary.every(s => s.completed);
    const anyCompleted = itinerary.some(s => s.completed);

    let jobStatus = b.driverJobStatus || 'not_started';
    if (allCompleted) {
      jobStatus = 'completed';
    } else if (anyCompleted && jobStatus !== 'completed') {
      jobStatus = 'in_progress';
    }

    jobs.push({
      id: b.id,
      dispatchRowId: null,
      dispatchRowNo: null,
      isFromAdminDispatch: false,
      usageDate: b.usageDate || dateIso,
      startTime: b.startTime || '08:30',
      endTime: b.endTime || '17:00',
      assignedVehicle: b.assignedVehicle || b.requestedVehicle || 'รอยืนยันรถ',
      assignedDriver: b.assignedDriver || driver.name,
      assignedDriverId: driver.id,
      bookerName: b.bookerName,
      bookerPhone: b.bookerPhone,
      department: b.department,
      notes: b.notes,
      itinerary: itinerary,
      status: allCompleted ? 'completed' : b.status,
      statusLabel: allCompleted ? 'เสร็จสิ้นภารกิจ' : b.statusLabel,
      driverConfirmed: Boolean(b.driverConfirmed || false),
      driverConfirmedAt: b.driverConfirmedAt || '',
      driverJobStatus: jobStatus
    });
  });

  return jobs;
}

// Synchronize status updates strictly to THIS specific job and its corresponding record
function updateJobStatus(job, updates) {
  // 1. Update this specific booking if it has a real booking ID
  if (job.id && job.id.startsWith('REQ-')) {
    updateBooking(job.id, updates);
  }

  // 2. Also update Admin's dispatch schedule row
  if (job.usageDate && job.dispatchRowId) {
    const rows = getDispatchSchedule(job.usageDate);
    if (rows && rows.length > 0) {
      const targetRow = rows.find(r => r.id === job.dispatchRowId || r.no === String(job.dispatchRowNo));
      if (targetRow) {
        if (!targetRow.confirmedBookingIds) targetRow.confirmedBookingIds = [];
        if (updates.driverConfirmed) {
          if (!targetRow.confirmedBookingIds.includes(job.id)) {
            targetRow.confirmedBookingIds.push(job.id);
          }
        }
        
        // If row has multiple linked bookings, check if all of them are now confirmed
        const allLinked = targetRow.linkedBookingIds || [];
        const isRowAllConfirmed = allLinked.length > 0 
          ? allLinked.every(bId => targetRow.confirmedBookingIds.includes(bId))
          : (updates.driverConfirmed ?? targetRow.driverConfirmed);

        if (updates.driverConfirmed !== undefined) {
          targetRow.driverConfirmed = isRowAllConfirmed;
        }
        if (updates.driverConfirmedAt !== undefined) {
          targetRow.driverConfirmedAt = updates.driverConfirmedAt;
        }
        if (updates.driverJobStatus !== undefined) {
          targetRow.driverJobStatus = updates.driverJobStatus;
        }
        if (updates.itinerary !== undefined) {
          targetRow.itinerary = updates.itinerary;
        }

        saveDispatchSchedule(job.usageDate, rows);
      }
    }
  }
}

export function renderDriverView(container) {
  let selectedDriverId = localStorage.getItem('last_driver_id') || 'drv_5';
  let activeDateTab = 'today'; // 'today' | 'tomorrow' | 'all'

  const todayIso = getTodayISODate();
  const tomorrowIso = addDaysToDate(todayIso, 1);
  const todayThai = formatThaiDate(todayIso);
  const tomorrowThai = formatThaiDate(tomorrowIso);

  function render() {
    const allBookings = getAllBookings();
    const currentDriver = DRIVER_POOL.find(d => d.id === selectedDriverId) || DRIVER_POOL[0];

    // Check approval status from Approver
    const todayMeta = getScheduleApprovalMeta(todayIso);
    const tomorrowMeta = getScheduleApprovalMeta(tomorrowIso);
    const isTodayApproved = todayMeta && todayMeta.status === 'approved';
    const isTomorrowApproved = tomorrowMeta && tomorrowMeta.status === 'approved';

    // Fetch jobs pulled directly from Admin's dispatch schedule and bookings
    const rawTodayTrips = getDriverJobsForDate(todayIso, currentDriver, allBookings);
    const rawTomorrowTrips = getDriverJobsForDate(tomorrowIso, currentDriver, allBookings);

    // Only allow driver to see trips once the schedule has been approved by the Approver
    const todayTrips = isTodayApproved ? rawTodayTrips : [];
    const tomorrowTrips = isTomorrowApproved ? rawTomorrowTrips : [];

    let displayedTrips = [];
    let isCurrentDateApproved = true;
    let currentScheduleMeta = null;
    let currentScheduleThai = todayThai;

    if (activeDateTab === 'today') {
      displayedTrips = todayTrips;
      isCurrentDateApproved = isTodayApproved;
      currentScheduleMeta = todayMeta;
      currentScheduleThai = todayThai;
    } else if (activeDateTab === 'tomorrow') {
      displayedTrips = tomorrowTrips;
      isCurrentDateApproved = isTomorrowApproved;
      currentScheduleMeta = tomorrowMeta;
      currentScheduleThai = tomorrowThai;
    } else {
      displayedTrips = [...todayTrips, ...tomorrowTrips];
      isCurrentDateApproved = isTodayApproved || isTomorrowApproved;
      currentScheduleMeta = !isTodayApproved ? todayMeta : tomorrowMeta;
      currentScheduleThai = !isTodayApproved ? todayThai : tomorrowThai;
    }

    const totalJobs = displayedTrips.length;
    const confirmedCount = displayedTrips.filter(t => t.driverConfirmed || t.driverJobStatus === 'confirmed' || t.driverJobStatus === 'in_progress' || t.driverJobStatus === 'completed').length;
    const unconfirmedCount = totalJobs - confirmedCount;
    const allConfirmed = totalJobs > 0 && unconfirmedCount === 0;

    container.innerHTML = `
      <div class="driver-portal-wrap">
        
        <!-- Driver Profile & Shift Header -->
        <div class="driver-hero-banner">
          <div class="driver-profile">
            <div class="driver-avatar">👨‍✈️</div>
            <div class="driver-info">
              <h2>${escapeHtml(currentDriver.name)}</h2>
              <p>พนักงานขับรถส่วนกลาง | ใบขับขี่: ${escapeHtml(currentDriver.license)} | 📞 ${escapeHtml(currentDriver.phone)}</p>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <div class="today-chip">
              <span>📅 วันนี้:</span>
              <strong>${todayThai.full}</strong>
            </div>

            <!-- Driver Switcher for demo/testing -->
            <select id="driver-selector" class="form-control" style="background: rgba(255,255,255,0.95); font-weight: 600; width: auto; padding: 6px 12px; font-size: 0.85rem; border: 1.5px solid #cbd5e1; border-radius: 8px;">
              ${DRIVER_POOL.filter(d => d.id !== 'drv_self').map(d => `
                <option value="${d.id}" ${d.id === selectedDriverId ? 'selected' : ''}>
                  คนขับ: ${d.name} (${d.phone})
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Date Tabs & Sync Button (ดึงข้อมูลงานจากแอดมิน) -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 10px;">
          <div class="driver-date-tabs-bar" style="margin-bottom: 0;">
            <button type="button" class="driver-date-tab-btn ${activeDateTab === 'today' ? 'active' : ''}" data-tab="today">
              <span>📅</span>
              <span>งานวันนี้ (${todayThai.short})</span>
              ${isTodayApproved 
                ? `<span class="tab-badge ${todayTrips.length > 0 ? 'badge-has-jobs' : ''}">${todayTrips.length}</span>` 
                : `<span class="tab-badge" style="background: #f59e0b; color: #fff; font-size: 0.68rem; padding: 1px 6px;">⏳ รออนุมัติ</span>`}
            </button>

            <button type="button" class="driver-date-tab-btn ${activeDateTab === 'tomorrow' ? 'active' : ''}" data-tab="tomorrow">
              <span>📆</span>
              <span>งานวันถัดไป (${tomorrowThai.short})</span>
              ${isTomorrowApproved 
                ? `<span class="tab-badge ${tomorrowTrips.length > 0 ? 'badge-has-jobs' : ''}">${tomorrowTrips.length}</span>` 
                : `<span class="tab-badge" style="background: #f59e0b; color: #fff; font-size: 0.68rem; padding: 1px 6px;">⏳ รออนุมัติ</span>`}
            </button>

            <button type="button" class="driver-date-tab-btn ${activeDateTab === 'all' ? 'active' : ''}" data-tab="all">
              <span>📋</span>
              <span>งานทั้งหมด (ที่อนุมัติแล้ว)</span>
              <span class="tab-badge">${todayTrips.length + tomorrowTrips.length}</span>
            </button>
          </div>

          <button type="button" id="btn-sync-admin-schedule" class="btn-outline-blue" style="display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; font-size: 0.82rem; font-weight: 600; background: #ffffff; border-radius: 8px;" title="ดึงข้อมูลล่าสุดจากตารางจัดรถของแอดมิน">
            <span>🔄</span>
            <span>ดึงข้อมูลล่าสุดจากแอดมิน</span>
          </button>
        </div>

        <!-- Render Content based on approval status -->
        ${!isCurrentDateApproved ? renderPendingApprovalState(activeDateTab, currentScheduleThai, currentScheduleMeta) : `
          <!-- Approved Schedule Verification Banner -->
          ${renderApprovedBanner(currentScheduleThai, currentScheduleMeta, activeDateTab, isTodayApproved, isTomorrowApproved, todayThai, tomorrowThai)}

          <!-- Progress Banner when more than 1 job (ต้องกดยืนยันไปทีละงาน) -->
          ${totalJobs > 1 ? `
            <div class="driver-confirm-progress-banner ${allConfirmed ? 'all-confirmed' : 'has-pending'}">
              <div class="confirm-progress-left">
                <span style="font-size: 1.5rem;">${allConfirmed ? '✅' : '🔔'}</span>
                <div>
                  <div class="confirm-progress-title">
                    ${allConfirmed ? 'ยืนยันรับทราบงานครบทุกรายการแล้ว' : `สถานะการยืนยันงาน: ยืนยันแล้ว ${confirmedCount} จาก ${totalJobs} งาน`}
                  </div>
                  <div class="confirm-subtext">
                    ${allConfirmed 
                      ? 'คุณได้กดยืนยันรับงานครบทุกงานแล้ว สามารถเริ่มออกเดินทางตามตารางเวลาได้ครับ' 
                      : `มีงานที่ยังไม่ได้ยืนยันอีก ${unconfirmedCount} งาน (กรุณากดยืนยันรับงานไปทีละรายการด้านล่าง)`}
                  </div>
                </div>
              </div>
              <div class="confirm-progress-pill ${allConfirmed ? 'pill-green' : 'pill-amber'}">
                ${allConfirmed ? `✓ ครบ ${totalJobs} งาน` : `รอยืนยันอีก ${unconfirmedCount} งาน`}
              </div>
            </div>
          ` : ''}

          <!-- Section Title & Counter -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 8px;">
            <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--slate-800); display: flex; align-items: center; gap: 8px;">
              <span>${activeDateTab === 'tomorrow' ? '📆' : '📋'}</span>
              <span>
                ${activeDateTab === 'today' ? `ตารางงานขับรถวันนี้ (วันที่ ${todayThai.full})` :
                  activeDateTab === 'tomorrow' ? `ตารางงานขับรถวันถัดไป (วันที่ ${tomorrowThai.full})` :
                  `ตารางงานขับรถทั้งหมด (${todayThai.short} - ${tomorrowThai.short})`}
              </span>
            </h3>
            <span style="font-size: 0.85rem; font-weight: 600; color: #1e40af; background: #dbeafe; padding: 4px 12px; border-radius: 20px;">
              มีทั้งหมด ${totalJobs} ภารกิจ
            </span>
          </div>

          <!-- Trips List: Each job must be confirmed one-by-one -->
          ${totalJobs === 0 
            ? renderEmptyState(activeDateTab, todayThai, tomorrowThai, todayTrips.length, tomorrowTrips.length) 
            : displayedTrips.map((trip, idx) => renderTripCard(trip, idx, totalJobs, todayIso, tomorrowIso, todayThai, tomorrowThai)).join('')}
        `}

      </div>
    `;

    attachEvents(displayedTrips);
  }

  function renderEmptyState(tab, todayThai, tomorrowThai, todayCount, tomorrowCount) {
    if (tab === 'tomorrow') {
      return `
        <div class="content-card" style="text-align: center; padding: 3rem 1.5rem;">
          <div style="font-size: 3rem; margin-bottom: 0.75rem;">📆</div>
          <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--slate-800); margin-bottom: 0.4rem;">
            ไม่มีคิวงานขับรถในวันถัดไป (${tomorrowThai.short})
          </h3>
          <p style="color: var(--slate-500); max-width: 480px; margin: 0 auto 1.25rem; font-size: 0.9rem;">
            ยังไม่มีงานที่แอดมินจัดรถให้ในวันที่ ${tomorrowThai.full} สามารถตรวจสอบงานของวันนี้ หรือรอแอดมินบันทึกตารางจัดรถครับ
          </p>
          ${todayCount > 0 ? `
            <button type="button" class="btn-primary btn-switch-date-tab" data-tab="today" style="padding: 6px 16px; font-size: 0.88rem;">
              📅 ดูงานของวันนี้ (${todayCount} งาน)
            </button>
          ` : ''}
        </div>
      `;
    }

    return `
      <div class="content-card" style="text-align: center; padding: 3rem 1.5rem;">
        <div style="font-size: 3rem; margin-bottom: 0.75rem;">☕</div>
        <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--slate-800); margin-bottom: 0.4rem;">
          ${tab === 'today' ? 'วันนี้ไม่มีคิวงานขับรถ' : 'ไม่มีคิวงานขับรถในช่วงวันนี้และวันถัดไป'}
        </h3>
        <p style="color: var(--slate-500); max-width: 480px; margin: 0 auto 1.25rem; font-size: 0.9rem;">
          ไม่มีภารกิจที่แอดมินจัดรถให้ในวันที่ ${todayThai.full} หรือรอการประสานงานจัดรถจากฝ่ายสำนักงานครับ
        </p>
        ${tomorrowCount > 0 ? `
          <button type="button" class="btn-primary btn-switch-date-tab" data-tab="tomorrow" style="padding: 6px 16px; font-size: 0.88rem;">
            📆 ดูงานของวันถัดไป (${tomorrowCount} งาน)
          </button>
        ` : ''}
      </div>
    `;
  }

  function renderPendingApprovalState(tab, thaiDate, meta) {
    const isPending = meta?.status === 'pending_approval';
    return `
      <div class="content-card pending-approval-driver-card" style="text-align: center; padding: 3.5rem 1.5rem; background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 12px; margin: 1.5rem 0;">
        <div style="font-size: 3rem; margin-bottom: 0.8rem;">⏳</div>
        <h3 style="font-size: 1.25rem; font-weight: 700; color: #92400e; margin-bottom: 8px;">
          ตารางจัดรถประจำวัน${thaiDate.full} อยู่ระหว่างรอผู้อนุมัติตรวจสอบและยืนยัน
        </h3>
        <div style="display: inline-block; background: ${isPending ? '#fef3c7' : '#f1f5f9'}; color: ${isPending ? '#b45309' : '#64748b'}; border: 1px solid ${isPending ? '#fde68a' : '#cbd5e1'}; font-size: 0.82rem; font-weight: 700; padding: 4px 14px; border-radius: 20px; margin-bottom: 1rem;">
          สถานะ: ${isPending ? 'แอดมินส่งตารางแล้ว (รอผู้อนุมัติยืนยัน)' : 'ฉบับร่าง (แอดมินยังไม่ส่งตรวจ)'}
        </div>
        <p style="color: #b45309; font-size: 0.95rem; max-width: 580px; margin: 0 auto; line-height: 1.6;">
          ฝ่ายบริหารยานพาหนะ (แอดมิน) ได้บันทึกตารางจัดรถและส่งไปให้หัวหน้าฝ่าย/ผู้อนุมัติตรวจสอบความถูกต้องเรียบร้อยแล้ว<br>
          <strong>ระบบจะเปิดให้ท่านดูตารางงานและกดยืนยันรับงานได้ทันที หลังจากผู้อนุมัติกดยืนยันตารางครับ</strong>
        </p>
        <div style="margin-top: 1.5rem;">
          <button type="button" class="btn-primary btn-recheck-approval" style="background: #d97706; padding: 8px 20px; font-size: 0.88rem; font-weight: 600;">
            🔄 ตรวจสอบสถานะการอนุมัติล่าสุด
          </button>
        </div>
      </div>
    `;
  }

  function renderApprovedBanner(thaiDate, meta, activeTab, isTodayApproved, isTomorrowApproved, todayThai, tomorrowThai) {
    if (activeTab === 'all') {
      const parts = [];
      if (!isTodayApproved) parts.push(`งานวันนี้ (${todayThai.short})`);
      if (!isTomorrowApproved) parts.push(`งานวันถัดไป (${tomorrowThai.short})`);
      return `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 1.25rem;">
          <div class="schedule-approved-banner" style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 10px; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.5rem;">✅</span>
              <div>
                <div style="font-weight: 700; color: #166534; font-size: 0.95rem;">
                  แสดงเฉพาะตารางจัดรถที่ผู้อนุมัติได้ยืนยันแล้ว
                </div>
                <div style="font-size: 0.8rem; color: #15803d; margin-top: 2px;">
                  เฉพาะงานที่ผ่านการอนุมัติอย่างเป็นทางการแล้วเท่านั้นจึงจะปรากฏในหน้านี้
                </div>
              </div>
            </div>
            <span style="font-size: 0.78rem; font-weight: 700; background: #22c55e; color: #fff; padding: 3px 10px; border-radius: 12px;">
              ✓ ได้รับอนุมัติแล้ว
            </span>
          </div>

          ${parts.length > 0 ? `
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 14px; font-size: 0.82rem; color: #b45309; display: flex; align-items: center; gap: 6px;">
              <span>⏳</span>
              <span>หมายเหตุ: <strong>${parts.join(' และ ')}</strong> ยังอยู่ระหว่างรอผู้อนุมัติตรวจสอบและยืนยัน จึงยังไม่แสดงในรายการนี้</span>
            </div>
          ` : ''}
        </div>
      `;
    }

    if (!meta || meta.status !== 'approved') return '';

    return `
      <div class="schedule-approved-banner" style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 10px; padding: 12px 18px; margin-bottom: 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.5rem;">✅</span>
          <div>
            <div style="font-weight: 700; color: #166534; font-size: 0.95rem;">
              ตารางจัดรถประจำวันที่ ${thaiDate.short} ได้รับการอนุมัติและยืนยันแล้ว
            </div>
            <div style="font-size: 0.8rem; color: #15803d; margin-top: 2px;">
              อนุมัติโดย: <strong>${escapeHtml(meta.confirmedBy || 'ผู้อนุมัติฝ่าย')}</strong>
              ${meta.confirmedAt ? ` เมื่อ ${new Date(meta.confirmedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.` : ''}
              ${meta.remark ? ` (${escapeHtml(meta.remark)})` : ''}
            </div>
          </div>
        </div>
        <span style="font-size: 0.78rem; font-weight: 700; background: #22c55e; color: #fff; padding: 3px 10px; border-radius: 12px;">
          ✓ ตารางยืนยันเป็นทางการ
        </span>
      </div>
    `;
  }

  function renderTripCard(trip, index, totalJobs, todayIso, tomorrowIso, todayThai, tomorrowThai) {
    const totalStops = (trip.itinerary || []).length;
    const completedStopsCount = (trip.itinerary || []).filter(s => s.completed).length;
    const progressPercent = totalStops > 0 ? Math.round((completedStopsCount / totalStops) * 100) : 0;
    const allStopsCompleted = totalStops > 0 && completedStopsCount === totalStops;

    const isCompleted = trip.driverJobStatus === 'completed' || allStopsCompleted;
    const isInProgress = (trip.driverJobStatus === 'in_progress' || completedStopsCount > 0) && !isCompleted;
    const isConfirmed = Boolean(trip.driverConfirmed || trip.driverJobStatus === 'confirmed' || isInProgress || isCompleted);

    const isTripToday = trip.usageDate === todayIso;
    const isTripTomorrow = trip.usageDate === tomorrowIso;
    const dateBadgeText = isTripToday 
      ? `📅 วันนี้ (${todayThai.short})` 
      : (isTripTomorrow ? `📆 วันถัดไป (${tomorrowThai.short})` : `📅 วันที่ ${formatThaiDate(trip.usageDate).short}`);

    const plateInfo = parseVehiclePlate(trip.assignedVehicle);

    return `
      <div class="driver-trip-card ${isConfirmed ? 'is-confirmed-card' : 'is-unconfirmed-card'}" data-id="${trip.id}">
        
        <!-- Header: Job Sequence Badge, Time, Date Tag & Status -->
        <div class="trip-card-header">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${totalJobs > 1 ? `
              <span class="job-seq-badge">
                <span>📌 งานที่ ${index + 1} จาก ${totalJobs} งาน</span>
              </span>
            ` : ''}

            <div class="trip-time-badge">
              <span>เวลา ${trip.startTime} - ${trip.endTime} น.</span>
            </div>

            <span style="font-size: 0.78rem; font-weight: 700; color: #1e40af; background: #dbeafe; padding: 3px 10px; border-radius: 9999px;">
              ${dateBadgeText}
            </span>

            ${trip.isFromAdminDispatch ? `
              <span style="font-size: 0.72rem; font-weight: 600; color: #0284c7; background: #f0f9ff; border: 1px solid #bae6fd; padding: 2px 7px; border-radius: 4px;">
                ✓ ข้อมูลจากตารางจัดรถแอดมิน (คันที่ ${trip.dispatchRowNo || '-'})
              </span>
            ` : ''}
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="color: #475569; font-size: 0.85rem;">รหัส: ${trip.id}</strong>
            <span class="status-badge ${trip.status}">
              ${trip.statusLabel || trip.status}
            </span>
          </div>
        </div>

        <!-- Standout Vehicle License Plate Showcase (ทะเบียนรถเด่นชัด) -->
        <div class="driver-plate-showcase">
          <div class="driver-plate-tag">
            <span style="font-size: 1.25rem;">🚘</span>
            <span>รถที่ต้องใช้ปฏิบัติภารกิจ:</span>
          </div>
          <div class="thai-license-plate ${plateInfo.colorClass}">
            <span class="plate-number-big">${escapeHtml(plateInfo.plate)}</span>
            ${plateInfo.type ? `<span class="plate-category-pill">ประเภท: ${escapeHtml(plateInfo.type)}</span>` : ''}
          </div>
        </div>

        <!-- Destination & Route Details: ดึงมาจากตารางแอดมิน และรองรับกดเสร็จสิ้นรายจุดหมาย -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin: 0.85rem 0 0.4rem; flex-wrap: wrap; gap: 8px;">
          <div style="font-size: 0.9rem; font-weight: 700; color: var(--slate-800); display: flex; align-items: center; gap: 6px;">
            <span>📍</span>
            <span>แผนการเดินทางและจุดหมาย (${totalStops} รายการ):</span>
          </div>

          ${totalStops > 1 ? `
            <span style="font-size: 0.78rem; font-weight: 700; color: ${completedStopsCount === totalStops ? '#059669' : '#1e40af'}; background: ${completedStopsCount === totalStops ? '#d1fae5' : '#eff6ff'}; padding: 2px 10px; border-radius: 9999px; border: 1px solid ${completedStopsCount === totalStops ? '#a7f3d0' : '#bfdbfe'};">
              เสร็จแล้ว ${completedStopsCount}/${totalStops} งาน (${progressPercent}%)
            </span>
          ` : ''}
        </div>

        ${totalStops > 1 ? `
          <div class="trip-stops-progress-wrap">
            <div class="stops-progress-header">
              <span class="stops-progress-title">
                ความคืบหน้ารายจุดหมาย: <strong>เสร็จสิ้นแล้ว ${completedStopsCount} จาก ${totalStops} งาน</strong>
              </span>
              <span class="stops-progress-percent">${progressPercent}%</span>
            </div>
            <div class="stops-progress-track">
              <div class="stops-progress-fill" style="width: ${progressPercent}%;"></div>
            </div>
          </div>
        ` : ''}

        <div class="trip-route-timeline">
          ${trip.itinerary && trip.itinerary.length > 0 ? trip.itinerary.map((step, idx) => {
            const isLast = idx === trip.itinerary.length - 1;
            const isStepCompleted = Boolean(step.completed);
            const timePass = step.note || [step.time ? `${step.time} น.` : '', step.passengers ? `${step.passengers} คน` : ''].filter(Boolean).join(' / ');
            return `
              <div class="route-step ${isLast ? 'finish' : ''} ${isStepCompleted ? 'step-done' : ''}">
                <div class="route-step-header">
                  <div class="step-dest ${isStepCompleted ? 'step-dest-done' : ''}">
                    ${idx + 1}. ${escapeHtml(step.destination || step.detail || 'ไม่ได้ระบุ')}
                  </div>

                  <div class="step-action-zone">
                    ${isStepCompleted ? `
                      <span class="step-completed-badge">
                        <span>✓ เสร็จสิ้นแล้ว</span>
                        ${step.completedAt ? `<span class="badge-time">(${escapeHtml(step.completedAt)})</span>` : ''}
                      </span>
                      <button type="button" class="btn-undo-stop" data-trip-id="${trip.id}" data-step-index="${idx}" title="ยกเลิกสถานะเสร็จสิ้น">
                        ↩️ ยกเลิก
                      </button>
                    ` : `
                      <button type="button" 
                              class="btn-finish-stop ${!isConfirmed ? 'btn-finish-disabled' : ''}" 
                              data-trip-id="${trip.id}" 
                              data-step-index="${idx}"
                              ${!isConfirmed ? 'title="กรุณากดยืนยันรับงานก่อนเสร็จสิ้นงานนี้"' : ''}>
                        <span>🏁 กดเสร็จสิ้นงานนี้</span>
                      </button>
                    `}
                  </div>
                </div>

                ${step.detail && step.detail !== step.destination ? `
                  <div class="step-detail ${isStepCompleted ? 'step-muted' : ''}">
                    <strong>ภารกิจ:</strong> ${escapeHtml(step.detail)}
                  </div>
                ` : ''}
                ${timePass ? `
                  <div class="step-note ${isStepCompleted ? 'step-note-done' : ''}">
                    ⏱️ นัดหมาย/ผู้โดยสาร: ${escapeHtml(timePass)}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('') : `
            <div style="color: var(--slate-400); font-size: 0.85rem; padding: 6px 0;">
              - ไม่มีรายละเอียดเส้นทางเพิ่มเติมในระบบ -
            </div>
          `}
        </div>

        <!-- Passenger & Booker info -->
        <div class="trip-footer-details">
          <div>
            <div style="font-size: 0.88rem; font-weight: 600; color: var(--slate-800);">
              👤 ผู้ขอใช้รถ: ${escapeHtml(trip.bookerName)} (${escapeHtml(trip.department)})
            </div>
            <div style="font-size: 0.8rem; color: var(--slate-600); margin-top: 2px;">
              📝 หมายเหตุ/ผู้โดยสาร: ${escapeHtml(trip.notes || '-')}
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${trip.bookerPhone ? `
              <a href="tel:${trip.bookerPhone}" class="call-btn">
                <span>📞 โทรติดต่อ</span>
                <span>(${escapeHtml(trip.bookerPhone)})</span>
              </a>
            ` : ''}

            <button class="btn-secondary-sm btn-driver-view-paper" data-id="${trip.id}">
              📄 ดูใบงาน
            </button>
          </div>
        </div>

        <!-- Driver Action Buttons with Strict Step-by-Step Confirmation -->
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 1rem; padding-top: 0.85rem; border-top: 1px dashed var(--slate-200); flex-wrap: wrap;">
          <div>
            ${isConfirmed ? `
              <span class="driver-job-status-badge confirmed">
                ✓ ยืนยันรับงานนี้แล้ว ${trip.driverConfirmedAt ? `(${escapeHtml(trip.driverConfirmedAt)})` : ''}
              </span>
            ` : `
              <span style="font-size: 0.82rem; color: #dc2626; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                <span>⚠️</span> <span>ยังไม่ได้ยืนยันงานนี้ (ต้องกดยืนยันก่อนออกเดินทาง)</span>
              </span>
            `}
          </div>

          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            ${isCompleted ? `
              <span class="driver-job-status-badge completed">
                ✅ ปฏิบัติภารกิจเสร็จสิ้นครบทุกจุดหมายแล้ว (${completedStopsCount}/${totalStops} งาน)
              </span>
            ` : isInProgress ? `
              <button class="btn-primary btn-complete-trip" data-id="${trip.id}" style="background: #059669; padding: 7px 16px; font-size: 0.85rem; font-weight: 600;" title="กดเสร็จสิ้นทุกงานในคราวเดียว">
                🏁 ${totalStops > 1 ? `เสร็จสิ้นทุกงาน (${completedStopsCount}/${totalStops})` : 'ถึงจุดหมาย / เสร็จสิ้นภารกิจ'}
              </button>
            ` : `
              ${!isConfirmed ? `
                <button class="btn-confirm-job btn-confirm-trip" data-id="${trip.id}" data-index="${index + 1}">
                  ✓ กดยืนยันรับงานนี้ ${totalJobs > 1 ? `(งานที่ ${index + 1}/${totalJobs})` : ''}
                </button>
                <button class="btn-primary btn-start-locked btn-start-trip" data-id="${trip.id}" disabled title="ต้องกดยืนยันรับงานนี้ก่อนเริ่มเดินทาง">
                  🔒 เริ่มออกเดินทาง (ต้องยืนยันงานก่อน)
                </button>
              ` : `
                <button class="btn-primary btn-start-trip" data-id="${trip.id}" style="padding: 7px 16px; font-size: 0.85rem; font-weight: 600; background: #0284c7;">
                  🚗 เริ่มออกเดินทาง
                </button>
              `}
            `}
          </div>
        </div>

      </div>
    `;
  }

  function attachEvents(displayedTrips) {
    const driverSelect = document.getElementById('driver-selector');
    if (driverSelect) {
      driverSelect.addEventListener('change', (e) => {
        selectedDriverId = e.target.value;
        localStorage.setItem('last_driver_id', selectedDriverId);
        render();
      });
    }

    // Date Tabs Switcher
    container.querySelectorAll('.driver-date-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeDateTab = btn.getAttribute('data-tab');
        render();
      });
    });

    // Empty state date tab shortcuts
    container.querySelectorAll('.btn-switch-date-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeDateTab = btn.getAttribute('data-tab');
        render();
      });
    });

    // Recheck approval status button
    container.querySelectorAll('.btn-recheck-approval').forEach(btn => {
      btn.addEventListener('click', () => {
        showToast('✓ ตรวจสอบสถานะการอนุมัติตารางจัดรถล่าสุดเรียบร้อย');
        render();
      });
    });

    // Sync button (ดึงข้อมูลล่าสุดจากแอดมิน)
    const btnSyncAdmin = document.getElementById('btn-sync-admin-schedule');
    if (btnSyncAdmin) {
      btnSyncAdmin.addEventListener('click', () => {
        showToast('✓ ดึงข้อมูลงานล่าสุดจากตารางจัดรถของแอดมินเรียบร้อยแล้ว');
        render();
      });
    }

    // Confirm Individual Trip Handler (กดยืนยันไปทีละงาน)
    container.querySelectorAll('.btn-confirm-trip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const targetTrip = displayedTrips.find(x => x.id === id);
        if (!targetTrip) return;

        const nowTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
        
        // Confirm ONLY THIS JOB
        updateJobStatus(targetTrip, {
          driverConfirmed: true,
          driverConfirmedAt: nowTime,
          driverJobStatus: 'confirmed'
        });

        // Compute remaining unconfirmed count after this action
        const remainingUnconfirmed = displayedTrips.filter(t => t.id !== id && !t.driverConfirmed && t.driverJobStatus !== 'confirmed' && t.driverJobStatus !== 'in_progress' && t.driverJobStatus !== 'completed').length;
        
        if (remainingUnconfirmed > 0) {
          showToast(`✓ ยืนยันรับงาน ${id} แล้ว! (ยังเหลืองานที่ต้องกดยืนยันอีก ${remainingUnconfirmed} งาน)`);
        } else {
          showToast(`🎉 ยืนยันรับงาน ${id} เรียบร้อยแล้ว! (ยืนยันครบทุกงานแล้ว)`);
        }

        render();
      });
    });

    // View Paper Form (also supports confirming this specific job)
    container.querySelectorAll('.btn-driver-view-paper').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const targetTrip = displayedTrips.find(x => x.id === id);
        const allBookings = getAllBookings();
        let b = allBookings.find(x => x.id === id);
        
        // If not in formal bookings, synthesize official paper view from dispatch row
        if (!b && targetTrip) {
          b = {
            id: targetTrip.id,
            formCode: '',
            bookingDate: targetTrip.usageDate,
            usageDate: targetTrip.usageDate,
            startTime: targetTrip.startTime,
            endTime: targetTrip.endTime,
            department: targetTrip.department,
            bookerName: targetTrip.bookerName,
            bookerPhone: targetTrip.bookerPhone,
            assignedVehicle: targetTrip.assignedVehicle,
            requestedVehicle: targetTrip.assignedVehicle,
            assignedDriver: targetTrip.assignedDriver,
            status: targetTrip.status,
            statusLabel: targetTrip.statusLabel,
            itinerary: targetTrip.itinerary,
            notes: targetTrip.notes,
            bookerSignature: targetTrip.bookerName,
            adminSignature: 'ฝ่ายสำนักงานจัดสรรแล้ว'
          };
        }

        if (b) {
          renderPaperModal(b, {
            confirmText: 'ยืนยันรับงานนี้',
            onEdit: (booking) => {
              window.dispatchEvent(new CustomEvent('edit_booking_in_form', { detail: booking }));
            },
            onConfirm: (booking) => {
              const nowTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
              if (targetTrip) {
                updateJobStatus(targetTrip, {
                  driverConfirmed: true,
                  driverConfirmedAt: nowTime,
                  driverJobStatus: 'confirmed'
                });
              } else {
                updateBooking(booking.id, {
                  driverConfirmed: true,
                  driverConfirmedAt: nowTime,
                  driverJobStatus: 'confirmed'
                });
              }
              showToast(`ยืนยันรับงาน ${booking.id} เรียบร้อยแล้ว`);
              render();
            }
          });
        }
      });
    });

    // Start Trip (Requires this specific job to be confirmed)
    container.querySelectorAll('.btn-start-trip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const targetTrip = displayedTrips.find(x => x.id === id);
        if (!targetTrip) return;

        if (!targetTrip.driverConfirmed && targetTrip.driverJobStatus !== 'confirmed') {
          showToast('⚠️ กรุณากดยืนยันรับงานนี้ก่อนเริ่มออกเดินทางครับ');
          return;
        }

        const nowTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
        updateJobStatus(targetTrip, {
          driverJobStatus: 'in_progress',
          statusLabel: 'อยู่ระหว่างเดินทาง'
        });
        showToast(`เริ่มออกเดินทางงาน ${id} แล้ว ขอให้ขับขี่ปลอดภัยครับ`);
        render();
      });
    });

    // Individual Stop Completion Handler (กดเสร็จสิ้นในแต่ละงาน/แต่ละจุดหมาย)
    container.querySelectorAll('.btn-finish-stop').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tripId = btn.getAttribute('data-trip-id');
        const stepIndex = parseInt(btn.getAttribute('data-step-index'), 10);
        const targetTrip = displayedTrips.find(x => x.id === tripId);
        if (!targetTrip || !targetTrip.itinerary || !targetTrip.itinerary[stepIndex]) return;

        // Check if job is confirmed first
        if (!targetTrip.driverConfirmed && targetTrip.driverJobStatus !== 'confirmed' && targetTrip.driverJobStatus !== 'in_progress' && targetTrip.driverJobStatus !== 'completed') {
          showToast('⚠️ กรุณากดยืนยันรับงานนี้ก่อนเริ่มบันทึกเสร็จสิ้นงานครับ');
          return;
        }

        const nowTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
        const targetStep = targetTrip.itinerary[stepIndex];
        targetStep.completed = true;
        targetStep.completedAt = nowTime;

        // Auto-start trip if not yet in_progress or completed
        if (targetTrip.driverJobStatus !== 'in_progress' && targetTrip.driverJobStatus !== 'completed') {
          targetTrip.driverJobStatus = 'in_progress';
          targetTrip.statusLabel = 'อยู่ระหว่างเดินทาง';
        }

        // Check if all stops in this trip are completed
        const totalStops = targetTrip.itinerary.length;
        const completedCount = targetTrip.itinerary.filter(s => s.completed).length;
        const stepName = targetStep.destination || targetStep.detail || `งานที่ ${stepIndex + 1}`;

        if (completedCount === totalStops && totalStops > 0) {
          targetTrip.driverJobStatus = 'completed';
          targetTrip.status = 'completed';
          targetTrip.statusLabel = 'เสร็จสิ้นภารกิจ';
          
          updateJobStatus(targetTrip, {
            driverJobStatus: 'completed',
            status: 'completed',
            statusLabel: 'เสร็จสิ้นภารกิจ',
            itinerary: targetTrip.itinerary
          });

          showToast(`🎉 เสร็จสิ้นภารกิจครบทุกจุดหมาย (${totalStops} งาน) เรียบร้อยแล้ว!`);
        } else {
          updateJobStatus(targetTrip, {
            driverJobStatus: targetTrip.driverJobStatus,
            status: targetTrip.status,
            statusLabel: targetTrip.statusLabel,
            itinerary: targetTrip.itinerary
          });

          showToast(`✓ เสร็จสิ้นงานที่ ${stepIndex + 1}: ${stepName} แล้ว (${completedCount}/${totalStops} งาน)`);
        }

        render();
      });
    });

    // Undo Individual Stop Completion Handler
    container.querySelectorAll('.btn-undo-stop').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tripId = btn.getAttribute('data-trip-id');
        const stepIndex = parseInt(btn.getAttribute('data-step-index'), 10);
        const targetTrip = displayedTrips.find(x => x.id === tripId);
        if (!targetTrip || !targetTrip.itinerary || !targetTrip.itinerary[stepIndex]) return;

        const targetStep = targetTrip.itinerary[stepIndex];
        targetStep.completed = false;
        targetStep.completedAt = null;

        const totalStops = targetTrip.itinerary.length;
        const completedCount = targetTrip.itinerary.filter(s => s.completed).length;

        if (completedCount < totalStops) {
          targetTrip.driverJobStatus = 'in_progress';
          if (targetTrip.status === 'completed') {
            targetTrip.status = targetTrip.isFromAdminDispatch ? 'dispatched' : 'approved';
          }
          targetTrip.statusLabel = 'อยู่ระหว่างเดินทาง';
        }

        updateJobStatus(targetTrip, {
          driverJobStatus: targetTrip.driverJobStatus,
          status: targetTrip.status,
          statusLabel: targetTrip.statusLabel,
          itinerary: targetTrip.itinerary
        });

        showToast(`↩️ ยกเลิกสถานะเสร็จสิ้นของงานที่ ${stepIndex + 1} แล้ว`);
        render();
      });
    });

    // Complete Entire Trip (or all remaining stops in one click)
    container.querySelectorAll('.btn-complete-trip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const targetTrip = displayedTrips.find(x => x.id === id);
        if (!targetTrip) return;

        const nowTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
        if (targetTrip.itinerary && targetTrip.itinerary.length > 0) {
          targetTrip.itinerary.forEach(step => {
            if (!step.completed) {
              step.completed = true;
              step.completedAt = nowTime;
            }
          });
        }

        updateJobStatus(targetTrip, {
          driverJobStatus: 'completed',
          status: 'completed',
          statusLabel: 'เสร็จสิ้นภารกิจ',
          itinerary: targetTrip.itinerary
        });
        showToast(`บันทึกเสร็จสิ้นภารกิจงาน ${id} ครบทุกจุดหมายเรียบร้อยแล้ว ขอบคุณครับ`);
        render();
      });
    });
  }

  // Real-time synchronization listeners for when Admin saves dispatch schedule
  function onScheduleUpdated() {
    render();
  }
  window.addEventListener('dispatch_schedule_updated', onScheduleUpdated);
  window.addEventListener('schedule_approval_updated', onScheduleUpdated);

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
