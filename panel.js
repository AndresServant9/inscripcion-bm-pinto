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
  if (!response.ok) throw new Error('Solicitud rechazada');
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
        installments.append(...account.installments.map(payment => item('li',
          'Cuota ' + payment.installment + ' · ' + payment.due_on.split('-').reverse().join('/') +
          ' · ' + money.format(payment.amount) + ' · ' + statuses[payment.status])));
        details.append(installments);
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
  try {
    const session = await request('/auth/v1/token?grant_type=password', {
      email: data.get('email').trim(), password: data.get('password'),
    });
    token = session.access_token;
    await load();
    form.hidden = true;
    get('panel').hidden = false;
    get('status').textContent = '';
  } catch {
    token = '';
    get('status').textContent = 'No se pudo acceder. Comprueba el correo y la contraseña de una cuenta administradora del club.';
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

