// main.js - Application Entry Point & Role Controller
import './style.css';
import { getActiveRole, setActiveRole, getAllBookings } from './store.js';
import { renderBookerView } from './views/BookerView.js';
import { renderDriverView } from './views/DriverView.js';
import { renderApproverView } from './views/ApproverView.js';
import { renderAdminView } from './views/AdminView.js';

const app = document.getElementById('app');

function initApp() {
  const currentRole = getActiveRole();
  const bookings = getAllBookings();

  const pendingApprovals = bookings.filter(b => b.status === 'pending_approval').length;
  const pendingDispatch = bookings.filter(b => b.status === 'approved').length;

  app.innerHTML = `
    <!-- Top Application Header with Role Switcher -->
    <header class="app-header">
      <div class="header-container">
        
        <div class="brand-section">
          <div class="brand-icon">
            🚙
          </div>
          <div class="brand-text">
            <h1>
              <span>ระบบใบขออนุมัติการใช้รถ</span>
            </h1>
            <p>Car Booking & Fleet Dispatch Management System</p>
          </div>
        </div>

        <!-- Role Switcher: Supports Booker (now) and Future Roles (Driver, Approver, Admin) -->
        <nav class="role-nav-group" aria-label="Role Switcher">
          <button id="role-btn-booker" class="role-tab-btn ${currentRole === 'booker' ? 'active' : ''}" data-role="booker">
            <span> ผู้จอง (Booker)</span>
          </button>

          <button id="role-btn-driver" class="role-tab-btn ${currentRole === 'driver' ? 'active' : ''}" data-role="driver">
            <span> พนักงานขับรถ (Driver)</span>
          </button>

          <button id="role-btn-approver" class="role-tab-btn ${currentRole === 'approver' ? 'active' : ''}" data-role="approver">
            <span> ผู้อนุมัติ (Approver)</span>
            ${pendingApprovals > 0 ? `<span class="role-badge" style="background: #ef4444; color: #fff;">${pendingApprovals}</span>` : ''}
          </button>

          <button id="role-btn-admin" class="role-tab-btn ${currentRole === 'admin' ? 'active' : ''}" data-role="admin">
            <span> แอดมิน (Admin)</span>
            ${pendingDispatch > 0 ? `<span class="role-badge" style="background: #f59e0b; color: #fff;">${pendingDispatch}</span>` : ''}
          </button>
        </nav>

      </div>
    </header>

    <!-- Main View Dynamic Container -->
    <main class="main-wrapper" id="main-view-container"></main>
  `;

  // Render the current view
  const viewContainer = document.getElementById('main-view-container');
  mountView(currentRole, viewContainer);

  // Bind role switcher buttons
  app.querySelectorAll('.role-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetRole = btn.getAttribute('data-role');
      if (targetRole !== getActiveRole()) {
        setActiveRole(targetRole);
        initApp(); // Re-render header & view
      }
    });
  });
}

function mountView(role, container) {
  if (!container) return;
  container.innerHTML = '';

  switch (role) {
    case 'driver':
      renderDriverView(container);
      break;
    case 'approver':
      renderApproverView(container);
      break;
    case 'admin':
      renderAdminView(container);
      break;
    case 'booker':
    default:
      renderBookerView(container);
      break;
  }
}

// Global event listeners
window.addEventListener('bookings_updated', () => {
  // Update badges if needed without full reload
  const bookings = getAllBookings();
  const pendingApprovals = bookings.filter(b => b.status === 'pending_approval').length;
  const approverBtn = document.getElementById('role-btn-approver');
  if (approverBtn) {
    const existingBadge = approverBtn.querySelector('.role-badge');
    if (existingBadge) existingBadge.remove();
    if (pendingApprovals > 0) {
      approverBtn.insertAdjacentHTML('beforeend', `<span class="role-badge" style="background: #ef4444; color: #fff;">${pendingApprovals}</span>`);
    }
  }
});

// Start the app
initApp();
