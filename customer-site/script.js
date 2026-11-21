const API = '/api';
const categories = [['🛍️', 'Shopping & Retail', ''], ['🏠', 'Property: Buy/Rent/Sell', ''], ['🏘️', 'Land & Plots', ''], ['🏡', 'Houses & Flats', ''], ['🏢', 'Commercial Property', ''], ['🍱', 'Tiffin & Food', ''], ['🛌', 'PG & Hostel', ''], ['🧺', 'Laundry', ''], ['🔧', 'Repairs', ''], ['📚', 'Tutors', ''], ['✂️', 'Salon & Beauty', ''], ['🖨️', 'Printing', ''], ['🧁', 'Bakery & Cakes', ''], ['🧹', 'Cleaning', ''], ['🚚', 'Packers & Movers', ''], ['👕', 'Tailor & Boutique', ''], ['✈️', 'Travel & Tourism', ''], ['🏥', 'Healthcare', ''], ['💼', 'Jobs', ''], ['🚜', 'Agriculture', ''], ['＋', 'View all', 'Explore more']];
let businesses = [];
let activeFilter = 'all';
let locations = { regions: [] };
const categoryGrid = document.getElementById('categoryGrid');
const businessGrid = document.getElementById('businessGrid');
const emptyState = document.getElementById('emptyState');
const stateSelect = document.getElementById('stateSelect');
const citySelect = document.getElementById('citySelect');
const areaSelect = document.getElementById('areaSelect');
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const sorted = values => [...values].sort((a, b) => a.localeCompare(b));

// Cart state
let cart = JSON.parse(localStorage.getItem('zaroorat_cart') || '{}');
const cartKey = 'zaroorat_cart';

function saveCart() {
  localStorage.setItem(cartKey, JSON.stringify(cart));
  updateCartBadge();
}

function updateCartBadge() {
  const btn = document.getElementById('cartTrigger');
  const total = Object.values(cart).reduce((sum, bizGroup) => {
    return sum + Object.values(bizGroup.products || {}).reduce((s, p) => s + p.qty, 0);
  }, 0);
  if (btn) {
    btn.textContent = `Cart (${total})`;
  }
}

function addToCart(businessId, businessName, productName, price) {
  if (!cart[businessId]) cart[businessId] = { businessName, products: {} };
  if (!cart[businessId].products[productName]) cart[businessId].products[productName] = { price, qty: 0 };
  cart[businessId].products[productName].qty++;
  saveCart();
}

function removeFromCart(businessId, productName) {
  if (!cart[businessId]) return;
  delete cart[businessId].products[productName];
  if (Object.keys(cart[businessId].products).length === 0) delete cart[businessId];
  saveCart();
}

function updateQty(businessId, productName, delta) {
  if (!cart[businessId] || !cart[businessId].products[productName]) return;
  cart[businessId].products[productName].qty = Math.max(1, Math.min(100, cart[businessId].products[productName].qty + delta));
  if (cart[businessId].products[productName].qty === 0) removeFromCart(businessId, productName);
  else saveCart();
}

function matchesCategory(business, targetCategory) {
  if (!targetCategory) return true;
  const t = targetCategory.toLowerCase();
  const bCat = String(business.category || '').toLowerCase();
  const bParent = String(business.parentCategory || '').toLowerCase();
  const bSub = String(business.subcategory || '').toLowerCase();
  const bName = String(business.name || '').toLowerCase();

  if (bCat.includes(t) || t.includes(bCat) || bParent.includes(t) || t.includes(bParent) || bSub.includes(t) || t.includes(bSub) || bName.includes(t)) {
    return true;
  }

  // Specific alias mappings
  if (t.includes('property') && (bCat.includes('property') || bParent.includes('property') || bCat.includes('land') || bCat.includes('house') || bCat.includes('commercial') || bCat.includes('pg'))) return true;
  if (t.includes('tiffin') && (bCat.includes('food') || bParent.includes('food') || bSub.includes('tiffin') || bSub.includes('bakery'))) return true;
  if (t.includes('repair') && (bCat.includes('repair') || bParent.includes('repair') || bSub.includes('repair'))) return true;
  if (t.includes('tutor') && (bCat.includes('tutor') || bParent.includes('education') || bSub.includes('tutor'))) return true;
  if (t.includes('beauty') && (bCat.includes('beauty') || bParent.includes('beauty'))) return true;
  if (t.includes('laundry') && (bCat.includes('laundry') || bCat.includes('tailor'))) return true;
  if (t.includes('healthcare') && (bCat.includes('health') || bParent.includes('health'))) return true;
  if (t.includes('printing') && (bCat.includes('printing') || bParent.includes('printing'))) return true;
  if (t.includes('cleaning') && (bCat.includes('cleaning') || bSub.includes('cleaning'))) return true;
  if (t.includes('packers') && (bCat.includes('packer') || bSub.includes('packer'))) return true;
  if (t.includes('travel') && (bCat.includes('travel') || bParent.includes('travel'))) return true;
  if (t.includes('agriculture') && (bCat.includes('agri') || bParent.includes('agri'))) return true;

  return false;
}

