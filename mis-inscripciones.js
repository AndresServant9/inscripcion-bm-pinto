const base = 'https://dfwnzfznhnkcqrdcydnx.supabase.co';
const apiKey = 'sb_publishable_U3568BhgdgCt7ysDU5l1CA_1CenKkjU';
const get = id => document.getElementById(id);
const form = get('signin');
const message = get('message');
const enrollments = get('enrollments');
const refreshEnrollments = get('refreshEnrollments');
const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const historyDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeZone: 'Europe/Madrid' });
const paymentFilter = get('familyPaymentFilter');
const states = { pending: 'Pendiente', in_review: 'En revisión', confirmed: 'Confirmado', not_applicable: 'No aplica' };
let token = '';

function membershipRequest(row) {
  const card = node('article', '');
  const title = row.kind === 'renew' ? 'Renovación' : 'Alta';
  card.append(node('h2', [title, row.full_name].filter(Boolean).join(' · ')));
  card.append(node('p', 'Temporada ' + row.season));
  if (!row.rejected_at) card.append(node('p', 'Cuota de socio ' + euro.format(row.fee)));
  const state = row.rejected_at ? 'Solicitud rechazada. Contacta con el club para revisar los datos.'
    : row.awaiting_receipt ? 'Pendiente de completar y adjuntar el justificante.'
    : row.approved_at ? 'Solicitud validada.'
    : 'Justificante recibido. Pendiente de revisión por el club.';
  card.append(node('p', state));
  if (!row.rejected_at && row.installment_discount > 0) {
    card.append(node('p', (row.approved_at ? 'Descuento aplicado a la última cuota de inscripción: '
      : 'Descuento reservado para la última cuota de inscripción: ') + euro.format(row.installment_discount)));
  }
  if (row.approved_at && !row.rejected_at) {
    card.append(node('p', row.card_state === 'sent' ?
      (row.is_campaign ? 'Carné enviado al correo de la solicitud.' : 'Carné de prueba enviado al buzón de pruebas.') :
      'El club está gestionando el envío del carné.'));
  }
  card.append(node('p', 'Referencia SOCIO-PRUEBA-' + row.id));
  return card;
}

async function loadMembershipRequests(session) {
  const rows = await post('/rest/v1/rpc/bm_pinto_my_membership_requests', {}, session);
  if (token !== session) return;
  get('membershipRequests').replaceChildren(...rows.map(membershipRequest));
  get('membershipRequestsStatus').textContent = rows.length ? '' :
    'No hay solicitudes de socio asociadas al correo de esta cuenta.';
}

