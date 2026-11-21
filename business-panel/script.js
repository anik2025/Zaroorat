const API = '/api';

// Sections
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const registerSection = document.getElementById('register-section');
const mainNav = document.getElementById('mainNav');
const navDashboard = document.getElementById('navDashboard');
const navRegister = document.getElementById('navRegister');

// Login Form Elements
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const loginBtn = document.getElementById('loginBtn');
const otpField = document.getElementById('otp-field');

// Dashboard Elements
const dashboardContent = document.getElementById('dashboard-content');
const dashboardMessage = document.getElementById('dashboardMessage');
const logoutBtn = document.getElementById('logoutBtn');

// Registration Form Elements
const form = document.getElementById('businessForm');
const message = document.getElementById('formMessage');
const button = form.querySelector('.submit-btn');

let currentSessionToken = localStorage.getItem('zaroorat_owner_token') || '';
let currentUserPhone = localStorage.getItem('zaroorat_owner_phone') || '';
let ownerBusinesses = [];
let ownerEnquiries = [];

let locations = {
  regions: [
    { name: "Andhra Pradesh", type: "STATE", cities: [{ name: "Visakhapatnam", areas: [] }, { name: "Vijayawada", areas: [] }] },
    { name: "Delhi", type: "UT", cities: [{ name: "New Delhi", areas: ["Connaught Place", "Karol Bagh", "Lajpat Nagar", "Saket", "Dwarka"] }] },
    { name: "Gujarat", type: "STATE", cities: [{ name: "Ahmedabad", areas: [] }, { name: "Surat", areas: [] }] },
    { name: "Haryana", type: "STATE", cities: [{ name: "Gurugram", areas: ["DLF Phase 1", "Sector 14", "Cyber City"] }, { name: "Faridabad", areas: ["Sector 15"] }] },
    { name: "Karnataka", type: "STATE", cities: [{ name: "Bengaluru", areas: ["Koramangala", "Indiranagar", "Jayanagar", "Whitefield"] }] },
    { name: "Madhya Pradesh", type: "STATE", cities: [{ name: "Bhopal", areas: ["MP Nagar", "Arera Colony"] }, { name: "Indore", areas: ["Vijay Nagar", "Palasia"] }] },
    { name: "Maharashtra", type: "STATE", cities: [{ name: "Mumbai", areas: ["Andheri", "Bandra", "Colaba", "Juhu"] }, { name: "Pune", areas: ["Koregaon Park", "Viman Nagar", "Hinjawadi"] }] },
    { name: "Rajasthan", type: "STATE", cities: [{ name: "Jaipur", areas: ["C-Scheme", "Malviya Nagar", "Vaishali Nagar", "Mansarovar"] }, { name: "Kota", areas: ["Talwandi", "Vigyan Nagar", "Indra Vihar", "Mahaveer Nagar", "Dadabari", "Jawahar Nagar", "Kunhadi", "Gumanpura"] }, { name: "Udaipur", areas: ["Hiran Magri", "Sukhadia Circle"] }] },
    { name: "Tamil Nadu", type: "STATE", cities: [{ name: "Chennai", areas: ["T. Nagar", "Anna Nagar", "Adyar", "Velachery"] }] },
    { name: "Telangana", type: "STATE", cities: [{ name: "Hyderabad", areas: ["Banjara Hills", "Jubilee Hills", "Gachibowli", "Hitech City"] }] },
    { name: "Uttar Pradesh", type: "STATE", cities: [{ name: "Lucknow", areas: ["Hazratganj", "Gomti Nagar", "Aliganj"] }, { name: "Noida", areas: ["Sector 18", "Sector 62"] }] },
    { name: "West Bengal", type: "STATE", cities: [{ name: "Kolkata", areas: ["Park Street", "Salt Lake", "New Town"] }] }
  ]
};

const categoriesList = [
  'Shopping & Retail', 'Property: Buy/Rent/Sell', 'Land & Plots', 'Houses & Flats', 'Commercial Property',
  'Vehicles', 'Agriculture', 'Tiffin & Food', 'PG & Hostel', 'Laundry', 'Repairs', 'Tutors',
  'Salon & Beauty', 'Printing', 'Bakery & Cakes', 'Cleaning', 'Packers & Movers', 'Tailor & Boutique',
  'Travel & Tourism', 'Healthcare', 'Jobs'
];

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));