function updateCategoryCounts() {
  categories.forEach(cat => {
    if (cat[1] === 'View all') return;
    const count = businesses.filter(b => matchesCategory(b, cat[1])).length;
    if (count > 0) {
      cat[2] = `${count} verified listing${count !== 1 ? 's' : ''}`;
    } else {
      cat[2] = 'Available';
    }
  });
  categoryGrid.innerHTML = categories.map((category, index) => `<div class="category-card ${index === 0 ? 'active' : ''}" data-category="${esc(category[1])}" role="button" tabindex="0"><div class="cat-icon">${category[0]}</div><b>${esc(category[1])}</b><small>${esc(category[2])}</small></div>`).join('');
  init3DTilt();
}

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
  setDisabled(disabled) {
    this.trigger.disabled = disabled;
    if (disabled) this.close();
  }
  open() {
    if (this.trigger.disabled) return;
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
  toggle() { if (this.panel.hidden) this.open(); else this.close(); }
  renderOptions(list) {
    if (!list.length) { this.optionsContainer.innerHTML = `<div class="dropdown-empty">No matching options found</div>`; return; }
    this.optionsContainer.innerHTML = list.map((item, idx) => {
      const val = typeof item === 'string' ? item : item.value;
      const label = typeof item === 'string' ? item : item.label;
      const badge = typeof item === 'object' && item.badge ? `<span class="region-type-badge">${item.badge}</span>` : '';
      const isSelected = val === this.selectedValue;
      const isHighlighted = idx === this.highlightIndex;
      return `<div class="dropdown-option ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}" data-value="${esc(val)}" data-label="${esc(label)}" role="option" aria-selected="${isSelected}">${esc(label)}${badge}</div>`;
    }).join('');
  }
  initEvents() {
    this.trigger.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
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
    this.optionsContainer.addEventListener('click', (e) => { const option = e.target.closest('.dropdown-option'); if (!option) return; this.selectOption(option.dataset.value, option.dataset.label); });
  }
  updateHighlight(optionElements) {
    optionElements.forEach((el, idx) => {
      if (idx === this.highlightIndex) { el.classList.add('highlighted'); el.scrollIntoView({ block: 'nearest' }); }
      else el.classList.remove('highlighted');
    });
  }
  selectOption(val, label) { this.setValue(val, label); this.close(); this.trigger.focus(); this.onSelect(val); }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-dropdown')) {
    document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.dropdown-panel').forEach(p => p.hidden = true);
  }
});

let stateDropdown, cityDropdown, areaDropdown;
async function loadLocations() {
  try {
    const response = await fetch(`${API}/locations`, { headers: { 'x-demo-mode': 'true' } });
    if (!response.ok) throw new Error('Locations API error');
    locations = await response.json();
    stateDropdown.setItems((locations.regions || []).map(r => ({ value: r.name, label: r.name, badge: r.type })));
  } catch (error) { console.warn('Locations could not load', error); }
}

document.addEventListener('DOMContentLoaded', () => {
  stateDropdown = new CustomDropdown({ containerId: 'stateDropdown', triggerId: 'stateTrigger', valueId: 'stateValue', panelId: 'statePanel', searchId: 'stateSearch', optionsId: 'stateOptions', hiddenInputId: 'stateSelect', placeholder: 'Select State or UT', onSelect: (stateName) => {
    const region = locations.regions.find(r => r.name === stateName);
    const cities = region?.cities || [];
    cityDropdown.setValue('', 'Select City');
    areaDropdown.setValue('', 'Area (optional)');
    cityDropdown.setItems(cities.map(c => ({ value: c.name, label: c.name })));
    cityDropdown.setDisabled(cities.length === 0);
    areaDropdown.setItems([]);
    areaDropdown.setDisabled(true);
    search(false);
  }});
  cityDropdown = new CustomDropdown({ containerId: 'cityDropdown', triggerId: 'cityTrigger', valueId: 'cityValue', panelId: 'cityPanel', searchId: 'citySearch', optionsId: 'cityOptions', hiddenInputId: 'citySelect', placeholder: 'Select City first', onSelect: (cityName) => {
    const region = locations.regions.find(r => r.name === stateDropdown.selectedValue);
    const city = region?.cities?.find(c => c.name === cityName);
    const areas = city?.areas || [];
    areaDropdown.setValue('', 'Area (optional)');
    areaDropdown.setItems(areas.map(a => ({ value: a, label: a })));
    areaDropdown.setDisabled(areas.length === 0);
    search(false);
  }});
  areaDropdown = new CustomDropdown({ containerId: 'areaDropdown', triggerId: 'areaTrigger', valueId: 'areaValue', panelId: 'areaPanel', searchId: 'areaSearch', optionsId: 'areaOptions', hiddenInputId: 'areaSelect', placeholder: 'Area (optional)', onSelect: () => search(false) });
  loadLocations();
});

