const base = 'https://dfwnzfznhnkcqrdcydnx.supabase.co';
const apiKey = 'sb_publishable_U3568BhgdgCt7ysDU5l1CA_1CenKkjU';
const get = id => document.getElementById(id);
const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const date = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' });
const statuses = { pending: 'Pendiente', in_review: 'En revisión', confirmed: 'Confirmado', not_applicable: 'No aplica' };
let token = '';
let rows = [];
let revision = 0;

async function request(path, body) {
  const headers = { apikey: apiKey, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const error = new Error('Solicitud rechazada');
    error.status = response.status;
    const data = await response.json().catch(() => ({}));
    error.code = data.code;
    error.serverMessage = data.message;
    throw error;
  }
  return response.json();
}

const rpc = (name, body = {}) => request('/rest/v1/rpc/' + name, body);
const reference = row => 'INS-PRUEBA-' + row.id;

function teamName(player) {
  if (player.team === 'national') return 'Primera Nacional masculino';
  if (player.team === 'territorial') return 'Territorial masculino';
  const division = { female: 'femenino', male: 'masculino' }[player.division];
  return player.category + (division ? ' ' + division : ' · Rama sin especificar');
}

function item(tag, value) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

function agreementForm(row, account, refresh) {
  const form = document.createElement('form');
  const fields = document.createElement('div');
  const feedback = item('p', '');
  feedback.setAttribute('role', 'status');

  function addPayment(existing) {
    const payment = document.createElement('fieldset');
    const amount = document.createElement('input');
    amount.type = 'number';
    amount.min = '0.01';
    amount.max = '999999.99';
    amount.step = '0.01';
    amount.required = true;
    const due = document.createElement('input');
    due.type = 'date';
    due.required = true;
    if (existing) { amount.value = existing.amount; due.value = existing.due_on; }
    const remove = item('button', 'Quitar cuota');
    remove.type = 'button';
    remove.onclick = () => payment.remove();
    const amountLabel = item('label', 'Importe (€)');
    const dueLabel = item('label', 'Vencimiento');
    amountLabel.append(amount);
    dueLabel.append(due);
    payment.append(amountLabel, dueLabel, remove);
    fields.append(payment);
  }

  const add = item('button', 'Añadir cuota');
  add.type = 'button';
  add.onclick = () => addPayment();
  const save = item('button', 'Guardar cuotas');
  save.type = 'submit';
  const demand = item('button', 'Pago a demanda');
  demand.type = 'button';
  const record = item('button', 'Registrar ingreso');
  record.type = 'button';
  form.append(fields, add, ' ', save, ' ');
  const income = document.createElement('input');
  income.type = 'text';
  income.inputMode = 'decimal';
  const incomeLabel = item('label', 'Importe del ingreso (€)');
  incomeLabel.append(income);
  if (account.mode === 'demand') {
    const incomeFields = document.createElement('fieldset');
    incomeFields.append(item('legend', 'Pago a demanda'), incomeLabel, record);
    form.append(incomeFields);
  }
  else form.append(demand);
  form.append(feedback);
  const pending = account.installments.filter(payment => payment.status === 'pending');
  pending.forEach(addPayment);
  if (!pending.length) addPayment();

  async function update(action, data) {
    const controls = [...form.querySelectorAll('input, button')];
    controls.forEach(control => { control.disabled = true; });
    feedback.textContent = 'Guardando cambios…';
    try {
      await rpc('bm_pinto_edit_registration_test_payments', {
        p_registration_id: row.id, p_action: action, p_data: data, p_expected: account,
      });
      if (form.isConnected) {
        get('status').textContent = action === 'record' ? 'Ingreso registrado y descontado del saldo pendiente.' : 'Cuotas actualizadas.';
        refresh();
      }
    } catch (error) {
      if (!form.isConnected) return;
      feedback.textContent = error.code === '40001' ? 'Los pagos han cambiado. Pulsa Actualizar e inténtalo de nuevo.'
        : 'No se pudo guardar. Revisa los importes y vencimientos.';
      controls.forEach(control => { control.disabled = false; });
    }
  }

  demand.onclick = () => {
    if (window.confirm('¿Pasar el saldo pendiente a pago a demanda, sin vencimientos fijos?')) update('demand', {});
  };
  record.disabled = income.disabled = account.pending <= 0;
  record.onclick = () => {
    const amount = income.value.trim().replace(',', '.');
    if (!/^[0-9]+([.][0-9]{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > account.pending) {
      feedback.textContent = 'Introduce un importe positivo que no supere el saldo pendiente.';
      return;
    }
    update('record', { amount });
  };

  income.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    record.click();
  });
  form.onsubmit = async event => {
    event.preventDefault();
    const payments = Array.from(fields.children, payment => ({
      amount: payment.querySelector('input[type=number]').valueAsNumber,
      due_on: payment.querySelector('input[type=date]').value,
    }));
    if (!payments.length) {
      feedback.textContent = 'Añade al menos una cuota.';
      return;
    }
    await update('schedule', payments);
  };
  return form;
}

