const base = 'https://dfwnzfznhnkcqrdcydnx.supabase.co';
const apiKey = 'sb_publishable_U3568BhgdgCt7ysDU5l1CA_1CenKkjU';
const get = id => document.getElementById(id);
const form = get('signin');
const message = get('message');
const enrollments = get('enrollments');
const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const states = { pending: 'Pendiente', in_review: 'En revisión', confirmed: 'Confirmado', not_applicable: 'No aplica' };

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

function enrollment(row) {
  const card = node('article', '');
  const account = row.payments;
  card.append(node('h2', 'INS-PRUEBA-' + row.id), node('p', row.categories.join(' · ')));
  if (account.agreement_pending) {
    card.append(node('p', 'Acuerdo pendiente de concretar'));
    return card;
  }
  if (account.mode === 'demand') card.append(node('p', 'Pago a demanda'));
  card.append(node('p', [
    'Total ' + euro.format(account.total), 'Confirmado ' + euro.format(account.confirmed),
    'En revisión ' + euro.format(account.in_review), 'Pendiente ' + euro.format(account.pending),
  ].join(' · ')));
  const list = node('ul', '');
  for (const payment of account.installments) {
    const label = payment.due_on ? 'Vencimiento ' + payment.due_on.split('-').reverse().join('/') : 'Ingreso sin vencimiento';
    list.append(node('li', [label, euro.format(payment.amount), states[payment.status]].join(' · ')));
  }
  card.append(list);
  return card;
}

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
    const rows = await post('/rest/v1/rpc/bm_pinto_my_registration_tests', {}, session.access_token);
    enrollments.replaceChildren(...rows.map(enrollment));
    message.textContent = rows.length ? '' : 'Tu cuenta todavía no tiene inscripciones de prueba vinculadas.';
    form.hidden = true;
    get('family').hidden = false;
  } catch {
    message.textContent = signedIn ? 'No se pudieron cargar las inscripciones.' : 'No se pudo iniciar sesión.';
  } finally {
    form.elements.password.value = '';
    button.disabled = false;
  }
};

get('signout').onclick = () => {
  enrollments.replaceChildren();
  message.textContent = '';
  get('family').hidden = true;
  form.hidden = false;
};
