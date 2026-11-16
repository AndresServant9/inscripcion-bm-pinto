const season = {
  year: 2027,
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
function calculate(players, member) {
  const eligible = players.filter(player => player.team !== 'national');
  const siblings = players.length > 1;
  const lines = players.map(player => {
    const exempt = player.team === 'national';
    const discount = exempt ? 0 : (siblings ? 10 : 0) + (member ? 10 : 0);
    const payments = exempt ? [0,0,0] : [...player.category.installments];
    payments[2] -= discount;
    return {...player, discount, payments, total: payments.reduce((sum, value) => sum + value, 0)};
  });
  return {lines, laterDiscount: member ? 0 : Math.min(20, eligible.length * 10)};
}
if (typeof module !== 'undefined') module.exports = {categoryFor, calculate};
if (typeof document !== 'undefined') {
  const form = document.querySelector('#registration');
  const container = document.querySelector('#players');
  const summary = document.querySelector('#summary');
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
    const protocol = player.querySelector('.protocol');
    protocol.hidden = !category;
    if (category) {
      const link = protocol.querySelector('a');
      link.dataset.authorization = category.federated ? 'federatedProtocol' : 'nonFederatedProtocol';
      link.textContent = category.federated ? 'Protocolo de accidentes para federados' : 'Protocolo de accidentes para no federados';
    }
    for (const name of ['shirt','shorts']) {
      field(player, name).disabled = field(player, 'fitted').checked;
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
    renumber();
    return field(player, 'playerName');
  }
  addPlayer();
  document.querySelector('#add').onclick = () => {summary.hidden = true; addPlayer().focus();};
  form.addEventListener('input', () => {summary.hidden = true;});
  form.onsubmit = event => {
    event.preventDefault();
    const players = [...container.children].map(player => ({
      name: field(player, 'playerName').value.trim(),
      category: categoryFor(field(player, 'birth').value),
      team: field(player, 'team').disabled ? 'standard' : field(player, 'team').value,
      kit: field(player, 'fitted').checked ? 'Tallas tomadas en el club' :
        'Camiseta ' + field(player, 'shirt').value + ' · Pantalón ' + field(player, 'shorts').value,
      printName: field(player, 'printName').value.trim(),
      town: field(player, 'town').value === 'other' ? field(player, 'otherTown').value.trim() : field(player, 'town').value,
      registeredInPinto: field(player, 'registeredInPinto').value,
      authorizations: [
        ['Actividades fuera del pabellón', field(player, 'outings').value],
        ['Transporte con el equipo', field(player, 'transport').value],
        ['Publicación de imágenes', field(player, 'images').value],
      ],
    }));
    const undecided = players.some(player => !player.team);
    const calculated = calculate(players, form.elements.member.checked);
    const payment = form.elements.payment.value;
    const list = document.querySelector('#breakdown');
    list.replaceChildren(...players.map((player, index) => {
      const item = document.createElement('li');
      const line = player.team ? calculated.lines[index] : null;
      item.textContent = [player.name, player.category.name, player.kit, 'Estampado ' + player.printName,
        !line ? 'Equipo pendiente de confirmar' : line.team === 'national' ? 'Primera Nacional · Exento' :
          euro.format(line.total) + (line.discount ? ' con ' + euro.format(line.discount) + ' de descuento' : '')].join(' · ');
      const permissions = document.createElement('small');
      permissions.textContent = player.authorizations.map(([title, choice]) => title + ' ' + choice).join(' · ');
      item.append(permissions);
      const residence = document.createElement('small');
      residence.textContent = player.town + ' · Empadronado en Pinto ' + player.registeredInPinto;
      item.append(residence);
      if (line && line.total > 0) {
        const payments = payment === 'single'
          ? [{label: 'Pago único', amount: line.total, deadline: season.dates[0]}]
          : line.payments.map((amount, index) => ({
              label: 'Pago ' + (index + 1), amount, deadline: season.dates[index],
            }));
        const table = document.createElement('ul');
        for (const {label, amount, deadline} of payments) {
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
    const total = calculated.lines.reduce((sum, line) => sum + line.total, 0);
    document.querySelector('#total').textContent = undecided ? 'Total pendiente de confirmar el equipo' : 'Total familiar ' + euro.format(total);
    document.querySelector('#schedule').textContent = undecided ? '' : payment === 'single'
      ? 'Pago único de ' + euro.format(total) + ' ' + season.dates[0] + '.'
      : season.dates.map((date,index) => 'Pago ' + (index+1) + ' · ' +
        euro.format(calculated.lines.reduce((sum,line) => sum + line.payments[index],0)) + ' ' + date).join(' | ');
    document.querySelector('#membership').textContent = !undecided && calculated.laterDiscount
      ? 'Si os hacéis socios después de inscribiros, el descuento orientativo en el alta será de ' + euro.format(calculated.laterDiscount) + '.' : '';
    summary.hidden = false;
    summary.focus();
  };
}