async function post(path, data, token) {
  const headers = { apikey: apiKey, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Solicitud rechazada');
  return response.json();
}

function node(tag, content) {
  const element = document.createElement(tag);
  element.textContent = content;
  return element;
}

function enrollment(row, rejections) {
  const card = node('article', '');
  const account = row.payments;
  const reference = 'INS-PRUEBA-' + row.id;
  const copy = node('button', 'Copiar referencia');
  const feedback = node('p', '');
  feedback.hidden = true;
  feedback.setAttribute('role', 'status');
  copy.type = 'button';
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      feedback.textContent = 'Referencia copiada.';
    } catch {
      feedback.textContent = 'Selecciona la referencia que aparece arriba y cópiala manualmente.';
    }
    feedback.hidden = false;
  };
  const names = account.player_names ?? [];
  card.append(node('h2', names.length ? names.join(' · ') : reference));
  if (names.length) card.append(node('p', 'Referencia ' + reference));
  card.append(copy, feedback, node('p', row.categories.join(' · ')));
  if (account.agreement_pending) {
    card.append(node('p', 'Acuerdo pendiente de concretar'));
    return card;
  }
  if (account.mode === 'demand') card.append(node('p', 'Pago a demanda'));
  const nextPayment = account.installments.reduce((next, payment) => {
    if (payment.status !== 'pending' || !payment.due_on) return next;
    return !next || payment.due_on < next.due_on ? payment : next;
  }, null);
  if (nextPayment) {
    card.append(node('p', 'Primera cuota pendiente: ' + euro.format(nextPayment.amount)
      + ' · Vencimiento ' + nextPayment.due_on.split('-').reverse().join('/')));
  }
  card.append(node('p', [
    'Total ' + euro.format(account.total), 'Confirmado ' + euro.format(account.confirmed),
    'En revisión ' + euro.format(account.in_review), 'Pendiente ' + euro.format(account.pending),
  ].join(' · ')));
  const list = node('ul', '');
  for (const payment of account.installments) {
    const label = payment.due_on ? 'Vencimiento ' + payment.due_on.split('-').reverse().join('/') : 'Ingreso sin vencimiento';
    const history = payment.confirmed_at ? 'Confirmado el ' + historyDate.format(new Date(payment.confirmed_at))
      : payment.receipt_received_at ? 'Justificante recibido el ' + historyDate.format(new Date(payment.receipt_received_at))
      : '';
    const line = node('li', [label, euro.format(payment.amount), states[payment.status], history].filter(Boolean).join(' · '));
    line.dataset.paymentState = payment.status;
    if (payment.status === 'pending') {
      const rejection = rejections.find(entry => entry.registration_id === row.id &&
        entry.schedule === payment.schedule && entry.installment === payment.installment);
      if (rejection) line.append(node('p', 'Justificante rechazado. Motivo: ' + rejection.reason));
      line.append(receiptForm(row.id, payment));
    }
    if (payment.receipt_received_at) line.append(' ', downloadReceipt(row.id, payment));
    list.append(line);
  }
  if (account.mode === 'demand' && Number(account.pending) > 0) {
    const balance = node('li', 'Saldo sin vencimiento · ' + euro.format(account.pending) + ' · Pendiente');
    balance.dataset.paymentState = 'pending';
    list.append(balance);
  }
  card.append(list);
  return card;
}

function downloadReceipt(id, payment) {
  const button = node('button', 'Descargar justificante');
  button.type = 'button';
  button.onclick = async () => {
    const session = token;
    if (!session || button.disabled) return;
    button.disabled = true;
    try {
      const receipt = await post('/rest/v1/rpc/bm_pinto_download_registration_test_receipt', {
        p_id: id, p_schedule: payment.schedule, p_installment: payment.installment,
      }, session);
      if (token !== session) return;
      const extension = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[receipt?.mime];
      if (!extension || !receipt.file) throw new Error('Archivo no disponible');
      const bytes = Uint8Array.from(atob(receipt.file), char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: receipt.mime }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'justificante-' + id + '-' + payment.schedule + '-' + payment.installment + '.' + extension;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (token === session) message.textContent = 'No se pudo descargar el justificante. Actualiza el estado de los pagos y vuelve a intentarlo.';
    } finally {
      button.disabled = false;
    }
  };
  return button;
}

function receiptForm(id, payment) {
  const upload = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.jpg,.jpeg,.png';
  input.required = true;
  const label = node('label', 'Justificante (PDF, JPG o PNG, máximo 5 MB)');
  label.append(input);
  const button = node('button', 'Subir justificante de prueba');
  const feedback = node('p', '');
  feedback.setAttribute('role', 'status');
  upload.append(label, button, feedback);
  upload.onsubmit = async event => {
    event.preventDefault();
    const file = input.files[0];
    if (!file?.size || file.size > 5 * 1024 * 1024) {
      feedback.textContent = 'Selecciona un archivo de hasta 5 MB.';
      return;
    }
    const session = token;
    button.disabled = input.disabled = true;
    feedback.textContent = 'Subiendo justificante…';
    try {
      const encoded = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await post('/rest/v1/rpc/bm_pinto_upload_registration_test_receipt', {
        p_id: id, p_schedule: payment.schedule, p_installment: payment.installment, p_file: encoded,
      }, session);
    } catch {
      feedback.textContent = 'No se pudo subir el justificante. Comprueba el formato y que la cuota siga pendiente.';
      button.disabled = input.disabled = false;
      return;
    }
    if (token !== session) return;
    message.textContent = 'Justificante recibido. El pago queda en revisión.';
    try {
      await loadEnrollments(session);
    } catch {
      feedback.textContent = 'Justificante guardado. Vuelve a entrar para actualizar el estado.';
    }
  };
  return upload;
}