class CustomDropdown {
  constructor(config) {
    this.container = document.getElementById(config.containerId);
    this.trigger = document.getElementById(config.triggerId);
    this.valueSpan = document.getElementById(config.valueId);
    this.panel = document.getElementById(config.panelId);
    this.searchInput = document.getElementById(config.searchId);
    this.optionsContainer = document.getElementById(config.optionsId);
    this.hiddenInput = document.getElementById(config.hiddenInputId);
    this.placeholder = config.placeholder;
    this.onSelect = config.onSelect || (() => {});
    this.items = [];
    this.selectedValue = '';
    this.highlightIndex = -1;
    this.lockOpen = false;
    this.initEvents();
  }
  setItems(items) {
    this.items = items;
    this.renderOptions(items);
  }
  setValue(val, label) {
    this.selectedValue = val;
    this.hiddenInput.value = val;
    if (val) {
      this.valueSpan.textContent = label || val;
      this.valueSpan.classList.remove('is-placeholder');
    } else {
      this.valueSpan.textContent = this.placeholder;
      this.valueSpan.classList.add('is-placeholder');
    }
  }
  setDisabled(disabled, placeholder) {
    this.trigger.disabled = disabled;
    if (placeholder) {
      this.placeholder = placeholder;
      if (!this.selectedValue) {
        this.valueSpan.textContent = placeholder;
        this.valueSpan.classList.add('is-placeholder');
      }
    }
    if (disabled) this.close();
  }
  open() {
    if (this.trigger.disabled || this.lockOpen) return;
    document.querySelectorAll('.custom-dropdown').forEach(d => { if (d !== this.container) d.classList.remove('open'); });
    document.querySelectorAll('.dropdown-panel').forEach(p => { if (p !== this.panel) p.hidden = true; });
    this.container.classList.add('open');
    this.panel.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.searchInput.value = '';
    this.renderOptions(this.items);
    setTimeout(() => this.searchInput.focus(), 50);
  }
  close() {
    this.container.classList.remove('open');
    this.panel.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.highlightIndex = -1;
  }
  toggle() { if (this.lockOpen) return; if (this.panel.hidden) this.open(); else this.close(); }
  renderOptions(list) {
    if (!list.length) { this.optionsContainer.innerHTML = `<div class="dropdown-empty">No matching options found</div>`; return; }
    this.optionsContainer.innerHTML = list.map((item, idx) => {
      const val = typeof item === 'string' ? item : item.value;
      const label = typeof item === 'string' ? item : item.label;
      const isSelected = val === this.selectedValue;
      const isHighlighted = idx === this.highlightIndex;
      return `<div class="dropdown-option ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}" data-value="${esc(val)}" data-label="${esc(label)}" role="option" aria-selected="${isSelected}">${esc(label)}</div>`;
    }).join('');
  }
  initEvents() {
    this.trigger.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); if (this.lockOpen) return; this.toggle(); });
    this.searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = this.items.filter(item => { const label = typeof item === 'string' ? item : item.label; return label.toLowerCase().includes(q); });
      this.highlightIndex = -1;
      this.renderOptions(filtered);
    });
    this.searchInput.addEventListener('keydown', (e) => {
      const optionElements = Array.from(this.optionsContainer.querySelectorAll('.dropdown-option'));
      if (e.key === 'ArrowDown') { e.preventDefault(); this.highlightIndex = Math.min(this.highlightIndex + 1, optionElements.length - 1); this.updateHighlight(optionElements); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.highlightIndex = Math.max(this.highlightIndex - 1, 0); this.updateHighlight(optionElements); }
      else if (e.key === 'Enter') { e.preventDefault(); if (this.highlightIndex >= 0 && optionElements[this.highlightIndex]) { const el = optionElements[this.highlightIndex]; this.selectOption(el.dataset.value, el.dataset.label); } }
      else if (e.key === 'Escape') { this.close(); this.trigger.focus(); }
    });
    this.optionsContainer.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); const option = e.target.closest('.dropdown-option'); if (!option) return; this.selectOption(option.dataset.value, option.dataset.label); });
  }
  updateHighlight(optionElements) {
    optionElements.forEach((el, idx) => {
      if (idx === this.highlightIndex) { el.classList.add('highlighted'); el.scrollIntoView({ block: 'nearest' }); }
      else el.classList.remove('highlighted');
    });
  }
  selectOption(val, label) {
    this.setValue(val, label);
    this.close();
    this.lockOpen = true;
    setTimeout(() => { this.lockOpen = false; }, 350);
    this.trigger.focus();
    this.onSelect(val);
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-dropdown')) {
    document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.dropdown-panel').forEach(p => p.hidden = true);
  }
});