categoryGrid.innerHTML = categories.map((category, index) => `<div class="category-card ${index === 0 ? 'active' : ''}" data-category="${esc(category[1])}" role="button" tabindex="0"><div class="cat-icon">${category[0]}</div><b>${esc(category[1])}</b><small>${esc(category[2])}</small></div>`).join('');
function init3DTilt() {
  const cards = document.querySelectorAll('.business-card, .category-card');
  cards.forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left; const y = e.clientY - rect.top;
      const xc = rect.width / 2; const yc = rect.height / 2;
      const dx = (x - xc) / xc; const dy = (y - yc) / yc;
      card.style.transform = `perspective(1000px) rotateX(${dy * -8}deg) rotateY(${dx * 8}deg) translateY(-6px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)'; });
  });
}
init3DTilt();
let fullCategories = [];
async function openCategoriesModal() {
  const modal = document.getElementById('modalExplore');
  const modalContent = document.getElementById('modalContent');
  modal.classList.add('modal-wide');
  backdrop.hidden = false;

  modalContent.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 20px;">
      <h2 style="margin: 0; font-family: 'Plus Jakarta Sans', sans-serif;">Explore All Categories</h2>
    </div>
    <div style="text-align: center; padding: 20px;" id="modalLoading">Loading categories...</div>
  `;

  try {
    if (!fullCategories.length) {
      const response = await fetch(`${API}/categories`, { headers: { 'x-demo-mode': 'true' } });
      if (response.ok) {
        const data = await response.json();
        fullCategories = data.categories;
      }
    }

    if (fullCategories.length) {
      modalContent.innerHTML = `
        <div style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 24px; color: #fff;">Explore All Categories</h2>
          <p style="margin: 5px 0 0; color: #a7afc5; font-size: 14px;">Select any category or subcategory to find trusted businesses immediately.</p>
        </div>
        <div class="modal-category-explorer" id="modalCategoryExplorer" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; max-height: 60vh; overflow-y: auto; padding-right: 5px;">
          ${fullCategories.map(cat => `
            <div class="explore-cat-section" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; transition: all 0.2s;">
              <div class="explore-cat-title" data-category="${esc(cat.name)}" style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; cursor: pointer;">
                <span style="font-size: 20px;">${esc(cat.icon)}</span>
                <strong style="color: #fff; font-size: 15px; font-weight: 700; font-family: 'Plus Jakarta Sans';">${esc(cat.name)}</strong>
              </div>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 12px; color: #a7afc5; line-height: 1.8;">
                ${(cat.subcategories || []).map(sub => `
                  <li class="explore-sub-item" data-subcategory="${esc(sub)}" style="cursor: pointer; padding: 2px 0; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#a7afc5'">• ${esc(sub)}</li>
                `).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
      `;
      document.getElementById('modalCategoryExplorer').addEventListener('click', (e) => {
        const titleEl = e.target.closest('.explore-cat-title');
        const subEl = e.target.closest('.explore-sub-item');
        if (titleEl) {
          selectCategoryFromModal(titleEl.dataset.category);
        } else if (subEl) {
          selectCategoryFromModal(subEl.dataset.subcategory);
        }
      });
    } else {
      modalContent.innerHTML = `<p>Error loading categories. Please try again.</p>`;
    }
  } catch (err) {
    modalContent.innerHTML = `<p>Error loading categories. Please try again.</p>`;
  }
}

function selectCategoryFromModal(categoryName) {
  document.getElementById('searchInput').value = categoryName;
  closeModal();
  document.querySelectorAll('.category-card').forEach(item => item.classList.remove('active'));
  search(true);
}

function selectCategory(card) {
  if (!card) return;
  const category = card.dataset.category;
  if (category === 'View all') {
    openCategoriesModal();
  } else {
    document.getElementById('searchInput').value = category;
    document.querySelectorAll('.category-card').forEach(item => item.classList.remove('active'));
    card.classList.add('active');
    search(false);
  }
}
categoryGrid.addEventListener('click', event => selectCategory(event.target.closest('.category-card')));
categoryGrid.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCategory(event.target.closest('.category-card')); } });

function normalizeBusiness(business) { const category = String(business.category || '').toLowerCase(); return { ...business, type: category.includes('food') || category.includes('bakery') ? 'food' : category.includes('tutor') || category.includes('pg') ? 'study' : 'service', icon: category.includes('food') ? '🍛' : category.includes('repair') ? '🔧' : category.includes('laundry') ? '🧺' : category.includes('pg') ? '🏠' : '✦', meta: business.description || business.category || '', rating: business.rating || 'New', reviews: business.reviewCount || '0', tag: business.isVerified ? 'Verified Business' : 'New Listing', filter: category.includes('food') ? 'food' : category.includes('tutor') || category.includes('pg') ? 'students' : 'services' }; }
function renderBusinesses(list = businesses) {
  businessGrid.innerHTML = list.map(business => {
    const businessId = encodeURIComponent(String(business.id || ''));
    const phone = String(business.whatsapp || '').replace(/\D/g, '').replace(/^0/, '91');
    return `<article class="business-card">
      <div class="card-image ${esc(business.type)}">
        <span>${esc(business.icon)}</span>
        <span class="verified">✓ ${esc(business.tag)}</span>
        <button class="heart" type="button" aria-label="Save ${esc(business.name)}">♡</button>
      </div>
      <div class="card-body">
        <div class="card-title">
          <h3>${esc(business.name)}</h3>
          <span class="rating">★ ${esc(business.rating)} (${esc(business.reviews)})</span>
        </div>
        <p class="card-meta">📍 ${esc(business.area || business.city || business.state)} &nbsp; · &nbsp; ${esc(business.meta)}</p>

        ${Array.isArray(business.products) && business.products.length > 0 ? `
          <div class="card-products" style="margin-top:12px; border-top:1px solid rgba(255,255,255,0.08); padding-top:10px;">
            <div style="font-size:11px; font-weight:700; color:var(--blue); text-transform:uppercase; margin-bottom:8px;">Menu / Products</div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${business.products.map(p => {
                const pName = typeof p === 'object' && p !== null ? p.name : p;
                const pPrice = typeof p === 'object' && p !== null ? (p.price || 0) : 0;
                return `
                  <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                    <span>${esc(pName)} ${pPrice > 0 ? `<b style="color:var(--cyan);">₹${pPrice}</b>` : ''}</span>
                    <button type="button" class="add-to-cart-btn ghost-btn"
                      data-biz-id="${esc(business.id)}"
                      data-biz-name="${esc(business.name)}"
                      data-prod-name="${esc(pName)}"
                      data-prod-price="${pPrice}"
                      style="padding:3px 8px; font-size:11px; height:auto; border-color:rgba(118, 87, 255, 0.5); cursor:pointer;">
                      + Add
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <div class="card-footer" style="margin-top:12px;">
          ${business.id ? `<button type="button" class="wa-link enquire-trigger-btn" data-id="${esc(business.id)}" data-name="${esc(business.name)}" style="background:none;border:none;cursor:pointer;font-family:inherit;font-size:inherit;padding:0;">Enquire ↗</button>` : '<span class="wa-link muted-action">Enquire after approval</span>'}
          ${phone ? `<a class="wa-link" href="https://wa.me/${encodeURIComponent(phone)}" target="_blank" rel="noopener">WhatsApp ↗</a>` : ''}
        </div>
      </div>
    </article>`;
  }).join('');
  emptyState.hidden = list.length > 0;
  init3DTilt();

  // Attach click listeners to all Enquire buttons
  document.querySelectorAll('.enquire-trigger-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const bid = btn.dataset.id;
      const bname = btn.dataset.name;
      openEnquiryModal(bid, bname);
    });
  });

  // Attach click listeners to all Add to Cart buttons
  document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const bizId = btn.dataset.bizId;
      const bizName = btn.dataset.bizName;
      const prodName = btn.dataset.prodName;
      const prodPrice = Number(btn.dataset.prodPrice || 0);
      addToCart(bizId, bizName, prodName, prodPrice);

      // Update UI visual feedback
      const originalText = btn.textContent;
      btn.textContent = 'Added ✔';
      btn.style.color = 'var(--cyan)';
      btn.style.borderColor = 'var(--cyan)';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.color = '';
        btn.style.borderColor = '';
      }, 1000);
    });
  });
}
async function loadBusinesses() { try { const response = await fetch(`${API}/businesses?demo=true`, { headers: { 'x-demo-mode': 'true' } }); if (!response.ok) throw new Error('Businesses API error'); const result = await response.json(); businesses = Array.isArray(result.businesses) ? result.businesses.map(normalizeBusiness) : []; updateCategoryCounts(); } catch (error) { businesses = []; } renderBusinesses(); }
loadBusinesses();
function getFilteredBusinesses() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  return businesses.filter(business => {
    const matchesQuery = !query || matchesCategory(business, query);
    const matchesState = !stateSelect.value || business.state === stateSelect.value;
    const matchesCity = !citySelect.value || business.city === citySelect.value;
    const matchesArea = !areaSelect.value || business.area === areaSelect.value;
    const matchesActiveFilter = activeFilter === 'all' || business.filter === activeFilter || business.type === activeFilter;
    return matchesQuery && matchesState && matchesCity && matchesArea && matchesActiveFilter;
  });
}
function search(scroll = true) { renderBusinesses(getFilteredBusinesses()); if (scroll) document.getElementById('popular').scrollIntoView({ behavior: 'smooth' }); }
document.getElementById('searchForm').addEventListener('submit', event => { event.preventDefault(); search(); });
document.querySelectorAll('.filter-btn').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.filter-btn').forEach(item => item.classList.remove('active')); button.classList.add('active'); activeFilter = button.dataset.filter; search(false); }));
const authBackdrop = document.getElementById('authBackdrop');
const authForm = document.getElementById('authForm');
const authPhone = document.getElementById('authPhone');
const authOtp = document.getElementById('authOtp');
const otpField = document.getElementById('otpField');
const authSubmit = document.getElementById('authSubmit');
const loginBtn = document.getElementById('loginBtn');
let currentAccessToken = localStorage.getItem('zaroorat_customer_token') || '';
let pendingPhone = '';

function openAuthModal() {
  if (authBackdrop) authBackdrop.hidden = false;
  if (authPhone) authPhone.focus();
}

function closeAuthModal() {
  if (authBackdrop) authBackdrop.hidden = true;
  if (authForm) authForm.reset();
  if (otpField) otpField.hidden = true;
  if (authSubmit) authSubmit.textContent = 'Request OTP';
  pendingPhone = '';
}

if (loginBtn) {
  loginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentAccessToken) {
      if (confirm('Already signed in. Do you want to sign out?')) {
        localStorage.removeItem('zaroorat_customer_token');
        currentAccessToken = '';
        loginBtn.textContent = 'Login';
        alert('Signed out successfully.');
      }
    } else {
      openAuthModal();
    }
  });
}

const authClose = document.getElementById('authClose');
if (authClose) authClose.addEventListener('click', closeAuthModal);
if (authBackdrop) authBackdrop.addEventListener('click', (e) => { if (e.target === authBackdrop) closeAuthModal(); });

if (authForm) {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (otpField.hidden) {
      const phone = authPhone.value.replace(/\D/g, '');
      if (!/^\d{10}$/.test(phone)) {
        alert('Please enter a valid 10-digit mobile number.');
        return;
      }
      authSubmit.disabled = true;
      authSubmit.textContent = 'Requesting OTP...';
      try {
        const res = await fetch(`${API}/auth/request-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to request OTP');
        pendingPhone = phone;
        otpField.hidden = false;
        if (data.developmentOtp) {
          authOtp.value = data.developmentOtp;
        }
        authSubmit.textContent = 'Verify & Login';
      } catch (err) {
        alert(err.message);
      } finally {
        authSubmit.disabled = false;
      }
    } else {
      const otp = authOtp.value.trim();
      if (!/^\d{6}$/.test(otp)) {
        alert('Please enter a valid 6-digit OTP.');
        return;
      }
      authSubmit.disabled = true;
      authSubmit.textContent = 'Verifying...';
      try {
        const res = await fetch(`${API}/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: pendingPhone, otp })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Verification failed');
        currentAccessToken = data.accessToken;
        localStorage.setItem('zaroorat_customer_token', currentAccessToken);
        loginBtn.textContent = '👤 Account';
        closeAuthModal();
        alert('Successfully logged in!');
      } catch (err) {
        alert(err.message);
      } finally {
        authSubmit.disabled = false;
        authSubmit.textContent = 'Verify & Login';
      }
    }
  });
}

// Enquiry Modal Logic
const enquiryBackdrop = document.getElementById('enquiryBackdrop');
const enquiryModalForm = document.getElementById('enquiryModalForm');
const enquiryBusinessId = document.getElementById('enquiryBusinessId');
const enquiryModalMsg = document.getElementById('enquiryModalMsg');
const enquiryClose = document.getElementById('enquiryClose');

function openEnquiryModal(businessId, businessName) {
  if (enquiryBusinessId) enquiryBusinessId.value = businessId;
  const titleEl = document.getElementById('enquiryTitle');
  if (titleEl) titleEl.textContent = `Enquire: ${businessName}`;
  if (enquiryModalMsg) enquiryModalMsg.textContent = '';
  if (enquiryModalForm) enquiryModalForm.reset();
  if (enquiryBusinessId) enquiryBusinessId.value = businessId;
  if (enquiryBackdrop) enquiryBackdrop.hidden = false;
}

function closeEnquiryModal() {
  if (enquiryBackdrop) enquiryBackdrop.hidden = true;
}

if (enquiryClose) enquiryClose.addEventListener('click', closeEnquiryModal);
if (enquiryBackdrop) enquiryBackdrop.addEventListener('click', (e) => { if (e.target === enquiryBackdrop) closeEnquiryModal(); });

if (enquiryModalForm) {
  enquiryModalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(enquiryModalForm).entries());
    formData.customerPhone = formData.customerPhone.replace(/\D/g, '');
    if (!formData.businessId) {
      enquiryModalMsg.textContent = 'Business ID missing.';
      enquiryModalMsg.className = 'form-message error';
      return;
    }
    if (!/^\d{10}$/.test(formData.customerPhone)) {
      enquiryModalMsg.textContent = 'Please enter a valid 10-digit phone number.';
      enquiryModalMsg.className = 'form-message error';
      return;
    }
    try {
      const res = await fetch(`${API}/enquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send enquiry');
      enquiryModalMsg.textContent = 'Enquiry sent successfully! Business owner will contact you soon.';
      enquiryModalMsg.className = 'form-message success';
      setTimeout(() => {
        closeEnquiryModal();
      }, 1800);
    } catch (err) {
      enquiryModalMsg.textContent = err.message;
      enquiryModalMsg.className = 'form-message error';
    }
  });
}

// Cart & Checkout Logic Implementation
const cartBackdrop = document.getElementById('cartBackdrop');
const cartItemsList = document.getElementById('cartItemsList');
const cartSummary = document.getElementById('cartSummary');
const checkoutBtn = document.getElementById('checkoutBtn');
const cartContent = document.getElementById('cartContent');
const checkoutContent = document.getElementById('checkoutContent');
const checkoutForm = document.getElementById('checkoutForm');
const orderStatusMsg = document.getElementById('orderStatusMsg');
const orderHistoryContent = document.getElementById('orderHistoryContent');
const orderHistoryList = document.getElementById('orderHistoryList');

let activeCheckoutBusinessId = '';

function openCartModal() {
  if (cartBackdrop) {
    cartBackdrop.hidden = false;
    showCartView();
  }
}

function closeCartModal() {
  if (cartBackdrop) {
    cartBackdrop.hidden = true;
  }
}

function showCartView() {
  if (cartContent) cartContent.hidden = false;
  if (checkoutContent) checkoutContent.hidden = true;
  if (orderHistoryContent) orderHistoryContent.hidden = true;
  if (orderStatusMsg) orderStatusMsg.textContent = '';
  renderCart();
}

function showCheckoutView(businessId) {
  console.log('Current token in showCheckoutView:', currentAccessToken);
  if (!currentAccessToken) {
    alert('You need to Login to proceed to Checkout.');
    closeCartModal();
    openAuthModal();
    return;
  }
  activeCheckoutBusinessId = businessId;
  if (cartContent) cartContent.hidden = true;
  if (checkoutContent) checkoutContent.hidden = false;
  if (orderHistoryContent) orderHistoryContent.hidden = true;
  if (orderStatusMsg) orderStatusMsg.textContent = '';

  // Prefill name if available
  const nameField = document.getElementById('checkoutCustomerName');
  if (nameField && !nameField.value) {
    nameField.value = 'Valued Customer';
  }
}

async function showOrderHistoryView() {
  if (!currentAccessToken) {
    alert('Please login to view your Order History.');
    closeCartModal();
    openAuthModal();
    return;
  }
  if (cartContent) cartContent.hidden = true;
  if (checkoutContent) checkoutContent.hidden = true;
  if (orderHistoryContent) orderHistoryContent.hidden = false;
  if (orderStatusMsg) orderStatusMsg.textContent = '';

  if (orderHistoryList) {
    orderHistoryList.innerHTML = '<p style="text-align:center;">Loading orders...</p>';
    try {
      const res = await fetch(`${API}/customer/orders`, {
        headers: {
          'Authorization': `Bearer ${currentAccessToken}`,
          'x-demo-mode': 'true'
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch order history');

      const orders = data.orders || [];
      if (orders.length === 0) {
        orderHistoryList.innerHTML = '<p style="text-align:center;color:#a7afc5;">You have not placed any orders yet.</p>';
        return;
      }

      orderHistoryList.innerHTML = orders.map(order => {
        const dateStr = new Date(order.createdAt).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        let statusColor = 'var(--blue)';
        if (order.status === 'confirmed') statusColor = 'var(--cyan)';
        else if (order.status === 'completed') statusColor = '#2ecc71';
        else if (order.status === 'cancelled') statusColor = 'var(--coral)';

        return `
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:15px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <span style="font-size:11px; color:#a7afc5;">ID: ${order.id.slice(0, 8)}... &middot; ${dateStr}</span>
              <span style="font-size:11px; font-weight:bold; color:${statusColor}; text-transform:uppercase; background:rgba(255,255,255,0.05); padding:3px 8px; border-radius:6px; border:1px solid ${statusColor}33;">
                ${order.status}
              </span>
            </div>
            <div style="font-size:13px; margin-bottom:8px; line-height:1.4;">
              ${order.items.map(item => `
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:#fff;">${esc(item.name)} &times; ${item.quantity}</span>
                  <span style="color:#a7afc5;">₹${item.price * item.quantity}</span>
                </div>
              `).join('')}
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:8px; font-size:13px; font-weight:bold;">
              <span style="color:#a7afc5;">Total Amount:</span>
              <span style="color:var(--cyan); font-size:15px;">₹${order.totalAmount}</span>
            </div>
            <div style="font-size:11px; color:#a7afc5; margin-top:6px; font-style:italic;">
              Address: ${esc(order.deliveryAddress)}
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      orderHistoryList.innerHTML = `<p style="text-align:center;color:var(--coral);">${esc(err.message)}</p>`;
    }
  }
}

function renderCart() {
  if (!cartItemsList || !cartSummary || !checkoutBtn) return;

  const businessIds = Object.keys(cart);
  if (businessIds.length === 0) {
    cartItemsList.innerHTML = `
      <div style="text-align:center; padding:30px 10px;">
        <div style="font-size:36px; margin-bottom:10px;">🛒</div>
        <p style="color:#a7afc5; margin:0;">Your cart is empty.</p>
      </div>
    `;
    cartSummary.innerHTML = 'Total: ₹0';
    checkoutBtn.style.display = 'none';
    return;
  }

  checkoutBtn.style.display = 'block';

  let totalAll = 0;
  let html = '';

  businessIds.forEach(bizId => {
    const bizGroup = cart[bizId];
    let groupTotal = 0;

    html += `
      <div class="cart-biz-group" style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:15px; margin-bottom:15px;">
        <h4 style="margin:0 0 12px; font-size:14px; color:var(--blue); border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">
          ${esc(bizGroup.businessName)}
        </h4>
        <div style="display:flex; flex-direction:column; gap:10px;">
    `;

    Object.keys(bizGroup.products).forEach(prodName => {
      const p = bizGroup.products[prodName];
      const itemSubtotal = p.price * p.qty;
      groupTotal += itemSubtotal;
      totalAll += itemSubtotal;

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
          <div style="flex:1;">
            <div style="font-weight:600; color:#fff;">${esc(prodName)}</div>
            <div style="font-size:11px; color:#a7afc5;">₹${p.price} each</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="qty-btn" onclick="updateQty('${esc(bizId)}', '${esc(prodName)}', -1)" style="width:24px; height:24px; border-radius:50%; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.05); color:#fff; font-weight:bold; cursor:pointer;">-</button>
            <span style="font-weight:bold; min-width:18px; text-align:center;">${p.qty}</span>
            <button type="button" class="qty-btn" onclick="updateQty('${esc(bizId)}', '${esc(prodName)}', 1)" style="width:24px; height:24px; border-radius:50%; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.05); color:#fff; font-weight:bold; cursor:pointer;">+</button>
            <button type="button" class="remove-btn" onclick="removeFromCart('${esc(bizId)}', '${esc(prodName)}')" style="margin-left:8px; background:none; border:none; color:var(--coral); cursor:pointer; font-size:14px;">✖</button>
          </div>
          <span style="font-weight:600; margin-left:12px; min-width:55px; text-align:right;">₹${itemSubtotal}</span>
        </div>
      `;
    });

    html += `
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; border-top:1px dashed rgba(255,255,255,0.08); padding-top:8px; font-size:12px;">
          <span style="color:#a7afc5;">Group Total:</span>
          <span style="font-weight:bold; color:#fff;">₹${groupTotal}</span>
        </div>
        <button type="button" class="primary-btn checkout-group-btn" onclick="showCheckoutView('${esc(bizId)}')" style="width:100%; margin-top:10px; padding:8px; font-size:12px;">
          Checkout from ${esc(bizGroup.businessName)}
        </button>
      </div>
    `;
  });

  cartItemsList.innerHTML = html;
  cartSummary.innerHTML = `Grand Total: ₹${totalAll}`;
}

// Event Bindings for Modal Switches
const cartClose = document.getElementById('cartClose');
if (cartClose) cartClose.addEventListener('click', closeCartModal);

const cartTrigger = document.getElementById('cartTrigger');
if (cartTrigger) cartTrigger.addEventListener('click', openCartModal);

const mobileCartTrigger = document.getElementById('mobileCartTrigger');
if (mobileCartTrigger) mobileCartTrigger.addEventListener('click', (e) => {
  e.preventDefault();
  openCartModal();
});

const viewHistoryBtn = document.getElementById('viewHistoryBtn');
if (viewHistoryBtn) viewHistoryBtn.addEventListener('click', showOrderHistoryView);

const backToCartBtn = document.getElementById('backToCartBtn');
if (backToCartBtn) backToCartBtn.addEventListener('click', showCartView);

const backFromHistoryBtn = document.getElementById('backFromHistoryBtn');
if (backFromHistoryBtn) backFromHistoryBtn.addEventListener('click', showCartView);

const defaultCheckoutBtn = document.getElementById('checkoutBtn');
if (defaultCheckoutBtn) {
  defaultCheckoutBtn.addEventListener('click', () => {
    const bids = Object.keys(cart);
    if (bids.length > 0) {
      showCheckoutView(bids[0]);
    }
  });
}

// Checkout Submit Handler
if (checkoutForm) {
  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentAccessToken) {
      alert('Your session expired. Please login again.');
      return;
    }

    const bizId = activeCheckoutBusinessId;
    if (!bizId || !cart[bizId]) {
      alert('Invalid business or empty cart.');
      return;
    }

    const formData = new FormData(checkoutForm);
    const customerName = formData.get('customerName').trim();
    const deliveryAddress = formData.get('deliveryAddress').trim();

    if (!customerName || !deliveryAddress) {
      alert('Please fill out all required fields.');
      return;
    }

    const orderItems = Object.keys(cart[bizId].products).map(name => {
      return {
        name,
        price: cart[bizId].products[name].price,
        quantity: cart[bizId].products[name].qty
      };
    });

    const payload = {
      businessId: bizId,
      customerName,
      customerPhone: '0000000000', // Server extracts and enforces using session phone anyway
      items: orderItems,
      deliveryAddress
    };

    if (orderStatusMsg) {
      orderStatusMsg.textContent = 'Placing your order...';
      orderStatusMsg.className = 'form-message';
    }

    try {
      const res = await fetch(`${API}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentAccessToken}`,
          'x-demo-mode': 'true'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to place order');

      // Success: Clear Cart for this business
      delete cart[bizId];
      saveCart();

      if (orderStatusMsg) {
        orderStatusMsg.innerHTML = `
          <div style="color:#2ecc71; font-weight:bold; font-size:15px; margin-bottom:10px;">Order Placed Successfully!</div>
          <div style="font-size:13px; color:#fff;">Order ID: <b style="color:var(--cyan);">${data.order.id}</b></div>
          <div style="font-size:12px; color:#a7afc5; margin-top:5px;">Check status anytime in your Order History.</div>
        `;
        orderStatusMsg.className = 'form-message success';
      }

      // Reset checkout form fields
      checkoutForm.reset();

      setTimeout(() => {
        showOrderHistoryView();
      }, 3000);

    } catch (err) {
      if (orderStatusMsg) {
        orderStatusMsg.textContent = err.message;
        orderStatusMsg.className = 'form-message error';
      }
    }
  });
}

// Global closeModal backdrop behavior for cart
if (cartBackdrop) {
  cartBackdrop.addEventListener('click', (e) => {
    if (e.target === cartBackdrop) closeCartModal();
  });
}

// Initialize Cart badge on load
updateCartBadge();

// Expose handlers globally for inline HTML onclick attributes
window.updateQty = updateQty;
window.removeFromCart = removeFromCart;
window.showCheckoutView = showCheckoutView;
window.showOrderHistoryView = showOrderHistoryView;
window.showCartView = showCartView;
window.openCartModal = openCartModal;
window.closeCartModal = closeCartModal;

function closeModal() {
  backdrop.hidden = true;
  const modalExplore = document.getElementById('modalExplore');
  if (modalExplore) modalExplore.classList.remove('modal-wide');
}
document.getElementById('modalClose').onclick = closeModal;
document.getElementById('modalAction').onclick = closeModal;
backdrop.onclick = event => { if (event.target === backdrop) closeModal(); };
document.getElementById('menuBtn').onclick = () => document.getElementById('mobileMenu').classList.toggle('open');
