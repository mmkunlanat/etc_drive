// src/components/ClockPicker24h.js
// 24-Hour Circular Clock Picker Component (หน้าปัดนาฬิการูปแบบ 24 ชั่วโมง)
// Provides an intuitive Material/Touch-friendly 24-hour clock face for time inputs

let activePickerInstance = null;

function pad2(num) {
  return String(num).padStart(2, '0');
}

export function openClockPicker(targetInput, options = {}) {
  // If already open for this input, close it
  if (activePickerInstance && activePickerInstance.targetInput === targetInput) {
    closeClockPicker();
    return;
  }

  closeClockPicker();

  // Parse initial time from input value or fallback to 08:30
  let initialHour = 8;
  let initialMinute = 30;

  if (targetInput && targetInput.value) {
    const raw = targetInput.value.trim().replace(/[^\d:]/g, '');
    const parts = raw.split(':');
    if (parts.length >= 2) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(h) && h >= 0 && h <= 23) initialHour = h;
      if (!isNaN(m) && m >= 0 && m <= 59) initialMinute = m;
    } else if (parts[0]) {
      const h = parseInt(parts[0], 10);
      if (!isNaN(h) && h >= 0 && h <= 23) initialHour = h;
    }
  }

  let selectedHour = initialHour;
  let selectedMinute = initialMinute;
  let currentMode = 'hour'; // 'hour' | 'minute'
  let autoSwitchTimer = null;

  // Create popup DOM container
  const overlay = document.createElement('div');
  overlay.className = 'clock-picker-overlay';
  overlay.id = 'clock-picker-overlay';

  const popover = document.createElement('div');
  popover.className = 'clock-picker-popover';
  popover.id = 'clock-picker-popover';

  overlay.appendChild(popover);
  document.body.appendChild(overlay);

  // Position popover relative to targetInput
  function updatePosition() {
    if (!targetInput) return;
    const rect = targetInput.getBoundingClientRect();
    const width = 300;
    const height = 450;

    let left = rect.left;
    if (left + width > window.innerWidth - 10) {
      left = window.innerWidth - width - 10;
    }
    if (left < 10) left = 10;

    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 10) {
      if (rect.top - height - 6 > 10) {
        top = rect.top - height - 6;
      } else {
        top = Math.max(10, (window.innerHeight - height) / 2);
      }
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  updatePosition();

  // Geometry constants
  const cx = 120;
  const cy = 120;
  const rOuter = 88; // Outer ring (13-23, 00)
  const rInner = 56; // Inner ring (1-12)
  const rMinute = 84; // Minute ring (00-55)

  function getHandCoords(mode, hour, minute) {
    if (mode === 'hour') {
      const isInner = hour >= 1 && hour <= 12;
      const r = isInner ? rInner : rOuter;
      const sector = hour % 12;
      const angleDeg = sector * 30 - 90;
      const angleRad = (angleDeg * Math.PI) / 180;
      return {
        x: cx + r * Math.cos(angleRad),
        y: cy + r * Math.sin(angleRad),
        angleDeg,
        r
      };
    } else {
      const angleDeg = (minute / 60) * 360 - 90;
      const angleRad = (angleDeg * Math.PI) / 180;
      return {
        x: cx + rMinute * Math.cos(angleRad),
        y: cy + rMinute * Math.sin(angleRad),
        angleDeg,
        r: rMinute
      };
    }
  }

  function render() {
    const hand = getHandCoords(currentMode, selectedHour, selectedMinute);
    const timeFormatted = `${pad2(selectedHour)}:${pad2(selectedMinute)}`;

    // Build Hour numbers
    let numbersHtml = '';
    if (currentMode === 'hour') {
      const outerHours = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
      const innerHours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

      outerHours.forEach((h, i) => {
        const angleDeg = i * 30 - 90;
        const rad = (angleDeg * Math.PI) / 180;
        const x = cx + rOuter * Math.cos(rad);
        const y = cy + rOuter * Math.sin(rad);
        const isSelected = selectedHour === h;
        numbersHtml += `
          <div class="clock-num outer ${isSelected ? 'is-selected' : ''}" 
               style="left: ${x}px; top: ${y}px;" 
               data-hour="${h}">
            ${pad2(h)}
          </div>
        `;
      });

      innerHours.forEach((h, i) => {
        const angleDeg = i * 30 - 90;
        const rad = (angleDeg * Math.PI) / 180;
        const x = cx + rInner * Math.cos(rad);
        const y = cy + rInner * Math.sin(rad);
        const isSelected = selectedHour === h;
        numbersHtml += `
          <div class="clock-num inner ${isSelected ? 'is-selected' : ''}" 
               style="left: ${x}px; top: ${y}px;" 
               data-hour="${h}">
            ${h}
          </div>
        `;
      });
    } else {
      // Build Minute numbers (every 5 mins)
      const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
      minutes.forEach((m, i) => {
        const angleDeg = i * 30 - 90;
        const rad = (angleDeg * Math.PI) / 180;
        const x = cx + rMinute * Math.cos(rad);
        const y = cy + rMinute * Math.sin(rad);
        const isSelected = selectedMinute === m;
        numbersHtml += `
          <div class="clock-num minute ${isSelected ? 'is-selected' : ''}" 
               style="left: ${x}px; top: ${y}px;" 
               data-minute="${m}">
            ${pad2(m)}
          </div>
        `;
      });

      // If selectedMinute is not multiple of 5, render intermediate indicator
      if (selectedMinute % 5 !== 0) {
        numbersHtml += `
          <div class="clock-num minute is-selected custom-min" 
               style="left: ${hand.x}px; top: ${hand.y}px;">
            ${pad2(selectedMinute)}
          </div>
        `;
      }
    }

    popover.innerHTML = `
      <div class="clock-picker-header">
        <div class="clock-picker-title">
          <span>🕒</span>
          <span>เลือกเวลา (รูปแบบ 24 ชั่วโมง)</span>
        </div>

        <!-- Digital Time Display with interactive Hour & Minute buttons -->
        <div class="clock-digital-display">
          <button type="button" class="digital-box ${currentMode === 'hour' ? 'active' : ''}" id="btn-mode-hour" title="เลือกชั่วโมง">
            ${pad2(selectedHour)}
          </button>
          <span class="digital-colon">:</span>
          <button type="button" class="digital-box ${currentMode === 'minute' ? 'active' : ''}" id="btn-mode-minute" title="เลือกนาที">
            ${pad2(selectedMinute)}
          </button>
          <span class="digital-unit">น.</span>
        </div>

        <!-- Mode Indicator Switcher -->
        <div class="clock-mode-nav">
          <button type="button" class="mode-nav-btn ${currentMode === 'hour' ? 'active' : ''}" id="nav-mode-hour">
            <span>ชั่วโมง (00-23)</span>
          </button>
          <button type="button" class="mode-nav-btn ${currentMode === 'minute' ? 'active' : ''}" id="nav-mode-minute">
            <span>นาที (00-59)</span>
          </button>
        </div>
      </div>

      <!-- Circular Clock Face (หน้าปัดนาฬิกา 24 ชั่วโมง) -->
      <div class="clock-face-container" id="clock-dial">
        <svg class="clock-svg-dial" viewBox="0 0 240 240" width="240" height="240">
          <!-- Outer Dial Border & Face -->
          <circle cx="${cx}" cy="${cy}" r="116" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5" />
          
          <!-- Inner Ring Guide for Hour mode -->
          ${currentMode === 'hour' ? `
            <circle cx="${cx}" cy="${cy}" r="${rInner}" fill="none" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />
          ` : ''}

          <!-- Center Pivot Pin -->
          <circle cx="${cx}" cy="${cy}" r="4.5" fill="#2563eb" />

          <!-- Dynamic Clock Hand -->
          <line x1="${cx}" y1="${cy}" x2="${hand.x}" y2="${hand.y}" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" />
          
          <!-- Hand Tip Selection Bubble -->
          <circle cx="${hand.x}" cy="${hand.y}" r="15" fill="#2563eb" />
          <circle cx="${hand.x}" cy="${hand.y}" r="3.5" fill="#ffffff" />
        </svg>

        <!-- Number Overlays -->
        <div class="clock-numbers-overlay">
          ${numbersHtml}
        </div>
      </div>

      <!-- Minute Stepper Bar (ปรับละเอียดนาที) -->
      ${currentMode === 'minute' ? `
        <div class="clock-minute-steppers">
          <button type="button" class="btn-min-step" data-step="-5">−5 น.</button>
          <button type="button" class="btn-min-step" data-step="-1">−1 น.</button>
          <span style="font-size: 0.76rem; color: #64748b; font-weight: 600;">ปรับละเอียด</span>
          <button type="button" class="btn-min-step" data-step="1">+1 น.</button>
          <button type="button" class="btn-min-step" data-step="5">+5 น.</button>
        </div>
      ` : ''}

      <!-- Quick Office Hours Presets -->
      <div class="clock-presets-wrap">
        <span class="presets-label">เวลาใช้บ่อย:</span>
        <div class="presets-list">
          <button type="button" class="btn-preset-time" data-time="08:00">08:00</button>
          <button type="button" class="btn-preset-time" data-time="08:30">08:30</button>
          <button type="button" class="btn-preset-time" data-time="09:00">09:00</button>
          <button type="button" class="btn-preset-time" data-time="12:00">12:00</button>
          <button type="button" class="btn-preset-time" data-time="13:00">13:00</button>
          <button type="button" class="btn-preset-time" data-time="16:30">16:30</button>
          <button type="button" class="btn-preset-time" data-time="17:00">17:00</button>
        </div>
      </div>

      <!-- Action Buttons Footer -->
      <div class="clock-picker-footer">
        <button type="button" class="btn-clock-clear" id="btn-clock-clear">ล้าง</button>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-clock-cancel" id="btn-clock-cancel">ยกเลิก</button>
          <button type="button" class="btn-clock-apply" id="btn-clock-apply">
            ตกลง (${timeFormatted} น.)
          </button>
        </div>
      </div>
    `;

    attachEvents();
  }

  function handleDialInteraction(e) {
    const dial = popover.querySelector('#clock-dial');
    if (!dial) return;
    const rect = dial.getBoundingClientRect();
    const x = e.clientX - rect.left - cx;
    const y = e.clientY - rect.top - cy;
    const dist = Math.hypot(x, y);

    // Calculate angle in degrees from top (0 deg at 12 o'clock, clockwise)
    const angleDeg = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;

    if (currentMode === 'hour') {
      const sector = Math.round(angleDeg / 30) % 12;
      // Distance threshold: rInner is 56, rOuter is 88 -> boundary is ~72
      if (dist < 72) {
        // Inner ring: 1, 2, ..., 12
        selectedHour = sector === 0 ? 12 : sector;
      } else {
        // Outer ring: 13, 14, ..., 23, 00
        selectedHour = sector === 0 ? 0 : sector + 12;
      }

      render();

      // Automatically transition to minute mode after picking an hour
      if (autoSwitchTimer) clearTimeout(autoSwitchTimer);
      autoSwitchTimer = setTimeout(() => {
        currentMode = 'minute';
        render();
      }, 320);
    } else {
      // Minute mode: 0 to 59
      let min = Math.round((angleDeg / 6) % 60);
      selectedMinute = min;
      render();
    }
  }

  function commitTimeAndClose(hour, minute) {
    const timeStr = `${pad2(hour)}:${pad2(minute)}`;
    if (targetInput) {
      targetInput.value = timeStr;
      targetInput.classList.remove('input-invalid');
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (typeof options.onSelect === 'function') {
      options.onSelect(timeStr);
    }
    closeClockPicker();
  }

  function attachEvents() {
    // Mode toggles
    const btnHour = popover.querySelector('#btn-mode-hour');
    const navHour = popover.querySelector('#nav-mode-hour');
    const btnMin = popover.querySelector('#btn-mode-minute');
    const navMin = popover.querySelector('#nav-mode-minute');

    if (btnHour) btnHour.onclick = () => { currentMode = 'hour'; render(); };
    if (navHour) navHour.onclick = () => { currentMode = 'hour'; render(); };
    if (btnMin) btnMin.onclick = () => { currentMode = 'minute'; render(); };
    if (navMin) navMin.onclick = () => { currentMode = 'minute'; render(); };

    // Direct clicking on hour/minute number elements
    popover.querySelectorAll('.clock-num[data-hour]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedHour = parseInt(el.getAttribute('data-hour'), 10);
        render();
        if (autoSwitchTimer) clearTimeout(autoSwitchTimer);
        autoSwitchTimer = setTimeout(() => {
          currentMode = 'minute';
          render();
        }, 320);
      });
    });

    popover.querySelectorAll('.clock-num[data-minute]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedMinute = parseInt(el.getAttribute('data-minute'), 10);
        render();
      });
    });

    // Dial background click / drag
    const dial = popover.querySelector('#clock-dial');
    if (dial) {
      dial.addEventListener('mousedown', (e) => {
        handleDialInteraction(e);
        const onMouseMove = (moveEvent) => {
          handleDialInteraction(moveEvent);
        };
        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      dial.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
          handleDialInteraction(e.touches[0]);
        }
      }, { passive: true });
    }

    // Minute fine-tuning buttons
    popover.querySelectorAll('.btn-min-step').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const step = parseInt(btn.getAttribute('data-step'), 10);
        selectedMinute = (selectedMinute + step + 60) % 60;
        render();
      });
    });

    // Quick presets
    popover.querySelectorAll('.btn-preset-time').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = btn.getAttribute('data-time');
        const [h, m] = t.split(':').map(Number);
        selectedHour = h;
        selectedMinute = m;
        commitTimeAndClose(selectedHour, selectedMinute);
      });
    });

    // Clear
    const btnClear = popover.querySelector('#btn-clock-clear');
    if (btnClear) {
      btnClear.onclick = () => {
        if (targetInput) {
          targetInput.value = '';
          targetInput.dispatchEvent(new Event('input', { bubbles: true }));
          targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        closeClockPicker();
      };
    }

    // Cancel
    const btnCancel = popover.querySelector('#btn-clock-cancel');
    if (btnCancel) {
      btnCancel.onclick = () => {
        closeClockPicker();
      };
    }

    // Apply (ตกลง)
    const btnApply = popover.querySelector('#btn-clock-apply');
    if (btnApply) {
      btnApply.onclick = () => {
        commitTimeAndClose(selectedHour, selectedMinute);
      };
    }
  }

  // Click outside overlay to close
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) {
      closeClockPicker();
    }
  });

  // Escape key to close
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeClockPicker();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  // Resize / Scroll handling
  const onWindowChange = () => {
    updatePosition();
  };
  window.addEventListener('resize', onWindowChange);
  window.addEventListener('scroll', onWindowChange, true);

  activePickerInstance = {
    overlay,
    targetInput,
    cleanup: () => {
      if (autoSwitchTimer) clearTimeout(autoSwitchTimer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }
  };

  render();
}

export function closeClockPicker() {
  if (activePickerInstance) {
    activePickerInstance.cleanup();
    activePickerInstance = null;
  }
}

// Binds clock picker to inputs with class .time-input-24h
export function bind24hClockPickers(root = document) {
  const inputs = root.querySelectorAll('.time-input-24h');
  inputs.forEach(input => {
    // Avoid duplicate event listener binding
    if (input.dataset.clockBound === 'true') return;
    input.dataset.clockBound = 'true';

    // Remove legacy datalist attribute if present
    input.removeAttribute('list');

    // Click on input opens the 24-hour clock picker
    input.addEventListener('click', (e) => {
      e.stopPropagation();
      openClockPicker(input);
    });

    // Also look for sibling clock button trigger
    const parent = input.closest('.input-group') || input.parentElement;
    if (parent) {
      const btn = parent.querySelector('.btn-clock-trigger');
      if (btn && btn.dataset.clockBound !== 'true') {
        btn.dataset.clockBound = 'true';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openClockPicker(input);
        });
      }
    }
  });
}