let categoryDropdown, stateDropdown, cityDropdown, areaDropdown;
let editCategoryDropdown, editStateDropdown, editCityDropdown, editAreaDropdown;

async function loadLocations() {
  try {
    const res = await fetch(`${API}/locations`);
    if (!res.ok) throw new Error('Failed to load locations');
    const data = await res.json();
    if (data && data.regions && data.regions.length > 0) {
      locations = data;
    }
  } catch (err) {
    console.warn('Could not load locations, using fallback', err);
  }
  if (stateDropdown) {
    stateDropdown.setItems((locations.regions || []).map(r => ({ value: r.name, label: r.name })));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  categoryDropdown = new CustomDropdown({
    containerId: 'categoryDropdown',
    triggerId: 'categoryTrigger',
    valueId: 'categoryValue',
    panelId: 'categoryPanel',
    searchId: 'categorySearch',
    optionsId: 'categoryOptions',
    hiddenInputId: 'categorySelect',
    placeholder: 'Select category'
  });
  categoryDropdown.setItems(categoriesList.map(c => ({ value: c, label: c })));

  stateDropdown = new CustomDropdown({
    containerId: 'stateDropdown',
    triggerId: 'stateTrigger',
    valueId: 'stateValue',
    panelId: 'statePanel',
    searchId: 'stateSearch',
    optionsId: 'stateOptions',
    hiddenInputId: 'stateSelect',
    placeholder: 'Select State / UT',
    onSelect: (stateName) => {
      const reg = locations.regions.find(r => r.name === stateName);
      const cities = reg?.cities || [];
      cityDropdown.setValue('', 'Select City');
      areaDropdown.setValue('', 'Select Area first');
      cityDropdown.setItems(cities.map(c => ({ value: c.name, label: c.name })));
      cityDropdown.setDisabled(false, 'Select City');
      areaDropdown.setItems([]);
      areaDropdown.setDisabled(true, 'Select City first');
    }
  });

  cityDropdown = new CustomDropdown({
    containerId: 'cityDropdown',
    triggerId: 'cityTrigger',
    valueId: 'cityValue',
    panelId: 'cityPanel',
    searchId: 'citySearch',
    optionsId: 'cityOptions',
    hiddenInputId: 'citySelect',
    placeholder: 'Select State first',
    onSelect: (cityName) => {
      const reg = locations.regions.find(r => r.name === stateDropdown.selectedValue);
      const city = reg?.cities?.find(c => c.name === cityName);
      const areas = city?.areas || [];
      areaDropdown.setValue('', 'Select Area');
      areaDropdown.setItems(areas.map(a => ({ value: a, label: a })));
      areaDropdown.setDisabled(areas.length === 0, areas.length === 0 ? 'No areas available' : 'Select Area');
    }
  });

  areaDropdown = new CustomDropdown({
    containerId: 'areaDropdown',
    triggerId: 'areaTrigger',
    valueId: 'areaValue',
    panelId: 'areaPanel',
    searchId: 'areaSearch',
    optionsId: 'areaOptions',
    hiddenInputId: 'areaSelect',
    placeholder: 'Select City first'
  });

  loadLocations();
  checkAuthAndRender();

  const phoneInput = form.querySelector('input[name="phone"]');
  const whatsappInput = form.querySelector('input[name="whatsapp"]');
  const sameAsRegistered = document.getElementById('sameAsRegistered');

  sameAsRegistered.addEventListener('change', (e) => {
    if (e.target.checked) {
      whatsappInput.value = phoneInput.value;
    } else {
      whatsappInput.value = '';
    }
  });

  phoneInput.addEventListener('input', () => {
    if (sameAsRegistered.checked) {
      whatsappInput.value = phoneInput.value;
    }
  });

  whatsappInput.addEventListener('input', () => {
    sameAsRegistered.checked = false;
  });

  // Navigation handlers
  navDashboard.addEventListener('click', () => {
    navRegister.classList.remove('active');
    dashboardSection.hidden = false;
    registerSection.hidden = true;
    loadDashboardData();
  });

  navRegister.addEventListener('click', () => {
    navRegister.classList.add('active');
    navDashboard.classList.remove('active');
    registerSection.hidden = false;
    dashboardSection.hidden = true;
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      if (currentSessionToken) {
        await fetch(`${API}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${currentSessionToken}` } });
      }
    } catch (e) {}
    localStorage.removeItem('zaroorat_owner_token');
    localStorage.removeItem('zaroorat_owner_phone');
    currentSessionToken = '';
    currentUserPhone = '';
    mainNav.hidden = true;
    dashboardSection.hidden = true;
    registerSection.hidden = true;
    loginSection.hidden = false;
    loginForm.reset();
    otpField.hidden = true;
    loginBtn.textContent = 'Request OTP →';
    setLoginMessage('', '');
  });
});

