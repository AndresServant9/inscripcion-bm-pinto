const profile = document.querySelector('#profile');
const renewal = document.querySelector('#renewal');
const statusMessage = document.querySelector('#status');
const choices = [...document.querySelectorAll('input[name="kind"]')];
const receiptStep = document.querySelector('#receiptStep');
const requestSummary = document.querySelector('#requestSummary');
const api = 'https://dfwnzfznhnkcqrdcydnx.supabase.co/rest/v1/rpc/bm_pinto_submit_membership_test';
const key = 'sb_publishable_U3568BhgdgCt7ysDU5l1CA_1CenKkjU';
const discountLogin = document.querySelector('#discountLogin');
const discountPreview = document.querySelector('#discountPreview');
const discountStatus = document.querySelector('#discountPreviewStatus');
const currency = new Intl.NumberFormat('es-ES', {style: 'currency', currency: 'EUR'});
let discountRevision = 0;
let draft;
let verifiedQuote;

function identifierValue(form) {
  return form.elements.identifier.value.replace(/[\s.-]/g, '').toUpperCase();
}

function quoteIdentity() {
  return {identifier: identifierValue(profile), email: profile.elements.email.value.trim().toLowerCase()};
}

function describeQuote(result) {
  return 'Cuota de socio estimada: ' + currency.format(result.base_fee - result.membership_discount) + '.' +
    (result.pending_installment_discount > 0
      ? ' Ajuste previsto en la última cuota de la inscripción: ' + currency.format(result.pending_installment_discount) + '.' : '');
}

function clearStatus() {
  statusMessage.textContent = '';
  statusMessage.hidden = true;
}

function selectMode() {
  draft = null;
  receiptStep.reset();
  receiptStep.hidden = true;
  const renew = choices.find(choice => choice.checked).value === 'renew';
  discountRevision++;
  verifiedQuote = null;
  discountPreview.hidden = renew;
  discountStatus.textContent = '';
  profile.hidden = renew;
  renewal.hidden = !renew;
  clearStatus();
}
discountLogin.onsubmit = async event => {
  event.preventDefault();
  const revision = ++discountRevision;
  verifiedQuote = null;
  const button = discountLogin.querySelector('button');
  button.disabled = true;
  discountStatus.textContent = 'Consultando descuento…';
  try {
    const identity = quoteIdentity();
    if (!/^(?:[0-9]{8}|[XYZ][0-9]{7})[A-Z]$/.test(identity.identifier) || !identity.email) {
      throw Error('Rellena primero el DNI o NIE y el correo del alta.');
    }
    const base = new URL(api).origin;
    const headers = {apikey: key, 'Content-Type': 'application/json'};
    const email = discountLogin.elements.email.value.trim();
    const login = await fetch(base + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers, body: JSON.stringify({email, password: discountLogin.elements.password.value}),
      signal: AbortSignal.timeout(15000),
    });
    if (!login.ok) throw Error('No se pudo verificar la cuenta.');
    const account = await login.json();
    const quote = await fetch(base + '/rest/v1/rpc/bm_pinto_preview_membership_test_quote', {
      method: 'POST', headers: {...headers, Authorization: 'Bearer ' + account.access_token},
      body: JSON.stringify({p_identifier: identity.identifier, p_email: identity.email}),
      signal: AbortSignal.timeout(15000),
    });
    if (!quote.ok) throw Error('No se pudo consultar el descuento.');
    const result = await quote.json();
    if (!result) throw Error('El DNI o NIE y el correo del alta deben coincidir con los de tu cuenta verificada del club.');
    if (revision !== discountRevision) return;
    verifiedQuote = {identity, accessToken: account.access_token};
    discountStatus.textContent = describeQuote(result) + ' El club confirma el descuento al revisar la solicitud.';
  } catch (error) {
    if (revision === discountRevision) discountStatus.textContent = error.message;
  } finally {
    discountLogin.elements.password.value = '';
    button.disabled = false;
  }
};

