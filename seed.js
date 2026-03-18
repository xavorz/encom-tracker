// seed.js — Populates demo data for Encom Tracker
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function writeDB(col, data) {
  fs.writeFileSync(path.join(DATA_DIR, `${col}.json`), JSON.stringify(data, null, 2));
}
function genId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}
function getWeekStart(weeksAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - weeksAgo * 7);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

async function seed() {
  const hash = hashPassword('encom2024');

  // ── Users ────────────────────────────────────────────────────
  const users = [
    { id: 'admin1', email: 'javier@encom.es',  name: 'Javier Ruiz',      password_hash: hash, role: 'admin',    created_at: new Date().toISOString() },
    { id: 'emp1',   email: 'maria@encom.es',   name: 'María García',     password_hash: hash, role: 'employee', created_at: new Date().toISOString() },
    { id: 'emp2',   email: 'carlos@encom.es',  name: 'Carlos López',     password_hash: hash, role: 'employee', created_at: new Date().toISOString() },
    { id: 'emp3',   email: 'ana@encom.es',     name: 'Ana Martínez',     password_hash: hash, role: 'employee', created_at: new Date().toISOString() },
    { id: 'emp4',   email: 'david@encom.es',   name: 'David Sánchez',    password_hash: hash, role: 'employee', created_at: new Date().toISOString() },
    { id: 'emp5',   email: 'laura@encom.es',   name: 'Laura Fernández',  password_hash: hash, role: 'employee', created_at: new Date().toISOString() },
    { id: 'emp6',   email: 'pablo@encom.es',   name: 'Pablo Rodríguez',  password_hash: hash, role: 'employee', created_at: new Date().toISOString() },
  ];
  writeDB('users', users);

  // ── Patterns (4 weeks of data, index 0 = most recent) ────────
  // Each employee has a defined performance profile:
  //   perf:       self-performance 1-5 (Friday)
  //   completion: % tasks completed
  //   mood:       mood 1-5 (Friday)
  //   blockers:   blocker text or ''
  const profiles = {
    emp1: {  // 🟢 Top performer — consistently high (index 0=oldest, 3=most recent)
      name: 'María',
      perf:       [4, 5, 4, 5],
      completion: [85, 92, 88, 95],
      mood:       [5, 5, 4, 5],
      blockers:   ['', '', '', ''],
      tasks: [
        'Coordinación proveedores OWN Valencia\nSeguimiento contratos patrocinio\nReunión con agencia de comunicación',
        'Revisión plan de comunicación Q2\nCierre acuerdo con proveedor técnico\nPreparar presentación para inversores',
        'Gestión RRSS festival\nBriefing equipo creativo\nRevisión materiales diseño',
        'Coordinación logística escenarios\nRevisión presupuesto eventos\nContacto con artistas confirmados',
      ],
      achievements: [
        'Cerré el acuerdo con el proveedor técnico principal para OWN Valencia.',
        'Presenté el plan de comunicación al equipo directivo. Muy buena acogida.',
        'Completé el briefing creativo a tiempo y el equipo está alineado.',
        'Coordiné todos los proveedores de escenarios sin ningún incidente.',
      ],
    },
    emp2: { // 🔴 Declining — was good, now struggling (index 0=oldest, 3=most recent)
      name: 'Carlos',
      perf:       [5, 4, 3, 2],
      completion: [90, 72, 45, 28],
      mood:       [4, 3, 2, 2],
      blockers:   [
        '',
        'Hay falta de claridad sobre los objetivos de venta del trimestre.',
        'Sigo sin respuesta del cliente. Además, no tenemos estrategia comercial definida para Q2.',
        'El cliente principal de patrocinios no responde desde hace 3 semanas. No sé cómo avanzar.',
      ],
      tasks: [
        'Seguimiento leads comerciales\nActualización CRM\nPreparar propuestas nuevos patrocinadores',
        'Llamadas a clientes potenciales\nReunión con equipo de ventas\nRevisión pipeline',
        'Cierre de propuestas pendientes\nActualización base de datos clientes\nReporte mensual',
        'Prospección nuevos clientes\nPreparación deck comercial\nRevisión estrategia Q1',
      ],
      achievements: [
        'Solo pude avanzar en la actualización del CRM. El resto bloqueado.',
        'Hice las llamadas pendientes pero sin resultados concretos.',
        'Cerré 2 propuestas menores. Aún pendiente el cliente grande.',
        'Excelente semana, cerré 3 contratos nuevos.',
      ],
    },
    emp3: { // 🟡 Active blockers — external dependencies
      name: 'Ana',
      perf:       [3, 3, 4, 4],
      completion: [60, 55, 70, 75],
      mood:       [3, 2, 3, 4],
      blockers:   [
        'La agencia creativa no entrega los materiales en los plazos acordados. Llevo 2 semanas esperando.',
        'Sigo sin los materiales de la agencia. Esto está bloqueando todo el diseño de la campaña.',
        'Presupuesto de diseño pendiente de aprobación.',
        'Dependencia del proveedor de impresión para avanzar.',
      ],
      tasks: [
        'Supervisión materiales diseño OWN\nCoordinación con agencia creativa\nRevisión propuestas gráficas',
        'Revisión identidad visual festival\nPreparación moodboard nueva campaña\nReunión dirección arte',
        'Diseño materiales digitales\nCoordinación producción fotográfica\nRevisión assets redes sociales',
        'Briefing campaña primavera\nRevisión propuestas creativas\nCoordinación con imprenta',
      ],
      achievements: [
        'Completé la revisión interna de propuestas a pesar del retraso de la agencia.',
        'Avancé en el moodboard de la nueva campaña por mi cuenta.',
        'Terminé todos los assets digitales para RRSS.',
        'Presenté el briefing de campaña y fue aprobado.',
      ],
    },
    emp4: { // 🟡 Inconsistent — good and bad weeks alternate
      name: 'David',
      perf:       [4, 2, 5, 3],
      completion: [78, 35, 90, 50],
      mood:       [4, 2, 5, 3],
      blockers:   [
        '',
        'Tuve problemas con el proveedor técnico de sonido en el montaje del martes.',
        '',
        'Coordinación complicada con 3 proveedores a la vez sin herramienta común.',
      ],
      tasks: [
        'Gestión logística eventos\nCoordinación proveedores técnicos\nSupervisión montaje',
        'Montaje escenario principal\nRevisión equipos técnicos\nCoordinación personal técnico',
        'Coordinación completa logística OWN\nRevisión contratos alquiler\nVisita técnica recinto',
        'Supervisión desmontaje evento anterior\nPlanificación próximo evento\nInventario material',
      ],
      achievements: [
        'El montaje del evento del jueves salió perfecto.',
        'Solo pude resolver el problema de sonido. El resto quedó pendiente.',
        'Coordiné toda la logística de OWN Valencia sin ningún incidente. Muy satisfecho.',
        'Completé el inventario de material aunque con retrasos.',
      ],
    },
    emp5: { // 🔴 Low performer — consistently below expectations
      name: 'Laura',
      perf:       [2, 2, 3, 2],
      completion: [35, 30, 42, 38],
      mood:       [2, 2, 3, 2],
      blockers:   [
        'Pendiente de acceso al sistema de contabilidad actualizado desde hace 1 mes.',
        'Aún sin acceso al sistema. Tampoco tengo claros los procesos de facturación nueva.',
        'El sistema de facturación sigue sin funcionar correctamente.',
        'No tengo acceso a los informes de tesorería del trimestre anterior.',
      ],
      tasks: [
        'Facturación proveedores\nGestión pagos pendientes\nArchivo documentación',
        'Conciliación bancaria\nFacturación clientes\nGestión contratos',
        'Revisión pagos atrasados\nActualización libro contable\nInformes mensuales',
        'Cierre facturas trimestre\nRevisión deudas pendientes\nArchivo digital contratos',
      ],
      achievements: [
        'Archivé la documentación pendiente de los últimos 2 meses.',
        'Hice lo que pude con los accesos limitados.',
        'Conseguí completar los informes mensuales básicos.',
        'Organicé el archivo físico de contratos.',
      ],
    },
    emp6: { // 🟢 Improving — clear upward trend (index 0=oldest, 3=most recent)
      name: 'Pablo',
      perf:       [2, 3, 4, 5],
      completion: [35, 50, 68, 85],
      mood:       [2, 3, 4, 5],
      blockers:   [
        'Falta de datos históricos para hacer comparativas correctas.',
        'No tengo claro cómo interpretar algunos KPIs del festival.',
        '',
        '',
      ],
      tasks: [
        'Análisis audiencia OWN Valencia\nInforme KPIs festival\nPreparación presentación clientes',
        'Dashboard métricas redes sociales\nAnálisis conversión campañas\nInforme semanal',
        'Análisis datos ticketing\nComparativa ediciones anteriores\nDraft informe ejecutivo',
        'Recopilación datos audiencia\nPrimeros análisis básicos\nRevisión métricas disponibles',
      ],
      achievements: [
        'Presenté el informe de KPIs del festival. Los resultados sorprendieron positivamente.',
        'Entregué el dashboard de métricas y ya lo está usando el equipo.',
        'Hice el análisis de ticketing con los datos disponibles.',
        'Aprendí a usar las herramientas de análisis básico.',
      ],
    },
  };

  const plans   = [];
  const reviews = [];

  // Generate 4 weeks of historical data (weeks 4, 3, 2, 1 ago)
  Object.entries(profiles).forEach(([empId, profile]) => {
    for (let weeksAgo = 4; weeksAgo >= 1; weeksAgo--) {
      const weekIndex = 4 - weeksAgo; // 0=oldest, 3=most recent
      const weekStart = getWeekStart(weeksAgo);

      plans.push({
        id: genId(), user_id: empId, week_start: weekStart,
        tasks: profile.tasks[weekIndex],
        clarity_level: profile.perf[weekIndex] > 3 ? 4 : 2,
        known_blockers: profile.blockers[weekIndex],
        task_importance: empId === 'emp1' || empId === 'emp6' ? 4 : 3,
        needs_from_encom: '',
        created_at: new Date(weekStart + 'T09:15:00').toISOString()
      });

      reviews.push({
        id: genId(), user_id: empId, week_start: weekStart,
        tasks_completed_pct: profile.completion[weekIndex],
        performance_score: profile.perf[weekIndex],
        blockers: profile.blockers[weekIndex],
        uncertainties: empId === 'emp2' && weekIndex < 2 ? 'No sé si vamos a cerrar el contrato de patrocinio antes del deadline.' : '',
        achievements: profile.achievements[weekIndex],
        mood_next_week: profile.mood[weekIndex],
        created_at: new Date(weekStart + 'T17:30:00').toISOString()
      });
    }
  });

  // ── Also seed current week for 3 employees (to show live dashboard) ───
  const thisWeek = getWeekStart(0);

  // María: submitted Monday plan this week
  plans.push({
    id: genId(), user_id: 'emp1', week_start: thisWeek,
    tasks: 'Cierre de acuerdo con proveedor audiovisual para OWN Valencia\nPreparar presentación de resultados para dirección\nCoordinación con el equipo de producción del escenario principal',
    clarity_level: 5, known_blockers: '', task_importance: 5, needs_from_encom: '',
    created_at: new Date(thisWeek + 'T09:10:00').toISOString()
  });

  // Carlos: submitted Monday plan — with a blocker (declining employee)
  plans.push({
    id: genId(), user_id: 'emp2', week_start: thisWeek,
    tasks: 'Seguimiento urgente al cliente de patrocinios\nRevisión pipeline comercial\nLlamadas a nuevos prospects',
    clarity_level: 2, known_blockers: 'El cliente principal sigue sin responder. No sé si el contrato va a cerrarse o no. Llevo un mes sin avance.', task_importance: 4, needs_from_encom: 'Necesito que alguien de dirección intente contactar directamente con el cliente.',
    created_at: new Date(thisWeek + 'T10:30:00').toISOString()
  });

  // Laura: submitted Monday plan — low clarity (struggling employee)
  plans.push({
    id: genId(), user_id: 'emp5', week_start: thisWeek,
    tasks: 'Facturación pendiente del mes\nGestión pagos atrasados\nArchivo digital',
    clarity_level: 2, known_blockers: 'Sigo sin acceso al sistema de contabilidad actualizado. No puedo hacer mi trabajo correctamente.', task_importance: 2, needs_from_encom: 'Necesito acceso al sistema urgentemente. Llevo semanas esperando.',
    created_at: new Date(thisWeek + 'T11:45:00').toISOString()
  });

  writeDB('monday_plans', plans);
  writeDB('friday_reviews', reviews);

  console.log('\n✅ Base de datos inicializada con datos de ejemplo.\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ACCESO ADMIN:');
  console.log('  Email:      javier@encom.es');
  console.log('  Contraseña: encom2024');
  console.log('');
  console.log('  EMPLEADOS (todos con contraseña: encom2024):');
  console.log('  maria@encom.es    → María García     (🟢 Top performer)');
  console.log('  carlos@encom.es   → Carlos López     (🔴 Bajada brusca)');
  console.log('  ana@encom.es      → Ana Martínez     (🟡 Bloqueos externos)');
  console.log('  david@encom.es    → David Sánchez    (🟡 Inconsistente)');
  console.log('  laura@encom.es    → Laura Fernández  (🔴 Bajo rendimiento)');
  console.log('  pablo@encom.es    → Pablo Rodríguez  (🟢 Mejora continua)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

seed().catch(console.error);