function setLoginMessage(text, type) {
  loginMessage.textContent = text;
  loginMessage.className = `form-message ${type}`;
}

let pendingOtpPhone = '';

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setLoginMessage('', '');
  const phoneInput = loginForm.querySelector('input[name="phone"]');
  const otpInput = loginForm.querySelector('input[name="otp"]');

  if (!otpField.hidden) {
    // Verify OTP step
    const phone = pendingOtpPhone;
    const otp = otpInput.value.trim();
    if (!/^\d{6}$/.test(otp)) {
      return setLoginMessage('Please enter a valid 6-digit OTP code.', 'error');
    }
    loginBtn.disabled = true;
    loginBtn.textContent = 'Verifying...';
    try {
      const res = await fetch(`${API}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'OTP verification failed');

      currentSessionToken = data.accessToken;
      currentUserPhone = phone;
      localStorage.setItem('zaroorat_owner_token', currentSessionToken);
      localStorage.setItem('zaroorat_owner_phone', currentUserPhone);

      loginForm.reset();
      otpField.hidden = true;
      loginSection.hidden = true;
      mainNav.hidden = false;
      navDashboard.classList.add('active');
      navRegister.classList.remove('active');
      dashboardSection.hidden = false;
      loadDashboardData();
    } catch (err) {
      setLoginMessage(err.message, 'error');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Verify OTP & Login 🚀';
    }
  } else {
    // Request OTP step
    const phone = phoneInput.value.replace(/\D/g, '');
    if (!/^\d{10}$/.test(phone)) {
      return setLoginMessage('Please enter a valid 10-digit mobile number.', 'error');
    }
    loginBtn.disabled = true;
    loginBtn.textContent = 'Requesting OTP...';
    try {
      const res = await fetch(`${API}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to request OTP');

      pendingOtpPhone = phone;
      otpField.hidden = false;
      if (data.developmentOtp) {
        otpInput.value = data.developmentOtp;
        setLoginMessage(`OTP sent successfully! (Dev OTP auto-filled: ${data.developmentOtp})`, 'success');
      } else {
        setLoginMessage('OTP sent successfully to your mobile number.', 'success');
      }
      loginBtn.textContent = 'Verify OTP & Login 🚀';
    } catch (err) {
      setLoginMessage(err.message, 'error');
    } finally {
      loginBtn.disabled = false;
    }
  }
});

async function checkAuthAndRender() {
  if (!currentSessionToken) {
    loginSection.hidden = false;
    dashboardSection.hidden = true;
    registerSection.hidden = true;
    mainNav.hidden = true;
    return;
  }

  // Verify token by loading dashboard data
  loginSection.hidden = true;
  mainNav.hidden = false;
  navDashboard.classList.add('active');
  dashboardSection.hidden = false;
  loadDashboardData();
}

