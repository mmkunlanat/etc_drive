// store.js - Central Data Store with LocalStorage & Thai Date Helpers

const STORAGE_KEY = 'car_booking_requests_v1';
const CURRENT_ROLE_KEY = 'car_booking_active_role_v1';

// Format Date helpers
export function getTodayISODate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToDate(isoDateStr, days) {
  const d = new Date(isoDateStr);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatThaiDate(isoDateStr) {
  const emptyRes = { full: '-', short: '-', day: '-', monthName: '-', buddhistYear: '-' };
  if (!isoDateStr) return emptyRes;

  let year, month, day;
  if (typeof isoDateStr === 'string' && isoDateStr.includes('-')) {
    const parts = isoDateStr.split('-');
    if (parts.length === 3) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    }
  }

  if (!year || isNaN(year) || !month || isNaN(month) || !day || isNaN(day)) {
    const d = new Date(isoDateStr);
    if (isNaN(d.getTime())) return emptyRes;
    year = d.getFullYear();
    month = d.getMonth() + 1;
    day = d.getDate();
  }
  
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const thaiMonthsShort = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];

  const buddhistYear = year + 543;
  return {
    full: `${day} ${thaiMonths[month - 1] || ''} พ.ศ. ${buddhistYear}`,
    short: `${day} ${thaiMonthsShort[month - 1] || ''} ${buddhistYear}`,
    day: String(day),
    monthName: thaiMonths[month - 1] || '',
    buddhistYear: String(buddhistYear)
  };
}

// Rule validator: Booking must be made at least 1 day before usage
export function validateBookingAdvance(bookingDateStr, usageDateStr) {
  if (!bookingDateStr || !usageDateStr) {
    return {
      isValid: false,
      diffDays: 0,
      message: 'กรุณาระบุวันที่จองและวันที่ต้องการใช้งาน'
    };
  }

  const bookingDate = new Date(bookingDateStr + 'T00:00:00');
  const usageDate = new Date(usageDateStr + 'T00:00:00');
  
  // Calculate difference in days
  const diffTime = usageDate.getTime() - bookingDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 1) {
    const minDate = addDaysToDate(bookingDateStr, 1);
    const minDateThai = formatThaiDate(minDate).full;
    return {
      isValid: false,
      diffDays,
      minValidDate: minDate,
      message: diffDays === 0
        ? `⚠️ ไม่อนุญาตให้จองในวันเดียวกับที่ใช้งาน ต้องจองล่วงหน้าอย่างน้อย 1 วัน (เร็วที่สุดคือ ${minDateThai})`
        : `⚠️ วันที่ใช้งานต้องไม่ใช่วันที่ผ่านมาแล้ว ต้องจองล่วงหน้าอย่างน้อย 1 วัน (เร็วที่สุดคือ ${minDateThai})`
    };
  }

  return {
    isValid: true,
    diffDays,
    message: `✓ ถูกต้อง: จองล่วงหน้า ${diffDays} วัน`
  };
}