for (const choice of choices) choice.addEventListener('change', selectMode);
for (const field of [profile.elements.identifier, profile.elements.email]) {
  field.addEventListener('input', () => {
    discountRevision++;
    verifiedQuote = null;
    discountStatus.textContent = '';
  });
}
for (const form of [profile, renewal]) {
  form.oninput = clearStatus;
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    if (button.disabled) return;
    if (form === profile && discountLogin.querySelector('button').disabled) return;
    const identifier = form.elements.identifier;
    const normalized = identifierValue(form);
    statusMessage.hidden = false;
    if (!/^(?:[0-9]{8}|[XYZ][0-9]{7})[A-Z]$/.test(normalized)) {
      statusMessage.textContent = 'Introduce un DNI o NIE completo, incluida la letra.';
      identifier.focus();
      return;
    }
    const kind = form === profile ? 'new' : 'renew';
    const data = Object.fromEntries(new FormData(form));
    delete data.identifier;
    let reservation;
    const authorization = kind === 'new' && verifiedQuote?.identity.identifier === normalized &&
      verifiedQuote.identity.email === data.email.trim().toLowerCase() ? verifiedQuote.accessToken : null;
    const requestId = crypto.randomUUID();
    if (authorization) {
      const controls = [...form.elements, ...choices, ...discountLogin.elements];
      controls.forEach(control => { control.disabled = true; });
      statusMessage.textContent = 'Reservando el descuento…';
      try {
        const response = await fetch(new URL('/rest/v1/rpc/bm_pinto_reserve_membership_test_quote', api), {
          method: 'POST',
          headers: {apikey: key, 'Content-Type': 'application/json', Authorization: 'Bearer ' + authorization},
          body: JSON.stringify({p_id: requestId, p_identifier: normalized, p_email: data.email.trim()}),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw Error(error.message === 'Ya hay una solicitud para este documento'
            ? 'Ya hay una solicitud para este documento. Contacta con el club.'
            : 'No se pudo reservar el descuento. Vuelve a consultar con tu cuenta antes de transferir.');
        }
        reservation = await response.json();
        if (!reservation?.id) throw Error('No se pudo confirmar la reserva. Vuelve a intentarlo.');
      } catch (error) {
        statusMessage.textContent = error.message;
        return;
      } finally {
        controls.forEach(control => { control.disabled = false; });
      }
    }
    if (kind === 'renew') {
      const controls = [...form.elements, ...choices];
      controls.forEach(control => { control.disabled = true; });
      statusMessage.textContent = 'Comprobando el padrón de 2026/2027…';
      try {
        const result = await fetch(new URL('/rest/v1/rpc/bm_pinto_check_membership_test_renewal', api), {
          method: 'POST',
          headers: {apikey: key, 'Content-Type': 'application/json'},
          body: JSON.stringify({p_identifier: normalized}),
          signal: AbortSignal.timeout(12000),
        });
        if (result.status === 429) throw Error('Hay demasiadas consultas. Inténtalo dentro de un minuto.');
        if (!result.ok) throw Error('No se pudo comprobar el padrón. Inténtalo de nuevo.');
        if (await result.json() !== true) {
          statusMessage.textContent = 'Ese documento no consta en el padrón de 2026/2027. Revisa el DNI o NIE o contacta con el club.';
          return;
        }
      } catch (error) {
        statusMessage.textContent = error.message;
        return;
      } finally {
        controls.forEach(control => { control.disabled = false; });
      }
    }
    draft = {submission: {p_id: reservation?.id ?? requestId, p_identifier: normalized, p_kind: kind, p_profile: data}, authorization};
    requestSummary.textContent = kind === 'new'
      ? data.fullName + ' · ' + data.email + ' · ' +
        (reservation ? 'Importe a transferir: ' + currency.format(reservation.base_fee - reservation.membership_discount) + '.' +
          (reservation.pending_installment_discount > 0
            ? ' Al validar el justificante, se aplicará un ajuste de ' + currency.format(reservation.pending_installment_discount) + ' en la última cuota de la inscripción.' : '')
          : 'Cuota anual general: 35 €.')
      : 'Renovación comprobada en el padrón de 2026/2027 · Cuota anual general: 35 €.';
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
  statusMessage.textContent = 'Enviando solicitud…';
  try {
    const encoded = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const response = await fetch(api, {
      method: 'POST',
      headers: {apikey: key, 'Content-Type': 'application/json',
        ...(draft.authorization ? {Authorization: 'Bearer ' + draft.authorization} : {})},
      body: JSON.stringify({...draft.submission, p_receipt: encoded}),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      if (response.status === 401 && draft.authorization) {
        throw Error('La sesión ha caducado. Vuelve a editar y consulta de nuevo con la misma cuenta para recuperar tu reserva.');
      }
      if (failure.message === 'No se pudo tramitar la solicitud' || failure.code === '23505') {
        throw Error('Ya hay una solicitud de alta o renovación para este documento en 2027/2028. Contacta con el club si necesitas corregirla.');
      }
      if (failure.message === 'Formato de justificante no admitido' ||
          failure.message === 'Adjunta un justificante de hasta 5 MB') {
        throw Error('El archivo adjunto debe ser un PDF, JPG o PNG de hasta 5 MB.');
      }
      if (failure.message === 'El documento no consta en el padrón de 2026/2027') {
        throw Error('El documento no consta en el padrón anterior. Revisa el DNI o NIE o contacta con el club.');
      }
      if (failure.code === 'PGRST202') throw Error('El envío de solicitudes aún no está habilitado en Supabase.');
      throw Error('No se pudo guardar la solicitud. Puedes volver a intentar el mismo envío.');
    }
    const reference = await response.json();
    if (typeof reference !== 'string' || !reference.startsWith('SOCIO-PRUEBA-')) {
      throw Error('No se pudo confirmar la recepción. Puedes volver a intentar el mismo envío.');
    }
    profile.reset();
    renewal.reset();
    selectMode();
    statusMessage.hidden = false;
    statusMessage.textContent = 'Solicitud recibida. Pendiente de revisión por el club. Referencia ' + reference + '.';
  } catch (error) {
    statusMessage.textContent = error instanceof TypeError || error.name === 'TimeoutError'
      ? 'No se pudo confirmar el envío. Revisa la conexión y vuelve a intentar el mismo envío.'
      : error.message || 'No se pudo leer el justificante. Selecciona el archivo de nuevo.';
  } finally {
    controls.forEach(control => { control.disabled = false; });
  }
};
selectMode();