function render() {
  const query = get('reference').value.trim().toLowerCase();
  const team = get('team').value;
  const filtered = rows.filter(row => reference(row).toLowerCase().includes(query) &&
    (!team || row.summary.players.some(player => teamName(player) === team)));
  get('count').textContent = filtered.length + ' inscripciones';
  get('registrations').replaceChildren(...filtered.map(row => {
    const entry = document.createElement('li');
    const details = document.createElement('details');
    details.append(item('summary', 'Ver cuotas y estado'));
    details.addEventListener('toggle', async () => {
      if (!details.open || details.querySelector('p')) return;
      const status = item('p', 'Consultando cuotas…');
      details.append(status);
      try {
        const account = await rpc('bm_pinto_registration_test_payments', { p_registration_id: row.id });
        status.textContent = account.agreement_pending ? 'Acuerdo pendiente de concretar' :
          [account.mode === 'demand' ? 'Pago a demanda' : account.mode === 'agreement' ? 'Acuerdo de pago con el club' : account.mode === 'single' ? 'Pago único' : 'Pago fraccionado',
            'Total ' + money.format(account.total), 'Confirmado ' + money.format(account.confirmed),
            'En revisión ' + money.format(account.in_review), 'Pendiente ' + money.format(account.pending)].join(' · ');
        const installments = document.createElement('ul');
        for (const payment of account.installments) {
          const line = item('li', (payment.due_on ? 'Cuota ' + payment.installment + ' · ' + payment.due_on.split('-').reverse().join('/') : 'Ingreso sin vencimiento · ' + date.format(new Date(payment.confirmed_at))) + ' · ' +
            money.format(payment.amount) + ' · ' + statuses[payment.status]);
          if (payment.status === 'pending' || payment.status === 'in_review') {
            const button = item('button', 'Confirmar ingreso');
            button.type = 'button';
            button.addEventListener('click', async () => {
              if (!window.confirm('¿Has comprobado el ingreso de ' + money.format(payment.amount) + '?')) return;
              button.disabled = true;
              try {
                await rpc('bm_pinto_confirm_registration_test_payment', {
                  p_registration_id: row.id,
                  p_schedule: payment.schedule,
                  p_installment: payment.installment,
                });
                if (!details.isConnected) return;
                status.remove();
                installments.remove();
                details.querySelector(':scope > button')?.remove();
                details.querySelector(':scope > details')?.remove();
                details.dispatchEvent(new Event('toggle'));
                get('status').textContent = 'Ingreso confirmado.';
              } catch {
                if (!details.isConnected) return;
                get('status').textContent = 'No se pudo confirmar el ingreso. Comprueba que se ha ejecutado el SQL 25.';
                button.disabled = false;
              }
            });
            line.append(' ', button);
          }
          if (payment.status === 'in_review' || payment.receipt_received_at) {
            const download = item('button', 'Descargar justificante');
            download.type = 'button';
            download.onclick = async () => {
              download.disabled = true;
              try {
                const receipt = await rpc('bm_pinto_download_registration_test_receipt', {
                  p_id: row.id, p_schedule: payment.schedule, p_installment: payment.installment,
                });
                if (!receipt) throw new Error('Archivo no disponible');
                if (!details.isConnected) return;
                const bytes = Uint8Array.from(atob(receipt.file), char => char.charCodeAt(0));
                const url = URL.createObjectURL(new Blob([bytes], { type: receipt.mime }));
                const link = document.createElement('a');
                link.href = url;
                link.download = 'justificante.' + { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[receipt.mime];
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch {
                if (details.isConnected) get('status').textContent = 'No se pudo descargar el justificante.';
              } finally {
                download.disabled = false;
              }
            };
            line.append(' ', download);
          }
          installments.append(line);
        }
        details.append(installments);
        {
          const editor = document.createElement('details');
          editor.append(item('summary', 'Modificar cuotas'), agreementForm(row, account, () => {
            details.replaceChildren(details.querySelector('summary'));
            if (details.open) details.dispatchEvent(new Event('toggle'));
          }));
          details.append(editor);
        }
        if (!['agreement', 'demand'].includes(account.mode) && account.confirmed === 0 && account.in_review === 0 && account.pending > 0) {
          const agreement = item('button', 'Activar acuerdo de pago con el club');
          agreement.type = 'button';
          agreement.addEventListener('click', async () => {
            if (!window.confirm('¿Dejar el calendario estándar en pausa hasta concretar el acuerdo?')) return;
            agreement.disabled = true;
            try {
              await rpc('bm_pinto_activate_registration_test_agreement', { p_registration_id: row.id });
              if (!details.isConnected) return;
              status.remove();
              installments.remove();
              agreement.remove();
              details.querySelector(':scope > details')?.remove();
              details.dispatchEvent(new Event('toggle'));
              get('status').textContent = 'Acuerdo activado.';
            } catch (error) {
              if (!details.isConnected) return;
              get('status').textContent = error.code === '23514'
                ? 'La inscripción ya tiene pagos registrados. Actualiza el panel.'
                : 'No se pudo activar el acuerdo.';
              agreement.disabled = false;
            }
          });
          details.append(agreement);
        }
      } catch {
        status.remove();
        get('status').textContent = 'No se pudieron consultar las cuotas. Cierra y vuelve a abrir el desglose para reintentar.';
      }
    });
    const teams = row.summary.players.map(player => teamName(player));
    entry.append(item('strong', reference(row)), item('p', date.format(new Date(row.received_at)) + ' · ' + teams.join(', ')), details);
    return entry;
  }));
}

async function load() {
  const current = ++revision;
  const response = await rpc('bm_pinto_list_registration_tests');
  if (revision !== current) return;
  rows = response;
  const select = get('team');
  const previous = select.value;
  const teams = [...new Set(rows.flatMap(row => row.summary.players.map(teamName)))].sort((a, b) => a.localeCompare(b, 'es'));
  select.replaceChildren(new Option('Todos los equipos', ''), ...teams.map(team => new Option(team, team)));
  if (teams.includes(previous)) select.value = previous;
  render();
}

get('login').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  button.disabled = true;
  const data = new FormData(form);
  get('status').textContent = 'Comprobando el acceso…';
  let authenticated = false;
  try {
    const session = await request('/auth/v1/token?grant_type=password', {
      email: data.get('email').trim(), password: data.get('password'),
    });
    token = session.access_token;
    authenticated = true;
    await load();
    form.hidden = true;
    get('panel').hidden = false;
    get('status').textContent = '';
  } catch (error) {
    token = '';
    let message = 'No se pudo conectar con Supabase. Inténtalo de nuevo.';
    if (authenticated && error.code === '42501') {
      message = 'La cuenta ha iniciado sesión, pero no tiene acceso de administrador del club.';
    } else if (authenticated && (error.code === 'PGRST202' || error.status === 404)) {
      message = 'Falta instalar la consulta del panel. Ejecuta el SQL 23 en Supabase.';
    } else if (authenticated) {
      message = 'La cuenta ha iniciado sesión, pero no se pudieron cargar las inscripciones.';
    } else if (error.status === 400 || error.status === 401) {
      message = 'Supabase ha rechazado el inicio de sesión. Comprueba el correo y la contraseña de la cuenta del club.';
    }
    get('status').textContent = message;
  } finally {
    form.elements.password.value = '';
    button.disabled = false;
  }
});