async function loadEnrollments(session) {
  const rows = await post('/rest/v1/rpc/bm_pinto_my_registration_tests', {}, session);
  const [rejections, discount] = await Promise.all([
    post('/rest/v1/rpc/bm_pinto_my_registration_test_receipt_rejections', {}, session).catch(() => []),
    post('/rest/v1/rpc/bm_pinto_my_registration_test_membership_discount', {}, session).catch(() => null),
  ]);
  if (token === session) {
    const membership = get('membershipDiscount');
    membership.hidden = !discount || Number(discount.discount) <= 0;
    membership.textContent = membership.hidden ? '' :
      'Descuento orientativo en el alta de socio: ' + euro.format(discount.discount) + '.';
    enrollments.replaceChildren(...rows.map(row => enrollment(row, rejections)));
    applyPaymentFilter();
  }
  try {
    await loadMembershipRequests(session);
  } catch {
    if (token === session) {
      get('membershipRequests').replaceChildren();
      get('membershipRequestsStatus').textContent = 'No se pudieron consultar las solicitudes de socio. Pulsa actualizar para reintentarlo.';
    }
  }
  return rows;
}

function applyPaymentFilter() {
  const selected = paymentFilter.value;
  let matches = 0;
  for (const card of enrollments.children) {
    const payments = [...card.querySelectorAll('[data-payment-state]')];
    for (const payment of payments) {
      payment.hidden = Boolean(selected && payment.dataset.paymentState !== selected);
      if (!payment.hidden) matches++;
    }
    card.hidden = Boolean(selected && !payments.some(payment => !payment.hidden));
  }
  get('familyFilterEmpty').hidden = !selected || matches > 0;
}
paymentFilter.onchange = applyPaymentFilter;

refreshEnrollments.onclick = async () => {
  const session = token;
  if (!session || refreshEnrollments.disabled) return;
  refreshEnrollments.disabled = true;
  message.textContent = 'Actualizando inscripciones y solicitudes de socio…';
  try {
    const rows = await loadEnrollments(session);
    if (token !== session) return;
    message.textContent = rows.length
      ? 'Estado actualizado.'
      : 'Tu cuenta todavía no tiene inscripciones vinculadas.';
  } catch {
    if (token === session) message.textContent = 'No se pudo actualizar. Si la sesión ha caducado, vuelve a entrar.';
  } finally {
    refreshEnrollments.disabled = false;
  }
};

form.onsubmit = async event => {
  event.preventDefault();
  const credentials = new FormData(form);
  const button = form.querySelector('button');
  button.disabled = true;
  message.textContent = 'Iniciando sesión…';
  let signedIn = false;
  try {
    const session = await post('/auth/v1/token?grant_type=password', {
      email: credentials.get('email').trim(), password: credentials.get('password'),
    });
    signedIn = true;
    token = session.access_token;
    const rows = await loadEnrollments(token);
    message.textContent = rows.length ? '' : 'Tu cuenta todavía no tiene inscripciones vinculadas.';
    form.hidden = true;
    get('family').hidden = false;
  } catch {
    token = '';
    message.textContent = signedIn ? 'No se pudieron cargar las inscripciones.' : 'No se pudo iniciar sesión.';
  } finally {
    form.elements.password.value = '';
    button.disabled = false;
  }
};

get('signout').onclick = () => {
  get('membershipDiscount').hidden = true;
  get('membershipDiscount').textContent = '';
  paymentFilter.value = '';
  get('familyFilterEmpty').hidden = true;
  token = '';
  enrollments.replaceChildren();
  get('membershipRequests').replaceChildren();
  get('membershipRequestsStatus').textContent = '';
  message.textContent = '';
  get('family').hidden = true;
  form.hidden = false;
};
