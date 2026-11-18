const season = {
  year: 2027,
  singlePaymentCutoff: '2027-07-01',
  dates: ['antes del 1 de julio', 'antes del 15 de septiembre', 'antes del 24 de diciembre'],
  categories: [
    {minBirth: 2020, name: 'Prebenjamín', federated: false, installments: [80,150,150]},
    {minBirth: 2018, name: 'Benjamín', federated: false, installments: [80,150,150]},
    {minBirth: 2016, name: 'Alevín', federated: true, installments: [80,200,160]},
    {minBirth: 2014, name: 'Infantil', federated: true, installments: [80,200,160]},
    {minBirth: 2012, name: 'Cadete', federated: true, installments: [80,200,160]},
    {minBirth: 2010, name: 'Juvenil', federated: true, installments: [80,200,160]},
    {minBirth: 0, name: 'Sénior', federated: true, installments: [80,200,160]},
  ],
};
function madridDate(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}
function singlePaymentDeadline(now = new Date()) {
  return madridDate(now) <= season.singlePaymentCutoff
    ? 'con vencimiento el 1 de julio de 2027'
    : 'el día en que envíes la inscripción';
}
function categoryFor(date) {
  if (!date || Number(date.slice(0, 4)) > season.year) return null;
  return season.categories.find(category => Number(date.slice(0, 4)) >= category.minBirth);
}
function ageOnDate(birth, today = new Date()) {
  if (!birth) return null;
  const [year, month, day] = birth.split('-').map(Number);
  const beforeBirthday = today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day);
  return today.getFullYear() - year - Number(beforeBirthday);
}
function calculate(players, member, day = madridDate()) {
  const eligible = players.filter(player => player.team !== 'national' && player.category?.name !== 'Sénior' &&
    player.birth && ageOnDate(player.birth, new Date(day + 'T12:00:00')) < 18);
  const siblings = players.length > 1;
  const lines = players.map(player => {
    const exempt = player.team === 'national';
    const discount = exempt ? 0 : (siblings ? 10 : 0) + (member ? 10 : 0);
    const payments = exempt ? [0,0,0] : [...player.category.installments];
    if (player.hasKit) payments[0] = 0;
    payments[2] -= discount;
    if (!exempt && day >= '2027-12-01') {
      const month = Number(day.slice(5, 7));
      const tenths = {12: 8, 1: 7, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2}[month] ?? 2;
      const annual = player.category.installments[1] + player.category.installments[2];
      const fixed = !player.category.federated ? 0 :
        ['Juvenil', 'Sénior'].includes(player.category.name) ? 18760 : 6516;
      const prorated = Math.round(fixed + (annual * 100 - fixed) * tenths / 10) / 100;
      payments.splice(0, 3, Math.max(0, prorated + payments[0] - discount), 0, 0);
    } else if (day >= '2027-09-15') {
      payments[0] += payments[1];
      payments[1] = 0;
    }
    return {...player, discount, payments, total: payments.reduce((sum, value) => sum + value, 0)};
  });
  return {lines, laterDiscount: member ? 0 : Math.min(20, eligible.length * 10)};
}
function scheduledPayments(amounts, deadlines) {
  return amounts.map((amount, index) => ({amount, deadline: deadlines[index]}))
    .filter(payment => payment.amount > 0)
    .map((payment, index) => ({...payment, label: 'Pago ' + (index + 1)}));
}
if (typeof module !== 'undefined') module.exports = {categoryFor, calculate, singlePaymentDeadline, scheduledPayments};
if (typeof document !== 'undefined') {
  const form = document.querySelector('#registration');
  const container = document.querySelector('#players');
  const summary = document.querySelector('#summary');
  const proratedSeason = madridDate() >= '2027-12-01';
  document.querySelector('#splitPaymentOption').hidden = proratedSeason;
  document.querySelector('#proratedPaymentNote').hidden = !proratedSeason;
  const reviewStatus = document.querySelector('#reviewStatus');
  function setStatus(element, text, kind = 'error') {
    element.dataset.kind = kind;
    element.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    element.textContent = text;
    if (text && kind === 'error') {
      element.focus({preventScroll: true});
      element.scrollIntoView({block: 'center', behavior: 'smooth'});
    }
  }
  const confirmRegistration = document.querySelector('#confirmRegistration');
  const printRegistration = document.querySelector('#printRegistration');
  const accountFields = document.querySelector('#registrationAccount');
  const accountEmail = document.querySelector('#registrationEmail');
  const accountPassword = document.querySelector('#registrationPassword');
  const openMyRegistrations = document.querySelector('#openMyRegistrations');
  const firstReceipt = document.querySelector('#firstReceipt');
  const firstReceiptField = document.querySelector('#firstReceiptField');
  const firstReceiptLabel = document.querySelector('#firstReceiptLabel');
  for (const input of [accountEmail, accountPassword, firstReceipt]) {
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      if (reviewStatus.dataset.kind === 'error') setStatus(reviewStatus, '', 'info');
    });
  }
  function firstReceiptAmount(registration) {
    const data = registration?.data;
    if (!data || (data.registration_day < season.singlePaymentCutoff &&
      !data.players.some(player => !player.hasKit && player.team !== 'national'))) return 0;
    return data.payment === 'single' ? data.total : data.players.reduce((total, player) => total + player.payments[0], 0);
  }
  function updateFirstReceipt() {
    const amount = firstReceiptAmount(reviewedRegistration);
    firstReceiptField.hidden = amount <= 0;
    firstReceiptLabel.textContent = 'Justificante de prueba del primer pago (' +
      new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount) + ') · PDF, JPG o PNG, máximo 5 MB';
  }

  document.querySelector('#editRegistration').onclick = () => {
    summary.hidden = true;
    form.elements.contact.focus();
  };
  const registrationApi = 'https://dfwnzfznhnkcqrdcydnx.supabase.co/rest/v1/rpc/bm_pinto_submit_registration_test';
  const publishableKey = 'sb_publishable_U3568BhgdgCt7ysDU5l1CA_1CenKkjU';
  const signup = document.querySelector('#registrationSignup');
  const verify = document.querySelector('#registrationVerify');
  const signupStatus = document.querySelector('#registrationSignupStatus');
  let pendingAccount;
  let clubSession;
  async function accountRequest(path, body, token) {
    const headers = {apikey: publishableKey, 'Content-Type': 'application/json'};
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(new URL(path, registrationApi), {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    return {ok: response.ok, data: await response.json().catch(() => ({}))};
  }
  signup.onsubmit = async event => {
    event.preventDefault();
    const button = signup.querySelector('button');
    if (button.disabled) return;
    const fields = new FormData(signup);
    const email = fields.get('email').trim().toLowerCase();
    const password = fields.get('password');
    const identifier = fields.get('identifier').replace(/[\s.-]/g, '').toUpperCase();
    const name = fields.get('fullName').trim();
    const phone = fields.get('phone').trim();
    if (!name || !phone) {
      setStatus(signupStatus, 'Introduce el nombre completo y el teléfono del titular.');
      return;
    }
    if (!/^(?:[0-9]{8}|[XYZ][0-9]{7})[A-Z]$/.test(identifier)) {
      setStatus(signupStatus, 'Introduce el DNI o NIE completo del titular de la cuenta, incluida la letra.');
      signup.elements.identifier.focus();
      return;
    }
    if (password !== fields.get('repeat')) {
      setStatus(signupStatus, 'Las contraseñas no coinciden.');
      signup.elements.repeat.focus();
      return;
    }
    button.disabled = true;
    setStatus(signupStatus, 'Solicitando código…', 'info');
    try {
      const {ok, data} = await accountRequest('/auth/v1/signup', {
        email, password, data: {store_name: name, store_phone: phone},
      });
      if (['user_already_exists', 'email_exists'].includes(data.code) || data.identities?.length === 0) {
        accountEmail.value = email;
        throw Error('Ese correo ya está registrado. Inicia sesión con tu cuenta del club.');
      }
      if (!ok) throw Error('No se pudo crear la cuenta. Comprueba los datos o inténtalo más tarde.');
      pendingAccount = {email, identifier};
      signup.reset();
      signup.hidden = true;
      verify.hidden = false;
      setStatus(signupStatus, 'Introduce el código que hemos enviado a tu correo.', 'info');
      verify.elements.code.focus();
    } catch (error) {
      setStatus(signupStatus, error.message);
    } finally {
      button.disabled = false;
    }
  };
  verify.onsubmit = async event => {
    event.preventDefault();
    const button = verify.querySelector('button');
    if (!pendingAccount || button.disabled) return;
    button.disabled = true;
    try {
      if (!pendingAccount.token) {
        const result = await accountRequest('/auth/v1/verify', {
          email: pendingAccount.email, token: verify.elements.code.value.trim(), type: 'email',
        });
        if (!result.ok || !result.data.access_token) throw Error('El código es incorrecto o ha caducado.');
        pendingAccount.token = result.data.access_token;
      }
      const saved = await accountRequest('/rest/v1/rpc/bm_pinto_save_customer_identifier',
        {identifier: pendingAccount.identifier}, pendingAccount.token);
      if (!saved.ok) throw Error('Correo verificado. Pulsa Verificar correo para reintentar el guardado del DNI/NIE.');
      clubSession = {email: pendingAccount.email, token: pendingAccount.token};
      accountEmail.value = clubSession.email;
      pendingAccount = null;
      verify.reset();
      verify.hidden = true;
      setStatus(signupStatus, 'Cuenta del club verificada. Ya puedes enviar la inscripción.', 'success');
      document.querySelector('#createRegistrationAccount summary').textContent = 'Cuenta del club creada';
    } catch (error) {
      setStatus(signupStatus, error.message);
    } finally {
      button.disabled = false;
    }
  };
  let reviewedRegistration = null;
  let reviewedPayload = '';
  let registrationKey = '';
  let registrationSending = false;
  confirmRegistration.onclick = async () => {
    if (!reviewedRegistration || registrationSending) return;
    const registration = reviewedRegistration;
    const needsReceipt = firstReceiptAmount(registration) > 0;
    const file = firstReceipt.files[0];
    const existingSession = clubSession?.email === accountEmail.value.trim().toLowerCase() && clubSession;
    if (!existingSession && (!accountEmail.value.trim() || !accountEmail.checkValidity() || !accountPassword.value)) {
      setStatus(reviewStatus, 'Introduce el correo y la contraseña de tu cuenta del club.');
      accountEmail.setAttribute('aria-invalid', String(!accountEmail.value.trim() || !accountEmail.checkValidity()));
      accountPassword.setAttribute('aria-invalid', String(!accountPassword.value));
      return;
    }
    if (needsReceipt && (!file?.size || file.size > 5 * 1024 * 1024)) {
      setStatus(reviewStatus, 'Adjunta un justificante de prueba de hasta 5 MB para el primer pago.');
      firstReceipt.focus();
      return;
    }
    registrationSending = true;
    confirmRegistration.disabled = true;
    accountFields.disabled = true;
    setStatus(reviewStatus, 'Enviando inscripción de prueba…', 'info');
    try {
      const headers = {apikey: publishableKey, 'Content-Type': 'application/json'};
      let endpoint = registrationApi;
      const payload = {submission_id: registration.id, submission: registration.data, p_details: registration.details};
      {
        const loginUrl = new URL('/auth/v1/token?grant_type=password', registrationApi);
        const login = existingSession ? null : await fetch(loginUrl, {
          method: 'POST', headers,
          body: JSON.stringify({email: accountEmail.value.trim(), password: accountPassword.value}),
          signal: AbortSignal.timeout(15000),
        });
        if (login && !login.ok) throw Error('No se pudo iniciar sesión. Comprueba el correo y la contraseña.');
        headers.Authorization = 'Bearer ' + (existingSession ? existingSession.token : (await login.json()).access_token);
        endpoint = registrationApi.replace('bm_pinto_submit_registration_test', 'bm_pinto_submit_registration_test_details');
        payload.first_receipt = needsReceipt ? await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(Error('No se pudo leer el justificante.'));
          reader.readAsDataURL(file);
        }) : null;
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (response.status === 401) clubSession = null;
        const failure = await response.json().catch(() => ({}));
        if (failure.code === 'PGRST202') throw Error('Falta activar el envío de inscripciones en Supabase.');
        if (failure.message === 'Ficha de prueba incorrecta') throw Error('Revisa los datos de contacto, el domicilio y las autorizaciones.');
        if (failure.code === '22P02' || failure.message === 'Jugador de prueba incorrecto') {
          throw Error('No se pudieron validar los datos del pack. Comprueba las tallas y que se haya aplicado el SQL 49 actualizado.');
        }
        if (failure.message === 'Formato no admitido' || failure.message === 'Archivo demasiado grande') {
          throw Error('El justificante debe ser un PDF, JPG o PNG de hasta 5 MB.');
        }
        throw Error('No se pudo enviar la prueba. Puedes reintentar el mismo envío.');
      }
      const reference = await response.json();
      if (typeof reference !== 'string' || !reference.startsWith('INS-PRUEBA-')) throw Error('No se pudo comprobar la recepción.');
      if (reviewedRegistration?.id !== registration.id) return;
      setStatus(reviewStatus, 'Prueba recibida por el club. Referencia ' + reference + '.' +
        ' Ya está disponible en Mis inscripciones.' +
        (needsReceipt ? ' Justificante recibido para revisión.' : ''), 'success');
      firstReceipt.value = '';
      accountFields.hidden = true;
      openMyRegistrations.hidden = false;
      confirmRegistration.hidden = true;
      printRegistration.hidden = false;
      printRegistration.focus();
    } catch (error) {
      if (reviewedRegistration?.id === registration.id) setStatus(reviewStatus, error.message);
    } finally {
      registrationSending = false;
      confirmRegistration.disabled = false;
      accountFields.disabled = false;
      accountPassword.value = '';
    }
  };
  printRegistration.onclick = () => window.print();

  const authorizationDetails = document.querySelector('#authorizationDetails');
  const privacyDetails = document.querySelector('#privacyDetails');
  for (const button of document.querySelectorAll('[data-privacy]')) {
    button.addEventListener('click', () => privacyDetails.showModal());
  }
  const authorizationTexts = {
    nonFederatedProtocol: 'Borrador 2027/2028. Este apartado corresponde a Prebenjamín y Benjamín. Ante un accidente durante la actividad, avisa al entrenador. El club facilitará el procedimiento aplicable cuando esté confirmado.',

    outings: 'Al elegir Sí, autorizas al jugador o jugadora a participar en actividades de balonmano fuera del pabellón Sandra Aguilar y a acudir a otras instalaciones deportivas bajo la supervisión del entrenador o de la persona designada por el club.',
    transport: 'Al elegir Sí, autorizas los desplazamientos a partidos o entrenamientos en coche particular de un compañero o entrenador previo acuerdo entre las partes. También autorizas los desplazamientos a torneos del club en transporte contratado o en vehículos particulares de familias o entrenadores, con información previa del viaje.',
    images: 'Al elegir Sí, autorizas al Club Balonmano Pinto a publicar fotografías del jugador o jugadora tomadas durante las actividades del club en su web, boletines y memorias o publicaciones relacionadas con esas actividades.',
  };
  form.addEventListener('click', event => {
    const link = event.target.closest('[data-authorization]');
    if (!link) return;
    event.preventDefault();
    document.querySelector('#authorizationTitle').textContent = link.textContent;
    const content = document.querySelector('#authorizationText');
    if (link.dataset.authorization === 'federatedProtocol') {
      content.replaceChildren(document.querySelector('#federatedProtocol').content.cloneNode(true));
    } else {
      content.textContent = authorizationTexts[link.dataset.authorization];
    }
    authorizationDetails.showModal();
  });
  const euro = new Intl.NumberFormat('es-ES', {style:'currency',currency:'EUR'});
  const field = (player, name) => player.querySelector('[name="' + name + '"]');
  const sizes = ['2XS','XS','S','M','L','XL','2XL','3XL'];
  function renumber() {
    [...container.children].forEach((player, index) => {
      player.querySelector('legend').textContent = 'Jugador ' + (index + 1);
      player.querySelector('.remove').hidden = container.children.length === 1;
    });
  }
  function updatePlayer(player) {
    const category = categoryFor(field(player, 'birth').value);
    const showOtherTown = field(player, 'town').value === 'other';
    const otherTown = field(player, 'otherTown');
    otherTown.disabled = !showOtherTown;
    otherTown.required = showOtherTown;
    player.querySelector('.other-town').hidden = !showOtherTown;
    const birth = field(player, 'birth').value;
    const age = ageOnDate(birth);
    const minor = age !== null && age < 18;
    const noPlayerId = field(player, 'noPlayerId');
    noPlayerId.disabled = !minor;
    if (!minor) noPlayerId.checked = false;
    player.querySelector('.no-player-id').hidden = !minor;
    const federationIdRequired = age !== null && age >= 14;
    player.querySelector('.player-id-warning').hidden = !(category?.federated && federationIdRequired && noPlayerId.checked);
    const playerId = field(player, 'playerId');
    playerId.disabled = noPlayerId.checked;
    playerId.required = !noPlayerId.checked;
    const guardianId = field(player, 'guardianId');
    guardianId.disabled = !minor;
    guardianId.required = minor;
    player.querySelector('.guardian-id').hidden = !minor;
    const reportHealth = field(player, 'hasHealth').value === 'yes';
    const health = field(player, 'health');
    health.disabled = !reportHealth;
    health.required = reportHealth;
    if (!reportHealth) health.value = '';
    player.querySelector('.health-detail').hidden = !reportHealth;
    const seniorMale = category?.name === 'Sénior' && field(player, 'division').value === 'male';
    field(player, 'team').disabled = !seniorMale;
    player.querySelector('.senior').hidden = !seniorMale;
    player.querySelector('.category').textContent = category?.name || '';
    player.querySelector('.trouser-label').textContent = field(player, 'kitRole').value === 'goalkeeper'
      ? 'Talla de pantalón largo' : 'Talla de pantalón';
    const protocol = player.querySelector('.protocol');
    protocol.hidden = !category;
    if (category) {
      const link = protocol.querySelector('a');
      link.dataset.authorization = category.federated ? 'federatedProtocol' : 'nonFederatedProtocol';
      link.textContent = category.federated ? 'Protocolo de accidentes para federados' : 'Protocolo de accidentes para no federados';
    }
    const needsKit = field(player, 'hasKit').value === 'no';
    player.querySelector('.kit-fields').hidden = !needsKit;
    for (const name of ['kitRole', 'printName', 'fitted']) {
      field(player, name).disabled = !needsKit;
    }
    for (const name of ['shirt', 'shorts']) {
      field(player, name).disabled = !needsKit || field(player, 'fitted').checked;
    }
  }
  function addPlayer() {
    const player = document.querySelector('#player').content.firstElementChild.cloneNode(true);
    for (const [name, options] of [
      ['shirt', ['7/8 XS','5/6 XS','3/4 XS',...sizes,'4XL']],
      ['shorts', ['6/5 XS','4/3 XS',...sizes]],
    ]) field(player, name).replaceChildren(new Option('Selecciona', ''), ...options.map(size => new Option(size, size)));
    const today = new Date();
    const dateParts = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
    field(player, 'birth').max = dateParts.map(part => String(part).padStart(2, '0')).join('-');
    player.addEventListener('change', () => updatePlayer(player));
    player.querySelector('.remove').onclick = () => {
      player.remove();
      renumber();
      summary.hidden = true;
    };
    container.append(player);
    updatePlayer(player);
    renumber();
    return field(player, 'playerName');
  }
  addPlayer();
  document.querySelector('#fillTestRegistration').onclick = () => {
    const choose = options => options[Math.floor(Math.random() * options.length)];
    const code = () => String(100000 + Math.floor(Math.random() * 900000));
    form.elements.contact.value = 'Responsable de prueba ' + code();
    form.elements.phone.value = '000' + code();
    form.elements.member.checked = false;
    form.elements.payment.value = 'split';
    for (const player of container.children) {
      const suffix = code();
      const town = choose(['Pinto', 'Valdemoro', 'Leganés']);
      const values = {
        playerName: 'Jugador de prueba ' + suffix,
        birth: choose(['2011', '2013', '2015', '2017']) + '-' + choose(['02', '05', '09']) + '-15',
        division: choose(['female', 'male']),
        playerId: 'PRUEBA' + suffix,
        guardianId: 'TUTOR' + suffix,
        address: 'Domicilio ficticio ' + suffix,
        town,
        otherTown: '',
        registeredInPinto: town === 'Pinto' ? 'Sí' : 'No',
        hasKit: 'no',
        kitRole: choose(['court', 'goalkeeper']),
        printName: 'PRUEBA ' + suffix,
        shirt: choose(sizes),
        shorts: choose(sizes),
        hasHealth: 'no',
        outings: choose(['Sí', 'No']),
        transport: choose(['Sí', 'No']),
        images: 'No',
      };
      for (const [name, value] of Object.entries(values)) field(player, name).value = value;
      field(player, 'noPlayerId').checked = false;
      field(player, 'fitted').checked = false;
      updatePlayer(player);
    }
    summary.hidden = true;
    document.querySelector('#testRegistrationStatus').textContent =
      'Datos ficticios rellenados. Revisa el correo y pulsa Revisar inscripción.';
    form.elements.email.focus();
  };
  document.querySelector('#add').onclick = () => {summary.hidden = true; addPlayer().focus();};
  form.addEventListener('input', () => {summary.hidden = true;});
  form.onsubmit = event => {
    event.preventDefault();
    const players = [...container.children].map(player => ({
      name: field(player, 'playerName').value.trim(),
      birth: field(player, 'birth').value,
      category: categoryFor(field(player, 'birth').value),
      division: field(player, 'division').value,
      team: field(player, 'team').disabled ? 'standard' : field(player, 'team').value,
      hasKit: field(player, 'hasKit').value === 'yes',
      kit: field(player, 'hasKit').value === 'yes' ? 'Ya tiene el pack inicial' : field(player, 'fitted').checked ? 'Tallas tomadas en el club' :
        'Camiseta ' + field(player, 'shirt').value + ' · Pantalón ' + field(player, 'shorts').value,
      printName: field(player, 'printName').value.trim(),
      kitRole: field(player, 'kitRole').value,
      fitted: field(player, 'fitted').checked,
      shirt: field(player, 'shirt').value,
      shorts: field(player, 'shorts').value,
      town: field(player, 'town').value === 'other' ? field(player, 'otherTown').value.trim() : field(player, 'town').value,
      registeredInPinto: field(player, 'registeredInPinto').value,
      authorizations: [
        ['Actividades fuera del pabellón', field(player, 'outings').value],
        ['Transporte con el equipo', field(player, 'transport').value],
        ['Publicación de imágenes', field(player, 'images').value],
      ],
    }));
    const undecided = players.some(player => !player.team);
    const now = new Date();
    const day = madridDate(now);
    if (day > '2028-06-30') {
      summary.hidden = true;
      window.alert('La temporada 2027/2028 ya ha finalizado.');
      return;
    }
    const calculated = calculate(players, form.elements.member.checked, day);
    const payment = day >= '2027-12-01' ? 'single' : form.elements.payment.value;
    const singleDeadline = singlePaymentDeadline(now);
    const deadlines = [day >= season.singlePaymentCutoff ? 'el día de la inscripción' : season.dates[0], ...season.dates.slice(1)];
    const list = document.querySelector('#breakdown');
    list.replaceChildren(...players.map((player, index) => {
      const item = document.createElement('li');
      const line = player.team ? calculated.lines[index] : null;
      item.textContent = [player.name, player.category.name, player.kit, player.hasKit ? '' : 'Estampado ' + player.printName,
        !line ? 'Equipo pendiente de confirmar' : line.team === 'national' ? 'Primera Nacional · Exento' :
          euro.format(line.total) + (line.discount ? ' con ' + euro.format(line.discount) + ' de descuento' : '')].filter(Boolean).join(' · ');
      const kitContents = document.createElement('small');
      const garments = player.kitRole === 'goalkeeper'
        ? 'Primera y segunda camiseta de juego y pantalón largo'
        : 'Camiseta roja de primera equipación, camiseta de segunda equipación y pantalón corto de juego';
      kitContents.textContent = 'Pack inicial · ' + garments + ' · Incluye ropa de calentamiento';
      if (!player.hasKit) item.append(kitContents);
      const permissions = document.createElement('small');
      permissions.textContent = player.authorizations.map(([title, choice]) => title + ' ' + choice).join(' · ');
      item.append(permissions);
      const residence = document.createElement('small');
      residence.textContent = player.town + ' · Empadronado en Pinto ' + player.registeredInPinto;
      item.append(residence);
      if (line && line.total > 0) {
        const payments = payment === 'single'
          ? [{label: 'Pago único', amount: line.total, deadline: singleDeadline}]
          : scheduledPayments(line.payments, deadlines);
        const table = document.createElement('ul');
        for (const {label, amount, deadline} of payments.filter(entry => entry.amount > 0)) {
          const row = document.createElement('li');
          const concept = [label, player.name, player.category.name].join(' ').toLocaleUpperCase('es-ES');
          row.textContent = label + ' · ' + euro.format(amount) + ' ' + deadline;
          const reference = document.createElement('small');
          reference.textContent = 'Concepto de transferencia ' + concept;
          row.append(reference);
          if (navigator.clipboard?.writeText) {
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.className = 'copy-concept';
            copy.textContent = 'Copiar concepto';
            copy.addEventListener('click', async () => {
              try {
                await navigator.clipboard.writeText(concept);
                copy.textContent = 'Concepto copiado';
              } catch {
                copy.textContent = 'Selecciona el texto para copiarlo';
              }
            });
            row.append(copy);
          }
          table.append(row);
        }
        item.append(table);
      }
      return item;
    }));
    const total = Math.round(calculated.lines.reduce((sum, line) => sum + line.total * 100, 0)) / 100;
    const familyPayments = scheduledPayments(deadlines.map((date, index) =>
      calculated.lines.reduce((sum, line) => sum + line.payments[index], 0)), deadlines);
    document.querySelector('#total').textContent = undecided ? 'Total pendiente de confirmar el equipo' : 'TOTAL A PAGAR · ' + euro.format(total);
    document.querySelector('#schedule').textContent = undecided ? '' : payment === 'single'
      ? 'Pago único de ' + euro.format(total) + ' ' + singleDeadline + '.'
      : familyPayments.map(({deadline, label, amount}) => label + ' · ' + euro.format(amount) + ' ' + deadline).join(' | ');
    document.querySelector('#membership').textContent = !undecided && calculated.laterDiscount
      ? payment === 'split'
        ? 'Si os hacéis socios más adelante, el descuento de 10 € por menor elegible se aplicará al último pago pendiente. Si ya están confirmados todos los pagos, se aplicará a la cuota de socio, hasta 20 €.'
        : 'Si os hacéis socios después de confirmar el pago único, el descuento previsto en el alta es de ' + euro.format(calculated.laterDiscount) + '.'
      : '';
    setStatus(reviewStatus, undecided ? 'El equipo está pendiente de confirmar por el club.' : '', 'info');
    const testData = {
      registration_day: day,
      payment,
      member: form.elements.member.checked,
      total,
      players: calculated.lines.map(line => ({
        name: line.name.slice(0, 120),
        category: line.category.name, team: line.team, division: line.division, hasKit: line.hasKit,
        ...(!line.hasKit && { equipment: {
          role: line.kitRole, printName: line.printName, fitted: line.fitted,
          shirt: line.fitted ? '' : line.shirt, trousers: line.fitted ? '' : line.shorts,
        } }),
        payments: line.payments,
      })),
    };
    const details = {
      contact: {
        name: form.elements.contact.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(),
      },
      players: [...container.children].map((player, index) => ({
        birth: field(player, 'birth').value,
        playerId: field(player, 'playerId').disabled ? '' : field(player, 'playerId').value.trim(),
        guardianId: field(player, 'guardianId').disabled ? '' : field(player, 'guardianId').value.trim(),
        address: field(player, 'address').value.trim(),
        town: players[index].town,
        registeredInPinto: players[index].registeredInPinto,
        health: field(player, 'health').disabled ? '' : field(player, 'health').value.trim(),
        authorizations: Object.fromEntries(['outings', 'transport', 'images'].map(name => [name, field(player, name).value])),
      })),
    };
    const payload = JSON.stringify([testData, details]);
    if (payload !== reviewedPayload) {
      reviewedPayload = payload;
      registrationKey = crypto.randomUUID();
    }
    reviewedRegistration = undecided ? null : {id: registrationKey, data: testData, details};
    firstReceipt.value = '';
    updateFirstReceipt();
    confirmRegistration.hidden = undecided;
    accountFields.hidden = undecided;
    openMyRegistrations.hidden = true;
    printRegistration.hidden = true;
    summary.hidden = false;
    summary.focus();
  };
}



