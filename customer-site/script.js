const API = 'http://localhost:4100/api';
const categories = [['🍱', 'Tiffin & Food', '120+ businesses'], ['🏠', 'PG & Hostel', '85+ listings'], ['🧺', 'Laundry', '40+ services'], ['🔧', 'Repairs', '95+ professionals'], ['📚', 'Tutors', '60+ tutors'], ['✂️', 'Salon & Beauty', '70+ businesses'], ['🖨️', 'Printing', '35+ shops'], ['🧁', 'Bakery & Cakes', '50+ businesses'], ['🧹', 'Cleaning', '25+ services'], ['🚚', 'Packers & Movers', '30+ services'], ['👕', 'Tailor & Boutique', '45+ businesses'], ['＋', 'View all', 'Explore more']];
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

function fillSelect(select, placeholder, values, disabled = false) {
  select.innerHTML = `<option value="">${placeholder}</option>` + sorted(values).map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  select.disabled = disabled;
}
function selectedRegion() { return locations.regions.find(region => region.name === stateSelect.value); }
function selectedCity() { return selectedRegion()?.cities?.find(city => city.name === citySelect.value); }
function resetCities() { fillSelect(citySelect, 'Select your City', [], true); fillSelect(areaSelect, 'Area / Locality (optional)', [], true); }

async function loadLocations() {
  try {
    const response = await fetch(`${API}/locations`);
    if (!response.ok) throw new Error('Locations API error');
    locations = await response.json();
    fillSelect(stateSelect, 'Select your State / UT', (locations.regions || []).map(region => region.name));
  } catch (error) {
    console.warn('Locations could not load', error);
  }
}
stateSelect.addEventListener('change', () => {
  const region = selectedRegion();
  fillSelect(citySelect, 'Select your City', (region?.cities || []).map(city => city.name), !(region?.cities?.length));
  fillSelect(areaSelect, 'Area / Locality (optional)', [], true);
  search(false);
});
citySelect.addEventListener('change', () => {
  fillSelect(areaSelect, 'Area / Locality (optional)', selectedCity()?.areas || [], false);
  search(false);
});
areaSelect.addEventListener('change', () => search(false));
loadLocations();

categoryGrid.innerHTML = categories.map((category, index) => `<div class="category-card ${index === 0 ? 'active' : ''}" data-category="${esc(category[1])}" role="button" tabindex="0"><div class="cat-icon">${category[0]}</div><b>${esc(category[1])}</b><small>${esc(category[2])}</small></div>`).join('');
function selectCategory(card) { if (!card || card.dataset.category === 'View all') return; document.querySelectorAll('.category-card').forEach(item => item.classList.remove('active')); card.classList.add('active'); document.getElementById('searchInput').value = card.dataset.category; search(false); }
categoryGrid.addEventListener('click', event => selectCategory(event.target.closest('.category-card')));
categoryGrid.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCategory(event.target.closest('.category-card')); } });

function normalizeBusiness(business) { const category = String(business.category || '').toLowerCase(); return { ...business, type: category.includes('food') || category.includes('bakery') ? 'food' : category.includes('tutor') || category.includes('pg') ? 'study' : 'service', icon: category.includes('food') ? '🍛' : category.includes('repair') ? '🔧' : category.includes('laundry') ? '🧺' : category.includes('pg') ? '🏠' : '✦', meta: business.description || business.category || '', rating: business.rating || 'New', reviews: business.reviewCount || '0', tag: business.isVerified ? 'Verified business' : 'New listing', filter: category.includes('food') ? 'food' : category.includes('tutor') || category.includes('pg') ? 'students' : 'services' }; }
function renderBusinesses(list = businesses) { businessGrid.innerHTML = list.map(business => { const businessId = encodeURIComponent(String(business.id || '')); const phone = String(business.whatsapp || '').replace(/\D/g, '').replace(/^0/, '91'); return `<article class="business-card"><div class="card-image ${esc(business.type)}"><span>${esc(business.icon)}</span><span class="verified">✓ ${esc(business.tag)}</span><button class="heart" type="button" aria-label="Save ${esc(business.name)}">♡</button></div><div class="card-body"><div class="card-title"><h3>${esc(business.name)}</h3><span class="rating">★ ${esc(business.rating)} (${esc(business.reviews)})</span></div><p class="card-meta">⌖ ${esc(business.area || business.city || business.state)} &nbsp; · &nbsp; ${esc(business.meta)}</p><div class="card-footer">${business.id ? `<a class="wa-link" href="enquiry.html?businessId=${businessId}">Enquire ↗</a>` : '<span class="wa-link muted-action">Enquire after approval</span>'}${phone ? `<a class="wa-link" href="https://wa.me/${encodeURIComponent(phone)}" target="_blank" rel="noopener">WhatsApp ↗</a>` : ''}</div></div></article>`; }).join(''); emptyState.hidden = list.length > 0; }
async function loadBusinesses() { try { const response = await fetch(`${API}/businesses`); if (!response.ok) throw new Error('Businesses API error'); const result = await response.json(); businesses = Array.isArray(result.businesses) ? result.businesses.map(normalizeBusiness) : []; } catch (error) { businesses = []; } renderBusinesses(); }
loadBusinesses();
function getFilteredBusinesses() { const query = document.getElementById('searchInput').value.toLowerCase().trim(); return businesses.filter(business => (!query || `${business.name} ${business.category || ''} ${business.meta} ${business.area || ''} ${business.city || ''} ${business.state || ''}`.toLowerCase().includes(query)) && (!stateSelect.value || business.state === stateSelect.value) && (!citySelect.value || business.city === citySelect.value) && (!areaSelect.value || business.area === areaSelect.value) && (activeFilter === 'all' || business.filter === activeFilter || business.type === activeFilter)); }
function search(scroll = true) { renderBusinesses(getFilteredBusinesses()); if (scroll) document.getElementById('popular').scrollIntoView({ behavior: 'smooth' }); }
document.getElementById('searchForm').addEventListener('submit', event => { event.preventDefault(); search(); });
document.querySelectorAll('.filter-btn').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.filter-btn').forEach(item => item.classList.remove('active')); button.classList.add('active'); activeFilter = button.dataset.filter; search(false); }));
const backdrop = document.getElementById('modalBackdrop');
function closeModal() { backdrop.hidden = true; }
document.getElementById('modalClose').onclick = closeModal;
document.getElementById('modalAction').onclick = closeModal;
backdrop.onclick = event => { if (event.target === backdrop) closeModal(); };
document.getElementById('menuBtn').onclick = () => document.getElementById('mobileMenu').classList.toggle('open');