// Check 15:00 deadline warning
export function checkSubmissionTimeDeadline() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const isPast15 = hours > 15 || (hours === 15 && minutes > 0);
  return {
    isPast15,
    currentTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} น.`,
    warning: isPast15
      ? '⚠️ ขณะนี้เลยเวลา 15:00 น. แล้ว หากต้องการใช้รถในวันพรุ่งนี้ ใบคำขออาจได้รับการพิจารณาเป็นกรณีพิเศษหรือคิวถัดไป'
      : '✓ อยู่ในช่วงเวลาที่สามารถส่งใบขอใช้รถได้ (ก่อน 15:00 น.)'
  };
}

// Master Data
export const DEPARTMENTS = [
  'ฝ่ายบริหารและอำนวยการ',
  'ฝ่ายขายและการตลาด',
  'ฝ่ายวิศวกรรมและเทคโนโลยีสารสนเทศ',
  'ฝ่ายบัญชีและการเงิน',
  'ฝ่ายทรัพยากรบุคคล (HR)',
  'ฝ่ายจัดซื้อและคลังสินค้า',
  'ฝ่ายปฏิบัติการและการผลิต',
  'ฝ่ายประกันคุณภาพ (QA/QC)'
];

export const VEHICLE_TYPES = [
  { id: 'v_van_commuter', label: 'รถตู้ส่วนกลาง (Toyota Commuter 13 ที่นั่ง)', plate: 'ฮภ-4521 กทม.', capacity: 13 },
  { id: 'v_van_vip', label: 'รถตู้ VIP ผู้บริหาร (Hyundai Staria 7 ที่นั่ง)', plate: 'นข-8899 กทม.', capacity: 7 },
  { id: 'v_pickup_4d', label: 'รถกระบะ 4 ประตู (Isuzu D-Max 5 ที่นั่ง)', plate: 'บย-3104 สมุทรปราการ', capacity: 5 },
  { id: 'v_sedan_civic', label: 'รถเก๋งสำนักงาน (Honda Civic 4 ที่นั่ง)', plate: '8กศ-1205 กทม.', capacity: 4 },
  { id: 'v_truck_cargo', label: 'รถกระบะตู้ทึบขนของ (Toyota Hilux Revo 2 ที่นั่ง)', plate: 'ผต-7741 นนทบุรี', capacity: 2 },
  { id: 'v_custom', label: 'ระบุประเภทอื่น / รถเช่าภายนอก', plate: '-', capacity: 0 }
];

export const DRIVER_POOL = [
  { id: 'drv_1', name: 'นายสมศักดิ์ ขับปลอดภัย', phone: '081-234-5678', license: 'ท.2-948123', status: 'พร้อมรับงาน' },
  { id: 'drv_2', name: 'นายวิชัย ถึงที่หมาย', phone: '089-876-5432', license: 'ท.2-887145', status: 'พร้อมรับงาน' },
  { id: 'drv_3', name: 'นายอนุสรณ์ ทางสะดวก', phone: '086-555-1234', license: 'ท.2-710923', status: 'ติดภารกิจ' },
  { id: 'drv_self', name: 'พนักงานขับเอง (ได้รับอนุญาตแล้ว)', phone: '-', license: 'ส่วนบุคคล', status: 'พร้อมรับงาน' }
];

// Initial Seed Data with varied statuses
function getInitialSeedBookings() {
  const today = getTodayISODate();
  const tomorrow = addDaysToDate(today, 1);
  const next2Days = addDaysToDate(today, 2);
  const yesterday = addDaysToDate(today, -1);

  return [
    {
      id: 'REQ-2026-001',
      formCode: 'FM-OFF-001/3/01-06-66',
      bookingDate: yesterday,
      usageDate: today,
      startTime: '09:00',
      endTime: '16:30',
      bookerName: 'สมชาย รักบริการ',
      bookerPhone: '081-999-1234',
      department: 'ฝ่ายขายและการตลาด',
      requestedVehicle: 'รถตู้ส่วนกลาง (Toyota Commuter 13 ที่นั่ง)',
      assignedVehicle: 'รถตู้ส่วนกลาง (Toyota Commuter ทะเบียน ฮภ-4521 กทม.)',
      requestedDriver: 'ขอพนักงานขับรถของบริษัท',
      assignedDriver: 'นายสมศักดิ์ ขับปลอดภัย (โทร. 081-234-5678)',
      assignedDriverId: 'drv_1',
      status: 'dispatched', // pending_approval -> approved -> dispatched -> completed / rejected
      statusLabel: 'จัดรถและคนขับแล้ว (พร้อมเดินทาง)',
      driverJobStatus: 'in_progress', // not_started, in_progress, completed
      itinerary: [
        { no: 1, detail: 'เดินทางไปพบลูกค้า บริษัท ไทยซัมมิท จำกัด เพื่อส่งมอบเอกสารสัญญา', note: '10:00 น. / 3 คน', destination: 'นิคมอุตสาหกรรมแหลมฉบัง จ.ชลบุรี' },
        { no: 2, detail: 'แวะรับประทานอาหารกลางวันและประชุมย่อย', note: '12:30 น. / 3 คน', destination: 'เซ็นทรัล ศรีราชา' },
        { no: 3, detail: 'เดินทางกลับสำนักงานใหญ่', note: '15:00 น. / 3 คน', destination: 'สำนักงานใหญ่ พระราม 9' }
      ],
      notes: 'ผู้โดยสาร 3 ท่าน ได้แก่ คุณสมชาย, คุณวรรณา, คุณกิตติ มีกระเป๋าเอกสารและของที่ระลึก 2 ลัง',
      bookerSignature: 'สมชาย รักบริการ',
      approverSignature: 'เกรียงไกร มีอำนาจ (ผู้จัดการฝ่ายขาย)',
      approverRemark: 'อนุมัติเพื่อสนับสนุนงานขายลูกค้ารายใหญ่',
      adminSignature: 'สิริมา จัดสรรดี (ฝ่ายสำนักงาน)',
      createdAt: new Date().toISOString()
    },
    {
      id: 'REQ-2026-002',
      formCode: 'FM-OFF-001/3/01-06-66',
      bookingDate: today,
      usageDate: tomorrow,
      startTime: '08:30',
      endTime: '12:00',
      bookerName: 'นฤมล พัฒนาการ',
      bookerPhone: '085-432-1098',
      department: 'ฝ่ายวิศวกรรมและเทคโนโลยีสารสนเทศ',
      requestedVehicle: 'รถเก๋งสำนักงาน (Honda Civic 4 ที่นั่ง)',
      assignedVehicle: '',
      requestedDriver: 'ขอพนักงานขับรถของบริษัท',
      assignedDriver: '',
      assignedDriverId: '',
      status: 'pending_approval',
      statusLabel: 'รอหัวหน้าฝ่ายอนุมัติ',
      driverJobStatus: 'not_started',
      itinerary: [
        { no: 1, detail: 'นำส่งอุปกรณ์เซิร์ฟเวอร์สำรองและตรวจสอบระบบเน็ตเวิร์ก', note: '09:00 น. / 2 คน', destination: 'ศูนย์ดาต้าเซ็นเตอร์ สาขาบางนา' },
        { no: 2, detail: 'รับฮาร์ดดิสก์สำรองกลับมายังสำนักงานใหญ่', note: '11:00 น. / 2 คน', destination: 'สำนักงานใหญ่ พระราม 9' }
      ],
      notes: 'ผู้โดยสาร 2 คน มีอุปกรณ์ไอทีมีมูลค่า โปรดขับขี่ด้วยความระมัดระวัง',
      bookerSignature: 'นฤมล พัฒนาการ',
      approverSignature: '',
      approverRemark: '',
      adminSignature: '',
      createdAt: new Date().toISOString()
    },
    {
      id: 'REQ-2026-003',
      formCode: 'FM-OFF-001/3/01-06-66',
      bookingDate: today,
      usageDate: next2Days,
      startTime: '10:00',
      endTime: '18:00',
      bookerName: 'ภานุวัตร มั่งคั่ง',
      bookerPhone: '082-111-2233',
      department: 'ฝ่ายบริหารและอำนวยการ',
      requestedVehicle: 'รถตู้ VIP ผู้บริหาร (Hyundai Staria 7 ที่นั่ง)',
      assignedVehicle: 'รถตู้ VIP (Hyundai Staria ทะเบียน นข-8899 กทม.)',
      requestedDriver: 'ขอพนักงานขับรถของบริษัท',
      assignedDriver: 'นายวิชัย ถึงที่หมาย (โทร. 089-876-5432)',
      assignedDriverId: 'drv_2',
      status: 'approved',
      statusLabel: 'อนุมัติแล้ว (รอจัดสรรรถ/ยืนยัน)',
      driverJobStatus: 'not_started',
      itinerary: [
        { no: 1, detail: 'ต้อนรับคณะผู้บริหารและกรรมการบริษัทจากต่างประเทศ', note: '10:30 น. / 4 คน', destination: 'สนามบินสุวรรณภูมิ อาคารผู้โดยสารขาเข้า ประตู 4' },
        { no: 2, detail: 'ส่งคณะผู้บริหารเข้าที่พักและประชุม', note: '14:00 น. / 4 คน', destination: 'โรงแรม แกรนด์ ไฮแอท เอราวัณ ราชประสงค์' }
      ],
      notes: 'ผู้โดยสาร 4 ท่าน (คณะกรรมการ) เตรียมน้ำดื่มและป้ายต้อนรับในรถด้วย',
      bookerSignature: 'ภานุวัตร มั่งคั่ง',
      approverSignature: 'ชัยรัตน์ ประเสริฐสุข (ผู้อำนวยการฝ่ายบริหาร)',
      approverRemark: 'อนุมัติตามระเบียบการรับรองแขกต่างประเทศ',
      adminSignature: '',
      createdAt: new Date().toISOString()
    }
  ];
}

// Storage Operations
export function getAllBookings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = getInitialSeedBookings();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading localStorage', e);
    return getInitialSeedBookings();
  }
}

export function saveAllBookings(bookings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
    window.dispatchEvent(new CustomEvent('bookings_updated', { detail: bookings }));
  } catch (e) {
    console.error('Error saving to localStorage', e);
  }
}

export function createBooking(data) {
  const bookings = getAllBookings();
  const nextIdNum = bookings.length + 1;
  const newId = `REQ-2026-${String(nextIdNum).padStart(3, '0')}`;
  
  const newBooking = {
    id: newId,
    formCode: 'FM-OFF-001/3/01-06-66',
    bookingDate: data.bookingDate || getTodayISODate(),
    usageDate: data.usageDate,
    startTime: data.startTime || '08:30',
    endTime: data.endTime || '17:00',
    bookerName: data.bookerName || '',
    bookerPhone: data.bookerPhone || '',
    department: data.department || '',
    requestedVehicle: data.requestedVehicle || '',
    assignedVehicle: data.assignedVehicle || '',
    requestedDriver: data.requestedDriver || '',
    assignedDriver: '',
    assignedDriverId: '',
    status: 'pending_approval',
    statusLabel: 'รอหัวหน้าฝ่ายอนุมัติ',
    driverJobStatus: 'not_started',
    itinerary: data.itinerary && data.itinerary.length > 0 ? data.itinerary : [
      { no: 1, detail: '', note: '', destination: '' }
    ],
    notes: data.notes || '',
    bookerSignature: data.bookerSignature || data.bookerName || '',
    approverSignature: '',
    approverRemark: '',
    adminSignature: '',
    createdAt: new Date().toISOString()
  };

  bookings.unshift(newBooking);
  saveAllBookings(bookings);
  return newBooking;
}

export function updateBooking(id, updateFields) {
  const bookings = getAllBookings();
  const index = bookings.findIndex(b => b.id === id);
  if (index !== -1) {
    bookings[index] = { ...bookings[index], ...updateFields, updatedAt: new Date().toISOString() };
    saveAllBookings(bookings);
    return bookings[index];
  }
  return null;
}

export function deleteBooking(id) {
  let bookings = getAllBookings();
  bookings = bookings.filter(b => b.id !== id);
  saveAllBookings(bookings);
}

export function resetToSeedData() {
  const seed = getInitialSeedBookings();
  saveAllBookings(seed);
  return seed;
}

// Quick Templates Store
const QUICK_TEMPLATES_KEY = 'car_booking_quick_templates_v1';

export const DEFAULT_QUICK_TEMPLATES = [
  {
    id: 'tpl_customer',
    name: '🤝 พบลูกค้า',
    rows: [
      { no: 1, detail: 'เดินทางไปพบลูกค้าเพื่อส่งมอบสัญญาและประชุมนำเสนอโครงการ', time: '10:00', passengers: '3', note: '10:00 น. / 3 คน', destination: 'นิคมอุตสาหกรรมบางปู จ.สมุทรปราการ' },
      { no: 2, detail: 'เดินทางกลับสำนักงานใหญ่', time: '14:30', passengers: '3', note: '14:30 น. / 3 คน', destination: 'สำนักงานใหญ่ พระราม 9' }
    ]
  },
  {
    id: 'tpl_airport',
    name: '✈️ สนามบิน',
    rows: [
      { no: 1, detail: 'ไปรับผู้บริหารและคณะดูงานจากต่างประเทศ', time: '09:30', passengers: '4', note: '09:30 น. / 4 คน', destination: 'สนามบินสุวรรณภูมิ ประตู 4' },
      { no: 2, detail: 'ส่งคณะผู้บริหารเข้าที่พักและศูนย์ประชุม', time: '13:00', passengers: '4', note: '13:00 น. / 4 คน', destination: 'โรงแรม แกรนด์ เซนเตอร์พอยต์ เพลินจิต' }
    ]
  },
  {
    id: 'tpl_cargo',
    name: '📦 ส่งของ',
    rows: [
      { no: 1, detail: 'ขนส่งอุปกรณ์เครื่องมือและอะไหล่ซ่อมบำรุง', time: '08:30', passengers: '2', note: '08:30 น. / 2 คน', destination: 'คลังสินค้า บางนา กม.19' },
      { no: 2, detail: 'นำส่งเอกสารตรวจรับสินค้า', time: '13:30', passengers: '2', note: '13:30 น. / 2 คน', destination: 'สาขานิคมพัฒนา จ.ระยอง' }
    ]
  }
];

export function getQuickTemplates() {
  try {
    const raw = localStorage.getItem(QUICK_TEMPLATES_KEY);
    if (!raw) {
      localStorage.setItem(QUICK_TEMPLATES_KEY, JSON.stringify(DEFAULT_QUICK_TEMPLATES));
      return DEFAULT_QUICK_TEMPLATES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_QUICK_TEMPLATES;
  } catch (e) {
    console.error('Error reading quick templates', e);
    return DEFAULT_QUICK_TEMPLATES;
  }
}

export function saveQuickTemplates(templates) {
  try {
    localStorage.setItem(QUICK_TEMPLATES_KEY, JSON.stringify(templates));
    window.dispatchEvent(new CustomEvent('quick_templates_updated', { detail: templates }));
  } catch (e) {
    console.error('Error saving quick templates', e);
  }
}

export function addQuickTemplate(tpl) {
  const templates = getQuickTemplates();
  const newTpl = {
    ...tpl,
    id: tpl.id || `tpl_${Date.now()}`
  };
  templates.push(newTpl);
  saveQuickTemplates(templates);
  return newTpl;
}

export function updateQuickTemplate(id, updatedFields) {
  const templates = getQuickTemplates();
  const idx = templates.findIndex(t => t.id === id);
  if (idx !== -1) {
    templates[idx] = { ...templates[idx], ...updatedFields };
    saveQuickTemplates(templates);
    return templates[idx];
  }
  return null;
}

export function deleteQuickTemplate(id) {
  let templates = getQuickTemplates();
  templates = templates.filter(t => t.id !== id);
  saveQuickTemplates(templates);
  return templates;
}

export function resetQuickTemplates() {
  saveQuickTemplates(DEFAULT_QUICK_TEMPLATES);
  return DEFAULT_QUICK_TEMPLATES;
}

// Current active role
export function getActiveRole() {
  return localStorage.getItem(CURRENT_ROLE_KEY) || 'booker';
}

export function setActiveRole(role) {
  localStorage.setItem(CURRENT_ROLE_KEY, role);
  window.dispatchEvent(new CustomEvent('role_changed', { detail: role }));
}