async function loadDashboardData() {
  dashboardContent.innerHTML = `<div style="text-align:center;padding:40px;color:var(--silver)">Loading your dashboard...</div>`;
  try {
    const [bizRes, enqRes] = await Promise.all([
      fetch(`${API}/owner/businesses`, { headers: { Authorization: `Bearer ${currentSessionToken}` } }),
      fetch(`${API}/owner/enquiries`, { headers: { Authorization: `Bearer ${currentSessionToken}` } })
    ]);

    if (bizRes.status === 401 || enqRes.status === 401) {
      // Session expired or invalid
      localStorage.removeItem('zaroorat_owner_token');
      localStorage.removeItem('zaroorat_owner_phone');
      currentSessionToken = '';
      currentUserPhone = '';
      loginSection.hidden = false;
      dashboardSection.hidden = true;
      registerSection.hidden = true;
      mainNav.hidden = true;
      setLoginMessage('Session expired. Please log in again.', 'error');
      return;
    }

    const bizData = await bizRes.json();
    const enqData = await enqRes.json();

    ownerBusinesses = bizData.businesses || [];
    ownerEnquiries = enqData.enquiries || [];

    renderDashboard();
  } catch (err) {
    dashboardContent.innerHTML = `<div style="color:var(--coral);padding:20px;">Failed to load dashboard data: ${esc(err.message)}</div>`;
  }
}

