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
    error.code = (await response.json().catch(() => ({}))).code;
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
          [account.mode === 'agreement' ? 'Acuerdo de pago con el club' : account.mode === 'single' ? 'Pago único' : 'Pago fraccionado',
            'Total ' + money.format(account.total), 'Confirmado ' + money.format(account.confirmed),
            'En revisión ' + money.format(account.in_review), 'Pendiente ' + money.format(account.pending)].join(' · ');
        const installments = document.createElement('ul');
        for (const payment of account.installments) {
          const line = item('li', 'Cuota ' + payment.installment + ' · ' +
            payment.due_on.split('-').reverse().join('/') + ' · ' +
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
                  p_schedule: account.mode === 'agreement' ? 'agreement' : 'standard',
                  p_installment: payment.installment,
                });
                if (!details.isConnected) return;
                status.remove();
                installments.remove();
                details.querySelector(':scope > button')?.remove();
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
          installments.append(line);
        }
        details.append(installments);
        if (account.mode !== 'agreement' && account.confirmed === 0 && account.in_review === 0 && account.pending > 0) {
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

get('team').addEventListener('change', render);
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
  get('reference').value = '';
  get('team').value = '';
  get('status').textContent = '';
  get('panel').hidden = true;
  get('login').hidden = false;
});




