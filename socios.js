const profile = document.querySelector('#profile');
const renewal = document.querySelector('#renewal');
const statusMessage = document.querySelector('#status');
const choices = [...document.querySelectorAll('input[name="kind"]')];
const receiptStep = document.querySelector('#receiptStep');
const requestSummary = document.querySelector('#requestSummary');
const api = 'https://dfwnzfznhnkcqrdcydnx.supabase.co/rest/v1/rpc/bm_pinto_submit_membership_test';
const key = 'sb_publishable_U3568BhgdgCt7ysDU5l1CA_1CenKkjU';
let draft;

function clearStatus() {
  statusMessage.textContent = '';
  statusMessage.hidden = true;
}

function selectMode() {
  draft = null;
  receiptStep.reset();
  receiptStep.hidden = true;
  const renew = choices.find(choice => choice.checked).value === 'renew';
  profile.hidden = renew;
  renewal.hidden = !renew;
  clearStatus();
}

for (const choice of choices) choice.addEventListener('change', selectMode);
for (const form of [profile, renewal]) {
  form.oninput = clearStatus;
  form.onsubmit = event => {
    event.preventDefault();
    const identifier = form.elements.identifier;
    const normalized = identifier.value.replace(/[\s.-]/g, '').toUpperCase();
    statusMessage.hidden = false;
    if (!/^(?:[0-9]{8}|[XYZ][0-9]{7})[A-Z]$/.test(normalized)) {
      statusMessage.textContent = 'Introduce un DNI o NIE completo, incluida la letra.';
      identifier.focus();
      return;
    }
    const kind = form === profile ? 'new' : 'renew';
    const data = Object.fromEntries(new FormData(form));
    delete data.identifier;
    draft = {p_id: crypto.randomUUID(), p_identifier: normalized, p_kind: kind, p_profile: data};
    requestSummary.textContent = kind === 'new'
      ? data.fullName + ' · ' + data.email + ' · Cuota anual general de prueba: 35 €.'
      : 'Renovación · Cuota anual general de prueba: 35 €.';
    clearStatus();
    form.hidden = true;
    receiptStep.hidden = false;
    receiptStep.elements.receipt.focus();
  };
}
document.querySelector('#editRequest').onclick = selectMode;
receiptStep.onsubmit = async event => {
  event.preventDefault();
  if (!draft) return;
  const file = receiptStep.elements.receipt.files[0];
  statusMessage.hidden = false;
  if (!file?.size || file.size > 5 * 1024 * 1024) {
    statusMessage.textContent = 'Selecciona un PDF, JPG o PNG de hasta 5 MB.';
    return;
  }
  const controls = [...receiptStep.elements, ...choices];
  controls.forEach(control => { control.disabled = true; });
  statusMessage.textContent = 'Enviando solicitud de prueba…';
  try {
    const encoded = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const response = await fetch(api, {
      method: 'POST',
      headers: {apikey: key, 'Content-Type': 'application/json'},
      body: JSON.stringify({...draft, p_receipt: encoded}),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Error('Solicitud rechazada');
    const reference = await response.json();
    profile.reset();
    renewal.reset();
    selectMode();
    statusMessage.hidden = false;
    statusMessage.textContent = 'Solicitud de prueba recibida. Pendiente de revisión por el club. Referencia ' + reference + '.';
  } catch {
    statusMessage.textContent = 'No se pudo guardar la solicitud. Comprueba el justificante o vuelve a intentar el mismo envío.';
  } finally {
    controls.forEach(control => { control.disabled = false; });
  }
};
selectMode();