function renderDashboard() {
  const totalBiz = ownerBusinesses.length;
  const approvedBiz = ownerBusinesses.filter(b => b.status === 'approved').length;
  const pendingBiz = ownerBusinesses.filter(b => b.status === 'pending').length;
  const totalEnq = ownerEnquiries.length;
  const newEnq = ownerEnquiries.filter(e => e.status === 'new').length;

  dashboardContent.innerHTML = `
    <div class="stats-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-bottom:30px;">
      <div class="stat-card futuristic-card neon-border">
        <span class="eyebrow">My Listings</span>
        <h3 style="font-size:28px;margin:8px 0 0;color:var(--blue);">${totalBiz}</h3>
        <small style="color:var(--silver);">${approvedBiz} approved, ${pendingBiz} pending</small>
      </div>
      <div class="stat-card futuristic-card neon-border">
        <span class="eyebrow">Customer Enquiries</span>
        <h3 style="font-size:28px;margin:8px 0 0;color:var(--coral);">${totalEnq}</h3>
        <small style="color:var(--silver);">${newEnq} new enquiries</small>
      </div>
      <div class="stat-card futuristic-card neon-border">
        <span class="eyebrow">Account Phone</span>
        <h3 style="font-size:18px;margin:12px 0 0;color:#fff;">+91 ${esc(currentUserPhone)}</h3>
        <small style="color:var(--silver);">Verified Owner</small>
      </div>
    </div>

    <div class="dashboard-block futuristic-card neon-border" style="margin-bottom:35px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;font-size:20px;font-family:'Plus Jakarta Sans';">My Businesses</h3>
        <button class="submit-btn" id="addAnotherBizBtn" style="padding:10px 16px;font-size:12px;">+ Add Another Business</button>
      </div>
      ${ownerBusinesses.length === 0 ? `
        <div class="futuristic-card neon-border" style="padding:30px;text-align:center;">
          <span style="font-size:40px;display:block;margin-bottom:15px;">🏢</span>
          <p style="color:var(--silver);font-size:14px;">You haven't registered any businesses yet.</p>
          <button class="submit-btn" id="addFirstBizBtn" style="margin-top:18px;padding:10px 18px;font-size:13px;">Register Your First Business →</button>
        </div>
      ` : `
        <div class="business-list" style="display:flex;flex-direction:column;gap:15px;">
          ${ownerBusinesses.map(b => `
            <div class="biz-card futuristic-card neon-border" style="padding:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;">
              <div style="flex:1;min-width:260px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                  <h4 style="margin:0;font-size:18px;color:#fff;">${esc(b.name)}</h4>
                  <span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;background:${b.status === 'approved' ? 'rgba(32,184,255,0.2);color:var(--blue)' : b.status === 'rejected' ? 'rgba(255,107,138,0.2);color:var(--coral)' : 'rgba(216,199,255,0.2);color:var(--lavender)'};">${esc(b.status.toUpperCase())}</span>
                  ${b.isFeatured ? '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;background:rgba(255,215,0,0.2);color:gold;">FEATURED</span>' : ''}
                </div>
                <p style="margin:0 0 8px;font-size:12px;color:var(--silver);"><b>${esc(b.category)}</b> • ${esc(b.area)}, ${esc(b.city)}, ${esc(b.state)}</p>
                <p style="margin:0;font-size:12px;color:#d4daf0;">${esc(b.address)}</p>
              </div>
              <div style="display:flex;gap:10px;align-items:center;">
                <button class="submit-btn edit-biz-btn" data-id="${esc(b.id)}" style="padding:8px 14px;font-size:12px;background:var(--deep);border:1px solid var(--violet);color:#fff;">Edit Profile</button>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <div class="dashboard-block futuristic-card neon-border">
      <h3 style="margin:0 0 15px;font-size:20px;font-family:'Plus Jakarta Sans';">Customer Enquiries</h3>
      ${ownerEnquiries.length === 0 ? `
        <div class="futuristic-card neon-border" style="padding:30px;text-align:center;">
          <span style="font-size:40px;display:block;margin-bottom:15px;">💬</span>
          <p style="color:var(--silver);font-size:14px;">No enquiries received yet for your businesses.</p>
        </div>
      ` : `
        <div class="enquiries-table-wrap" style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px;">
            <thead>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.1);color:var(--silver);">
                <th style="padding:12px;">Customer</th>
                <th style="padding:12px;">Business</th>
                <th style="padding:12px;">Message</th>
                <th style="padding:12px;">Date</th>
                <th style="padding:12px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${ownerEnquiries.map(e => {
                const biz = ownerBusinesses.find(b => b.id === e.businessId);
                return `
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:14px;vertical-align:top;">
                      <div style="font-weight:700;color:#fff;">${esc(e.customerName)}</div>
                      <a href="tel:${esc(e.customerPhone)}" style="color:var(--blue);font-size:12px;text-decoration:none;">📞 +91 ${esc(e.customerPhone)}</a>
                    </td>
                    <td style="padding:14px;vertical-align:top;color:var(--silver);">${esc(biz ? biz.name : 'Unknown Business')}</td>
                    <td style="padding:14px;vertical-align:top;color:#d4daf0;max-width:280px;word-break:break-word;">${esc(e.message)}</td>
                    <td style="padding:14px;vertical-align:top;color:var(--silver);font-size:11px;">${new Date(e.createdAt).toLocaleString()}</td>
                    <td style="padding:14px;vertical-align:top;">
                      <select class="enquiry-status-select" data-id="${esc(e.id)}" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px 10px;color:#fff;font-size:12px;outline:none;">
                        <option value="new" ${e.status === 'new' ? 'selected' : ''}>New</option>
                        <option value="contacted" ${e.status === 'contacted' ? 'selected' : ''}>Contacted</option>
                        <option value="closed" ${e.status === 'closed' ? 'selected' : ''}>Closed</option>
                      </select>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

async function updateEnquiryStatus(enquiryId, newStatus) {
  try {
    const res = await fetch(`${API}/owner/enquiries/${enquiryId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSessionToken}`
      },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update enquiry status');
    // Refresh enquiries list locally
    const enq = ownerEnquiries.find(e => e.id === enquiryId);
    if (enq) enq.status = newStatus;
  } catch (err) {
    alert('Error updating status: ' + err.message);
    loadDashboardData();
  }
}

// Edit Business Modal State & Logic
function openEditBusinessModal(businessId) {
  const b = ownerBusinesses.find(item => item.id === businessId);
  if (!b) return alert('Business not found');

  // Create modal overlay dynamically
  const modalHTML = `
    <div id="editBizModal" style="position:fixed;inset:0;background:rgba(9,13,26,0.85);backdrop-filter:blur(8px);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px;">
      <div class="form-card" style="width:100%;max-width:650px;max-height:90vh;overflow-y:auto;position:relative;">
        <div class="form-heading">
          <div>
            <span class="eyebrow">EDIT PROFILE</span>
            <h2>${esc(b.name)}</h2>
            <p>Update your business profile details (Status: ${b.status.toUpperCase()})</p>
          </div>
          <button type="button" id="closeEditModalBtn" style="background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;">✕</button>
        </div>
        <form id="editBizForm" style="display:flex;flex-direction:column;gap:15px;">
          <label class="input-label">Business Name *<input name="name" required value="${esc(b.name)}" maxlength="80"></label>
          <label class="input-label">Category *<input name="category" required value="${esc(b.category)}" maxlength="80"></label>
          <label class="input-label">Owner Name *<input name="ownerName" required value="${esc(b.ownerName)}" maxlength="80"></label>
          <label class="input-label">WhatsApp Number
            <div class="phone-input-wrap"><span class="prefix">+91</span><input name="whatsapp" type="tel" inputmode="numeric" value="${esc(b.whatsapp || '')}" maxlength="10"></div>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
            <label class="input-label">State *<input name="state" required value="${esc(b.state)}"></label>
            <label class="input-label">City *<input name="city" required value="${esc(b.city)}"></label>
            <label class="input-label">Area *<input name="area" required value="${esc(b.area)}"></label>
          </div>
          <label class="input-label">Full Address *<input name="address" required value="${esc(b.address)}" maxlength="180"></label>
          <label class="input-label">Business Description
            <textarea name="description" rows="3" maxlength="500">${esc(b.description || '')}</textarea>
          </label>
          <label class="input-label">Products / Services (comma separated)
            <textarea name="products" rows="2" maxlength="500">${esc(Array.isArray(b.products) ? b.products.join(', ') : '')}</textarea>
          </label>
          <label class="input-label">Pricing Info
            <input name="pricing" value="${esc(b.pricing || '')}" maxlength="150">
          </label>
          <label class="input-label">Image URLs (comma separated)
            <input name="images" value="${esc(Array.isArray(b.images) ? b.images.join(', ') : '')}" maxlength="500">
          </label>
          <div class="form-actions" style="margin-top:10px;">
            <button type="button" class="submit-btn" id="cancelEditModalBtn" style="background:var(--muted);">Cancel</button>
            <button type="submit" class="submit-btn">Save Changes 🚀</button>
          </div>
          <div class="form-message" id="editModalMessage" role="status"></div>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modalEl = document.getElementById('editBizModal');
  const closeBtn = document.getElementById('closeEditModalBtn');
  const cancelBtn = document.getElementById('cancelEditModalBtn');
  if (closeBtn) closeBtn.addEventListener('click', () => modalEl && modalEl.remove());
  if (cancelBtn) cancelBtn.addEventListener('click', () => modalEl && modalEl.remove());

  const editForm = document.getElementById('editBizForm');
  const editMsg = document.getElementById('editModalMessage');

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    editMsg.textContent = '';
    editMsg.className = 'form-message';

    const formData = Object.fromEntries(new FormData(editForm).entries());
    formData.whatsapp = formData.whatsapp ? formData.whatsapp.replace(/\D/g, '') : '';
    if (formData.whatsapp && !/^\d{10}$/.test(formData.whatsapp)) {
      editMsg.textContent = 'WhatsApp number must be 10 digits.';
      editMsg.className = 'form-message error';
      return;
    }

    try {
      const res = await fetch(`${API}/owner/businesses/${businessId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentSessionToken}`
        },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update business profile');

      document.getElementById('editBizModal').remove();
      loadDashboardData();
    } catch (err) {
      editMsg.textContent = err.message;
      editMsg.className = 'form-message error';
    }
  });
}

// Dashboard Event Delegation
dashboardContent.addEventListener('click', (e) => {
  if (e.target.id === 'addAnotherBizBtn') {
    navRegister.click();
  } else if (e.target.classList.contains('edit-biz-btn')) {
    openEditBusinessModal(e.target.dataset.id);
  }
});

dashboardContent.addEventListener('change', (e) => {
  if (e.target.classList.contains('enquiry-status-select')) {
    updateEnquiryStatus(e.target.dataset.id, e.target.value);
  }
});