get('sendReminderTest').onclick = async event => {
  const button = event.currentTarget;
  const dateField = get('reminderPreview').elements.previewDate;
  if (!dateField.reportValidity()) return;
  const session = token;
  const status = get('reminderStatus');
  button.disabled = true;
  status.textContent = 'Enviando al buzón de prueba…';
  try {
    const result = await request('/functions/v1/recordatorio-cuotas-prueba', { date: dateField.value });
    if (token === session) status.textContent = result.message;
  } catch (error) {
    if (token !== session) return;
    status.textContent = location.protocol === 'file:'
      ? 'Para enviar la prueba, abre el panel publicado en GitHub Pages.'
      : error.serverMessage || 'No se confirmó el envío. Comprueba el buzón y los registros de la función antes de repetirlo.';
  } finally {
    button.disabled = false;
  }
};
get('team').addEventListener('change', render);
get('reminderPreview').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const status = get('reminderStatus');
  const results = get('reminderResults');
  const session = token;
  button.disabled = true;
  results.replaceChildren();
  status.textContent = 'Consultando avisos…';
  try {
    const reminders = await rpc('bm_pinto_preview_registration_test_reminders', {
      p_today: form.elements.previewDate.value,
    });
    if (token !== session) return;
    const byRecipient = new Map();
    for (const reminder of reminders) {
      const recipient = reminder.recipient.trim().toLowerCase();
      if (!byRecipient.has(recipient)) byRecipient.set(recipient, []);
      byRecipient.get(recipient).push(reminder);
    }
    for (const [recipient, payments] of byRecipient) {
      const entry = item('li', '');
      const preview = document.createElement('details');
      const totalCents = payments.reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0);
      preview.append(item('summary', recipient + ' · ' + money.format(totalCents / 100)));
      preview.append(
        item('strong', 'Recordatorio de cuotas · Club Balonmano Pinto'),
        item('p', 'Hola, estas son las cuotas pendientes que vencen dentro de 7 días.'),
      );
      const list = document.createElement('ul');
      for (const payment of payments) {
        list.append(item('li', [
          payment.reference, 'Cuota ' + payment.installment,
          payment.due_on.split('-').reverse().join('/'), money.format(payment.amount),
        ].join(' · ')));
      }
      const link = item('a', 'Mis inscripciones');
      link.href = 'mis-inscripciones.html';
      const nextStep = item('p', 'Puedes consultar el estado de las cuotas y adjuntar tus justificantes en ');
      nextStep.append(link, '.');
      preview.append(list, nextStep);
      entry.append(preview);
      results.append(entry);
    }
    status.textContent = reminders.length
      ? new Intl.NumberFormat('es-ES').format(byRecipient.size) + (byRecipient.size === 1 ? ' correo previsto' : ' correos previstos') +
        ' · ' + reminders.length + (reminders.length === 1 ? ' cuota' : ' cuotas')
      : 'No hay avisos para esa fecha.';
  } catch {
    if (token === session) status.textContent = 'No se pudo consultar la vista previa.';
  } finally {
    button.disabled = false;
  }
};
get('reference').addEventListener('input', render);
get('refresh').addEventListener('click', async () => {
  try {
    await load();
    get('status').textContent = '';
  } catch {
    if (token) get('status').textContent = 'No se pudo actualizar. Si la sesión ha caducado, vuelve a entrar.';
  }
});
get('logout').addEventListener('click', () => {
  revision++;
  token = '';
  rows = [];
  get('registrations').replaceChildren();
  get('reminderResults').replaceChildren();
  get('reminderStatus').textContent = '';
  get('reference').value = '';
  get('team').value = '';
  get('status').textContent = '';
  get('panel').hidden = true;
  get('login').hidden = false;
});








