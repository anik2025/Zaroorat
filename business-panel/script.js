const API = 'http://localhost:4100/api';
const form = document.getElementById('businessForm');
const message = document.getElementById('formMessage');
const button = form.querySelector('.submit-btn');

function showMessage(text, type) {
  message.textContent = text;
  message.className = `form-message ${type}`;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  showMessage('', '');
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form).entries());
  data.phone = data.phone.replace(/\D/g, '');
  data.whatsapp = data.whatsapp.replace(/\D/g, '');
  if (!data.address.trim()) return showMessage('Address required hai.', 'error');
  if (!/^\d{10}$/.test(data.phone)) return showMessage('Please 10 digit mobile number enter karein.', 'error');
  if (data.whatsapp && !/^\d{10}$/.test(data.whatsapp)) return showMessage('WhatsApp number 10 digits ka hona chahiye.', 'error');
  button.disabled = true;
  button.textContent = 'Submitting...';
  try {
    const response = await fetch(`${API}/businesses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Submission failed');
    form.reset();
    showMessage('Business details submit ho gaye hain. Admin approval ke baad aapki listing live hogi.', 'success');
  } catch (error) {
    showMessage(error.message.includes('Failed to fetch') ? 'Backend abhi run nahi hai. Pehle `npm run backend` start karein.' : error.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Submit for approval <span>→</span>';
  }
});
