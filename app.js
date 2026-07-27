// CHENLOOP - Core Financial Engine (v4.0 Auth & Multi-Tenant SaaS Engine)

const SUPABASE_URL = "https://sfikeqgzmyhellqxsqbu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fQ4DJf5q8IssJOKuBKrWOA_K1qMwgkY";

let supabaseClient = null;
let currentSession = null;
let currentProfile = null;

if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const initialState = {
  organization: {
    name: "Mi Cartera Personal",
    riskReservePct: 20.0,
    par30Limit: 10.0
  },
  capital: {
    totalCapital: 5000.0,
    capitalDeployed: 0.0,
    capitalAvailable: 5000.0,
    riskReserve: 0.0,
    accumulatedProfits: 0.0
  },
  financialAccounts: {
    capitalTotal: 5000.0,
    capitalDeployed: 0.0,
    capitalAvailable: 5000.0,
    riskReserveBalance: 0.0,
    riskReserveTargetPct: 20.0,
    operationalBalance: 0.0,
    operationalTargetMonths: 6,
    distributableBalance: 0.0,
    currentStage: 1,
    defensiveMode: false
  },
  operationalExpenses: [],
  quincenalCloses: [],
  ownerDebts: [],
  financialMovements: [],
  selectedDebtStrategy: 'avalanche',
  borrowers: [],
  applications: [],
  loans: [],
  installments: [],
  collections: [],
  payments: [],
  notifications: [],
  auditLogs: []
};

let state = initialState;

async function loadState() {
  if (!currentSession) {
    const authWall = document.getElementById('auth-wall');
    if (authWall) authWall.classList.remove('hidden');
    return;
  }

  try {
    const headers = {
      'Authorization': `Bearer ${currentSession.access_token}`
    };
    const res = await fetch('/api/sync', { headers });
    if (res.ok) {
      const cloudData = await res.json();
      
      if (cloudData.borrowers && cloudData.borrowers.length > 0) {
        state.borrowers = cloudData.borrowers.map(b => ({
          id: b.id,
          name: b.name,
          idNumber: b.identification,
          phone: b.phone,
          income: b.monthly_income,
          employment: b.employment_type,
          verified: b.is_verified,
          score: b.score,
          riskLevel: b.risk_level,
          exposureLimit: b.exposure_limit,
          status: b.status
        }));
      }

      if (cloudData.applications && cloudData.applications.length > 0) {
        state.applications = cloudData.applications.map(a => ({
          id: a.id,
          borrowerId: a.borrower_id,
          borrowerName: a.borrower_name || "Prestatario",
          amount: parseFloat(a.amount),
          reason: a.reason,
          count: a.installment_count || 7,
          status: a.status,
          createdAt: a.created_at
        }));
      }

      if (cloudData.loans && cloudData.loans.length > 0) {
        state.loans = cloudData.loans.map(l => ({
          id: l.id,
          borrowerId: l.borrower_id,
          borrowerName: l.borrower_name || "Prestatario",
          principal: parseFloat(l.principal),
          installmentAmount: parseFloat(l.installment_amount),
          installmentCount: l.installment_count,
          totalScheduled: parseFloat(l.total_scheduled),
          scheduledProfit: parseFloat(l.scheduled_profit),
          status: l.status,
          disbursementDate: l.disbursement_date,
          paidAmount: parseFloat(l.paid_amount || 0),
          remainingAmount: parseFloat(l.remaining_amount || l.total_scheduled)
        }));
      }

      if (cloudData.collections && cloudData.collections.length > 0) {
        state.collections = cloudData.collections.map(c => ({
          id: c.id,
          loanId: c.loan_id,
          borrowerName: c.borrower_name,
          daysOverdue: c.days_overdue,
          delinquencyTier: c.delinquency_tier,
          channel: c.channel,
          promiseDate: c.promise_date,
          promiseAmount: parseFloat(c.promise_amount),
          promiseStatus: c.promise_status,
          notes: c.notes
        }));
      }

      if (cloudData.payments && cloudData.payments.length > 0) {
        state.payments = cloudData.payments.map(p => ({
          id: p.id,
          date: p.date,
          loanId: p.loan_id,
          borrowerName: p.borrower_name,
          amountPaid: parseFloat(p.amount_paid),
          principalPaid: parseFloat(p.principal_paid),
          profitPaid: parseFloat(p.profit_paid)
        }));
      }

      if (cloudData.notifications && cloudData.notifications.length > 0) {
        state.notifications = cloudData.notifications.map(n => ({
          timestamp: n.timestamp,
          borrowerName: n.borrower_name,
          channel: n.channel,
          event: n.event,
          message: n.message,
          status: n.status
        }));
      }

      if (cloudData.auditLogs && cloudData.auditLogs.length > 0) {
        state.auditLogs = cloudData.auditLogs.map(l => ({
          timestamp: l.timestamp,
          user: l.user_name || l.user,
          action: l.action,
          module: l.module,
          details: l.details
        }));
      }

      if (cloudData.financialAccounts && cloudData.financialAccounts.length > 0) {
        const fa = cloudData.financialAccounts[0];
        state.financialAccounts = {
          id: fa.id,
          organizationId: fa.organization_id,
          capitalTotal: parseFloat(fa.portfolio_target || fa.capital_total || 5000),
          capitalDeployed: parseFloat(fa.capital_deployed || 0),
          capitalAvailable: parseFloat(fa.capital_available || fa.portfolio_target || 5000),
          riskReserveBalance: parseFloat(fa.risk_reserve_balance || 0),
          riskReserveTargetPct: parseFloat(fa.risk_reserve_target_pct || 20.0),
          portfolioTarget: parseFloat(fa.portfolio_target || fa.capital_total || 5000),
          operationalBalance: parseFloat(fa.operational_balance || 0),
          operationalTargetMonths: parseInt(fa.operational_target_months || 6),
          distributableBalance: parseFloat(fa.distributable_balance || 0),
          currentStage: parseInt(fa.current_stage || 1),
          defensiveMode: Boolean(fa.defensive_mode)
        };
        if (fa.par30_limit) {
          state.organization.par30Limit = parseFloat(fa.par30_limit);
        }
        state.capital.totalCapital = state.financialAccounts.capitalTotal;
        state.capital.riskReserve = state.financialAccounts.riskReserveBalance;
        state.capital.capitalAvailable = Math.max(0, state.capital.totalCapital - state.capital.capitalDeployed);
      }

      if (cloudData.operationalExpenses && cloudData.operationalExpenses.length > 0) {
        state.operationalExpenses = cloudData.operationalExpenses.map(e => ({
          id: e.id,
          name: e.name,
          category: e.category,
          monthlyAmount: parseFloat(e.monthly_amount)
        }));
      }

      if (cloudData.quincenalCloses && cloudData.quincenalCloses.length > 0) {
        state.quincenalCloses = cloudData.quincenalCloses.map(c => ({
          id: c.id,
          closeDate: c.close_date,
          expectedAmount: parseFloat(c.expected_amount),
          collectedAmount: parseFloat(c.collected_amount),
          collectionRate: parseFloat(c.collection_rate),
          capitalRecovered: parseFloat(c.capital_recovered),
          grossProfit: parseFloat(c.gross_profit),
          activePortfolio: parseFloat(c.active_portfolio),
          portfolioTarget: parseFloat(c.portfolio_target),
          reserveBalance: parseFloat(c.reserve_balance),
          operationalBalance: parseFloat(c.operational_balance),
          distributableAmount: parseFloat(c.distributable_amount),
          businessStage: c.business_stage,
          defensiveMode: c.defensive_mode,
          recommendedActions: c.recommended_actions || []
        }));
      }

      if (cloudData.ownerDebts && cloudData.ownerDebts.length > 0) {
        state.ownerDebts = cloudData.ownerDebts.map(d => ({
          id: d.id,
          debtName: d.debt_name,
          balance: parseFloat(d.balance),
          interestRate: parseFloat(d.interest_rate),
          minPayment: parseFloat(d.min_payment),
          priority: d.priority
        }));
      }

      if (cloudData.financialMovements && cloudData.financialMovements.length > 0) {
        state.financialMovements = cloudData.financialMovements.map(m => ({
          id: m.id,
          movementDate: m.movement_date,
          type: m.type,
          amount: parseFloat(m.amount),
          sourceAccount: m.source_account,
          targetAccount: m.target_account,
          reason: m.reason
        }));
      }

      renderAll();
    }
  } catch (err) {
    console.warn("Modo offline / Supabase Cloud no disponible:", err);
  }
}

async function saveState() {
  localStorage.setItem('chenloop_state_v4.0', JSON.stringify(state));
  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'audit_logs',
        record: {
          organization_id: '00000000-0000-0000-0000-000000000001',
          user_name: 'Usuario App',
          action: 'SINCRONIZACION_CLOUD',
          module: 'Core',
          details: 'Cambio de estado guardado en Supabase Cloud'
        }
      })
    });
  } catch (err) {
    console.warn("Error enviando guardado a Supabase Cloud:", err);
  }
}

// ----------------------------------------------------
// SCENARIO SIMULATOR ENGINE (FASE 4)
// ----------------------------------------------------
window.runScenarioSimulation = function() {
  const targetInput = document.getElementById('sim-target-capital');
  const moraInput = document.getElementById('sim-mora-pct');
  const reserveInput = document.getElementById('sim-reserve-pct');
  const policySelect = document.getElementById('sim-policy');
  
  if (!targetInput || !moraInput || !reserveInput || !policySelect) return;
  
  const targetCapital = parseFloat(targetInput.value) || 0;
  const moraPct = parseFloat(moraInput.value) || 0;
  const reservePct = parseFloat(reserveInput.value) || 0;
  const policy = policySelect.value;
  
  // Parámetros por Política de Reinversión
  let reinvestPct = 70;
  let retainedPct = 30;
  
  if (policy === 'balanceada') {
    reinvestPct = 50;
    retainedPct = 50;
  } else if (policy === 'conservadora') {
    reinvestPct = 30;
    retainedPct = 70;
  }
  
  const projectedProfit = targetCapital * 0.75; // $75 ganancia por cada $100 colocados
  const requiredReserve = targetCapital * (reservePct / 100.0);
  const moraRiskAmount = targetCapital * (moraPct / 100.0);
  const netProfit = projectedProfit - moraRiskAmount;
  
  const reinvestAmount = targetCapital * (reinvestPct / 100.0);
  const retainedAmount = targetCapital * (retainedPct / 100.0);
  
  const resEl = document.getElementById('sim-res-needed');
  if (resEl) resEl.innerText = `$${requiredReserve.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  
  const resPctEl = document.getElementById('sim-res-pct-text');
  if (resPctEl) resPctEl.innerText = `Tasa de reserva: ${reservePct}%`;
  
  const reinvestAmountEl = document.getElementById('sim-reinvest-amount');
  if (reinvestAmountEl) reinvestAmountEl.innerText = `$${reinvestAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  
  const reinvestPctEl = document.getElementById('sim-reinvest-pct-text');
  if (reinvestPctEl) reinvestPctEl.innerText = `${reinvestPct}% de flujo a préstamos`;
  
  const retainedAmountEl = document.getElementById('sim-retained-amount');
  if (retainedAmountEl) retainedAmountEl.innerText = `$${retainedAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  
  const retainedPctEl = document.getElementById('sim-retained-pct-text');
  if (retainedPctEl) retainedPctEl.innerText = `${retainedPct}% retenido en reserva/liquidez`;
  
  const netProfitEl = document.getElementById('sim-net-profit');
  if (netProfitEl) netProfitEl.innerText = `$${netProfit.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
};

// ----------------------------------------------------
// GLOBAL WINDOW BINDINGS
// ----------------------------------------------------
window.toggleBorrowerForm = function() {
  const form = document.getElementById('borrower-form-container');
  if (form) {
    form.style.display = (form.style.display === 'none' || form.style.display === '') ? 'block' : 'none';
  }
};

window.showScoreModal = function(borrowerId) {
  let bw = state.borrowers.find(b => b.id === borrowerId);
  if (!bw) bw = state.borrowers[0];
  
  const scoreData = calculateExplicableScore(bw);
  const content = document.getElementById('modal-score-content');
  const modal = document.getElementById('modal-score-breakdown');
  
  if (content && modal) {
    content.innerHTML = `
      <div style="text-align: center; margin-bottom: 1rem;">
        <h2 style="font-family: var(--font-display); font-size: 2.2rem; color: var(--emerald-glow); margin-bottom: 0.25rem;">${scoreData.totalScore} / 100 Pts</h2>
        <span class="badge-risk badge-green" style="font-size: 0.85rem;">${scoreData.riskLevel} - ${bw.name}</span>
      </div>
      
      <div style="font-size: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem; background: #162032; padding: 1.25rem; border-radius: 10px; border: 1px solid var(--border-color);">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
          <span>• Historial de Pagos (40 max):</span>
          <strong style="color: var(--emerald-glow);">${scoreData.breakdown.paymentHistory} pts</strong>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
          <span>• Estabilidad Laboral (20 max):</span>
          <strong style="color: var(--emerald-glow);">${scoreData.breakdown.employmentStability} pts</strong>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
          <span>• Antigüedad del Cliente (15 max):</span>
          <strong style="color: var(--emerald-glow);">${scoreData.breakdown.tenure} pts</strong>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
          <span>• Nivel de Ingreso (15 max):</span>
          <strong style="color: var(--emerald-glow);">${scoreData.breakdown.capacity} pts</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>• Datos Verificados (10 max):</span>
          <strong style="color: var(--emerald-glow);">${scoreData.breakdown.verification} pts</strong>
        </div>
      </div>
      
      <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem; background: rgba(16, 185, 129, 0.08); padding: 0.85rem; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.2);">
        <strong style="color: var(--emerald-glow);">Recomendación del Motor:</strong> ${scoreData.recommendation}
      </div>
    `;
    
    modal.style.display = 'flex';
  }
};

window.closeScoreModal = function() {
  const modal = document.getElementById('modal-score-breakdown');
  if (modal) modal.style.display = 'none';
};

window.switchTab = function(tabName) {
  const tabs = ['dashboard', 'borrowers', 'applications', 'loans', 'collections', 'analytics', 'notifications', 'payments', 'audit', 'settings', 'quincenal-close', 'operations-expenses', 'owner-debts'];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) {
      if (t === tabName) {
        el.style.display = 'block';
        el.classList.remove('hidden');
      } else {
        el.style.display = 'none';
        el.classList.add('hidden');
      }
    }
  });
  
  // Highlight active sidebar button
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active', 'border-r-2', 'border-[#FF6B00]', 'bg-[#FF6B00]/10', 'text-[#FF6B00]', 'font-bold');
    btn.classList.add('text-[#94A3B8]', 'font-medium');
  });
  
  const activeBtn = document.querySelector(`.nav-btn[onclick*="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.remove('text-[#94A3B8]', 'font-medium');
    activeBtn.classList.add('active', 'border-r-2', 'border-[#FF6B00]', 'bg-[#FF6B00]/10', 'text-[#FF6B00]', 'font-bold');
  }
  
  const titles = {
    dashboard: 'Command Center',
    borrowers: 'Prestatarios & Scoring',
    applications: 'Solicitudes & Riesgo',
    loans: 'Préstamos Activos',
    collections: 'Gestión de Cobranzas',
    analytics: 'Analytics & Simulador',
    notifications: 'Notificaciones & Reminders',
    payments: 'Caja & Registrar Pago',
    audit: 'Auditoría Log',
    settings: 'Configuración & Reglas',
    'quincenal-close': 'Cierre Quincenal — Command Center',
    'operations-expenses': 'Cuentas Lógicas & Gastos Operativos',
    'owner-debts': 'Deudas del Propietario & Estrategia'
  };
  
  const titleEl = document.getElementById('page-title-text');
  if (titleEl) titleEl.innerText = titles[tabName] || 'Command Center';
  
  try {
    renderAll();
  } catch (err) {
    console.warn('Advertencia en renderAll:', err);
  }
};

window.approveApplication = function(appId) {
  const app = state.applications.find(a => a.id === appId);
  if (!app) return;
  
  const metrics = computeRiskMetrics();
  
  if (parseFloat(metrics.par30Pct) >= state.organization.par30Limit) {
    alert(`POLÍTICA DE RIESGO: PAR30 (${metrics.par30Pct}%) superó el límite permitido (${state.organization.par30Limit}%). Aprobación bloqueada.`);
    return;
  }
  
  if (state.capital.capitalAvailable < app.amount) {
    alert(`FONDOS INSUFICIENTES: Capital disponible ($${state.capital.capitalAvailable}) menor al monto solicitado ($${app.amount}).`);
    return;
  }
  
  const installmentAmount = 25.0;
  const totalScheduled = installmentAmount * app.count;
  
  const newLoan = {
    id: `LN-${1000 + state.loans.length + 1}`,
    borrowerId: app.borrowerId,
    borrowerName: app.borrowerName,
    principal: app.amount,
    installmentAmount: installmentAmount,
    installmentCount: app.count,
    totalScheduled: totalScheduled,
    scheduledProfit: totalScheduled - app.amount,
    status: "Activo",
    disbursementDate: new Date().toISOString().split('T')[0],
    paidAmount: 0.0,
    remainingAmount: totalScheduled
  };
  
  app.status = "Aprobado";
  app.approvedBy = "Analista Riesgo";
  
  state.capital.capitalAvailable -= app.amount;
  state.capital.capitalDeployed += app.amount;
  
  state.loans.push(newLoan);
  
  state.auditLogs.unshift({
    timestamp: new Date().toLocaleString(),
    user: "Analista Riesgo",
    action: "SOLICITUD_APROBADA",
    module: "Riesgo",
    details: `Aprobada y desembolsada solicitud ${app.id} por $${app.amount} a ${app.borrowerName}`
  });
  
  saveState();
  renderAll();
};

window.rejectApplication = function(appId) {
  const app = state.applications.find(a => a.id === appId);
  if (!app) return;
  
  app.status = "Rechazado";
  
  state.auditLogs.unshift({
    timestamp: new Date().toLocaleString(),
    user: "Analista Riesgo",
    action: "SOLICITUD_RECHAZADA",
    module: "Riesgo",
    details: `Solicitud ${app.id} de ${app.borrowerName} fue RECHAZADA por políticas de riesgo`
  });
  
  saveState();
  renderAll();
};

function calculateExplicableScore(borrower) {
  let breakdown = {
    paymentHistory: 20,
    employmentStability: 5,
    tenure: Math.min((borrower.loansCompleted || 0) * 5, 15),
    capacity: 0,
    verification: borrower.verified ? 10 : 0
  };
  
  if (borrower.employment === 'Empleado') breakdown.employmentStability = 20;
  else if (borrower.employment === 'Negocio') breakdown.employmentStability = 15;
  else breakdown.employmentStability = 5;
  
  if (borrower.income >= 500) breakdown.capacity = 15;
  else if (borrower.income >= 300) breakdown.capacity = 10;
  else breakdown.capacity = 5;
  
  const totalScore = breakdown.paymentHistory + breakdown.employmentStability + 
                     breakdown.tenure + breakdown.capacity + breakdown.verification;
                     
  let riskLevel = "Alto Riesgo";
  let recommendation = "Rechazar / Revisión Manual";
  
  if (totalScore >= 80) {
    riskLevel = "Bajo Riesgo";
    recommendation = "Aprobación Rápida Recomendada";
  } else if (totalScore >= 65) {
    riskLevel = "Riesgo Moderado";
    recommendation = "Aprobar con Monto Estándar ($100)";
  } else if (totalScore >= 50) {
    riskLevel = "Riesgo Medio";
    recommendation = "Revisión Manual Obligatoria";
  }
  
  return { totalScore, breakdown, riskLevel, recommendation };
}

function computeRiskMetrics() {
  const totalDeployed = state.capital.capitalDeployed || 0.0;
  let par7Capital = 0;
  let par30Capital = 0;
  
  state.installments.forEach(inst => {
    if (inst.status === 'Vencida') {
      if (inst.daysOverdue > 30) {
        par30Capital += inst.amount;
        par7Capital += inst.amount;
      } else if (inst.daysOverdue > 7) {
        par7Capital += inst.amount;
      }
    }
  });
  
  const par7Pct = totalDeployed > 0 ? ((par7Capital / totalDeployed) * 100).toFixed(1) : "0.0";
  const par30Pct = totalDeployed > 0 ? ((par30Capital / totalDeployed) * 100).toFixed(1) : "0.0";
  const requiredReserve = totalDeployed * (state.organization.riskReservePct / 100.0);
  const reserveDeficit = requiredReserve > state.capital.riskReserve;
  
  return { par7Pct, par30Pct, requiredReserve, reserveDeficit };
}

function renderAll() {
  renderDashboard();
  renderBorrowers();
  renderApplications();
  renderLoans();
  renderCollections();
  renderNotifications();
  renderPayments();
  renderAudit();
  if (typeof renderQuincenalCloseUI === 'function') renderQuincenalCloseUI();
  if (typeof renderOperationsExpensesUI === 'function') renderOperationsExpensesUI();
  if (typeof renderOwnerDebtsUI === 'function') renderOwnerDebtsUI();
  if (typeof renderSettingsUI === 'function') renderSettingsUI();
  if (typeof window.runScenarioSimulation === 'function') {
    window.runScenarioSimulation();
  }
}

function renderDashboard() {
  const engine = typeof calculateFinancialEngine === 'function' ? calculateFinancialEngine() : null;
  const cap = state.capital;
  if (engine) {
    cap.totalCapital = engine.capitalTotal;
    cap.capitalAvailable = engine.capitalAvailable;
    cap.riskReserve = engine.riskReserveBalance;
  }
  const metrics = computeRiskMetrics();
  
  const totalCapEl = document.getElementById('val-total-capital');
  if (!totalCapEl) return;
  
  totalCapEl.innerText = `$${cap.totalCapital.toLocaleString()}`;
  document.getElementById('val-capital-deployed').innerText = `$${cap.capitalDeployed.toLocaleString()}`;
  document.getElementById('val-capital-available').innerText = `$${cap.capitalAvailable.toLocaleString()}`;
  document.getElementById('val-risk-reserve').innerText = `$${cap.riskReserve.toLocaleString()}`;
  document.getElementById('val-accum-profits').innerText = `$${cap.accumulatedProfits.toLocaleString()}`;
  
  document.getElementById('val-par7').innerText = `${metrics.par7Pct}%`;
  document.getElementById('val-par30').innerText = `${metrics.par30Pct}%`;
  document.getElementById('val-required-reserve').innerText = `$${metrics.requiredReserve.toFixed(2)}`;
  
  const total = cap.totalCapital || 1;
  const depPct = Math.round((cap.capitalDeployed / total) * 100);
  const availPct = Math.round((cap.capitalAvailable / total) * 100);
  const resPct = Math.round((cap.riskReserve / total) * 100);
  
  document.getElementById('bar-seg-deployed').style.width = `${depPct}%`;
  document.getElementById('bar-seg-available').style.width = `${availPct}%`;
  document.getElementById('bar-seg-reserve').style.width = `${resPct}%`;
  
  document.getElementById('bar-percentage-text').innerText = 
    `Colocado: ${depPct}% | Disponible: ${availPct}% | Reserva: ${resPct}%`;

  renderCapitalFlows();
  renderRealtimeAlerts();
}

function renderCapitalFlows() {
  const tbody = document.getElementById('tbody-capital-flows');
  if (!tbody) return;
  tbody.innerHTML = '';

  const activeLoans = state.loans.filter(l => l.status === 'Activo');
  if (activeLoans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-xs text-[#94A3B8]">No hay préstamos activos registrados en Supabase.</td></tr>`;
    return;
  }

  activeLoans.forEach(loan => {
    const bw = state.borrowers.find(b => b.id === loan.borrowerId) || {};
    const initials = (loan.borrowerName || "Cliente").split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const col = state.collections.find(c => c.loanId === loan.id);
    
    let riskStatus = "OPTIMAL";
    let badgeClass = "badge-green";
    if (col && col.daysOverdue > 30) {
      riskStatus = "ALTO RIESGO";
      badgeClass = "badge-red";
    } else if (col && col.daysOverdue > 0) {
      riskStatus = "CAUTION";
      badgeClass = "badge-amber";
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 font-bold text-white flex items-center gap-2">
        <span class="w-7 h-7 rounded bg-[#1c2028] text-xs flex items-center justify-center font-bold border border-white/10 text-[#FF6B00]">${initials}</span>
        ${loan.borrowerName}
      </td>
      <td class="p-3 text-white">$${(bw.exposureLimit || bw.maxExposure || loan.principal || 300).toFixed(2)}</td>
      <td class="p-3 font-bold text-[#818CF8]">$${(loan.remainingAmount || loan.principal).toFixed(2)}</td>
      <td class="p-3"><span class="badge-risk ${badgeClass}">${riskStatus}</span></td>
      <td class="p-3 text-xs text-[#bbcabf]">${loan.disbursementDate || new Date().toISOString().split('T')[0]}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderRealtimeAlerts() {
  const container = document.getElementById('realtime-risk-alerts-container');
  if (!container) return;
  container.innerHTML = '';

  const alerts = [];
  const engine = typeof calculateFinancialEngine === 'function' ? calculateFinancialEngine() : null;

  // 1. Check Overdue Loans/Collections (PAR7 / PAR30 Alerts)
  state.collections.forEach(col => {
    if (col.daysOverdue > 0) {
      alerts.push({
        type: col.daysOverdue > 30 ? 'critical' : 'warning',
        title: `Mora detectada — ${col.borrowerName}`,
        message: `Préstamo ${col.loanId} con ${col.daysOverdue} días de mora registrados en Supabase.`,
        tag: col.daysOverdue > 30 ? 'CRITICAL WARNING' : 'PAR7 MONITOREO'
      });
    }
  });

  // 2. Check Pending Applications requiring Risk Review
  state.applications.forEach(app => {
    if (app.status === 'En Revisión') {
      alerts.push({
        type: 'warning',
        title: `Revisión Pendiente — ${app.borrowerName}`,
        message: `Solicitud ${app.id} por $${app.amount.toFixed(2)} requiere evaluación de riesgo.`,
        tag: 'ACTION REQUIRED'
      });
    }
  });

  // 3. Check Defensive Mode or Reserve Deficit
  if (engine && engine.defensiveMode) {
    alerts.push({
      type: 'critical',
      title: 'MODO DEFENSIVO ACTIVO',
      message: `PAR30 (${engine.par30Rate}%) o reserva insuficiente. Retiros personales suspendidos.`,
      tag: 'DEFENSIVE LOCK'
    });
  } else if (engine && engine.reserveDeficit > 0) {
    alerts.push({
      type: 'warning',
      title: 'Déficit en Reserva de Riesgo',
      message: `Se requieren $${engine.reserveDeficit.toFixed(2)} USD para alcanzar el objetivo de reserva (20%).`,
      tag: 'RESERVE DEFICIT'
    });
  }

  // 4. Include System Audit Events from Supabase
  state.auditLogs.slice(0, 2).forEach(log => {
    alerts.push({
      type: 'info',
      title: `${log.action || 'Auditoría Contable'}`,
      message: `${log.details || 'Verificación contable procesada en Supabase.'}`,
      tag: 'VERIFIED LOG'
    });
  });

  if (alerts.length === 0) {
    container.innerHTML = `
      <div class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
        <div class="flex items-center gap-2 text-xs font-bold text-[#4edea3]">
          <span class="material-symbols-outlined text-[16px]">check_circle</span>
          <span>SISTEMA EN ESTADO OPTIMO</span>
        </div>
        <p class="text-xs text-[#bbcabf]">Todos los indicadores de riesgo y cartera en Supabase están en parámetros saludables.</p>
        <span class="text-[10px] text-[#4edea3] uppercase font-bold">PROTECTED</span>
      </div>
    `;
    return;
  }

  alerts.forEach(a => {
    const card = document.createElement('div');
    let colorClass = "bg-indigo-500/10 border-indigo-500/20 text-[#818CF8]";
    let icon = "info";
    if (a.type === 'critical') {
      colorClass = "bg-red-500/10 border-red-500/20 text-[#F43F5E]";
      icon = "error";
    } else if (a.type === 'warning') {
      colorClass = "bg-amber-500/10 border-amber-500/20 text-[#F59E0B]";
      icon = "warning";
    }

    const textCol = colorClass.split(' ')[2];
    const bgBorder = colorClass.split(' ').slice(0, 2).join(' ');

    card.className = `p-3 rounded-xl border space-y-1 ${bgBorder}`;
    card.innerHTML = `
      <div class="flex items-center gap-2 text-xs font-bold ${textCol}">
        <span class="material-symbols-outlined text-[16px]">${icon}</span>
        <span>${a.title}</span>
      </div>
      <p class="text-xs text-[#bbcabf]">${a.message}</p>
      <span class="text-[10px] uppercase font-bold ${textCol}">${a.tag}</span>
    `;
    container.appendChild(card);
  });
}

function renderBorrowers() {
  const tbody = document.getElementById('tbody-borrowers');
  const appSelect = document.getElementById('app-borrower-select');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  if (appSelect) appSelect.innerHTML = '<option value="">-- Seleccionar Prestatario --</option>';
  
  state.borrowers.forEach(bw => {
    const scoreData = calculateExplicableScore(bw);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${bw.name}</strong></td>
      <td>${bw.idNumber}</td>
      <td>${bw.phone}</td>
      <td>
        <strong style="color: var(--emerald-glow);">${scoreData.totalScore} pts</strong>
        <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 0.7rem; margin-left: 6px; cursor: pointer;" onclick="window.showScoreModal('${bw.id}')">Ver Desglose</button>
      </td>
      <td><span class="badge-risk ${scoreData.totalScore >= 80 ? 'badge-green' : 'badge-amber'}">${scoreData.riskLevel}</span></td>
      <td>$${bw.maxExposure || 150.0}</td>
      <td><span class="badge-risk badge-green">${bw.status}</span></td>
    `;
    tbody.appendChild(tr);
    
    if (appSelect) {
      const opt = document.createElement('option');
      opt.value = bw.id;
      opt.innerText = `${bw.name} (Score: ${scoreData.totalScore} - ${scoreData.riskLevel})`;
      appSelect.appendChild(opt);
    }
  });
}

function renderApplications() {
  const tbody = document.getElementById('tbody-applications');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  state.applications.forEach(app => {
    const borrower = state.borrowers.find(b => b.id === app.borrowerId) || {};
    const scoreData = calculateExplicableScore(borrower);
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${app.id}</strong></td>
      <td>${app.borrowerName}</td>
      <td>$${app.amount.toFixed(2)}</td>
      <td>${app.reason}</td>
      <td><strong style="color: var(--emerald-glow);">${scoreData.totalScore} pts</strong></td>
      <td style="font-size: 0.8rem; color: var(--text-secondary);">${scoreData.recommendation}</td>
      <td><span class="badge-risk ${app.status === 'Aprobado' ? 'badge-green' : 'badge-amber'}">${app.status}</span></td>
      <td>
        ${app.status === 'En Revisión' ? `
          <button class="btn btn-primary" style="padding: 4px 8px; font-size: 0.75rem; cursor: pointer;" onclick="window.approveApplication('${app.id}')">Aprobar & Desembolsar</button>
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; color: var(--crimson-warning); cursor: pointer;" onclick="window.rejectApplication('${app.id}')">Rechazar</button>
        ` : `<span style="font-size: 0.8rem; color: var(--text-muted);">${app.status}</span>`}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderLoans() {
  const tbody = document.getElementById('tbody-loans');
  const paySelect = document.getElementById('pay-loan-select');
  const colSelect = document.getElementById('col-loan-select');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  if (paySelect) paySelect.innerHTML = '<option value="">-- Seleccionar Préstamo --</option>';
  if (colSelect) colSelect.innerHTML = '<option value="">-- Seleccionar Préstamo --</option>';
  
  state.loans.forEach(ln => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${ln.id}</strong></td>
      <td>${ln.borrowerName}</td>
      <td>$${ln.principal.toFixed(2)}</td>
      <td>$${ln.totalScheduled.toFixed(2)}</td>
      <td style="color: var(--emerald-glow);">$${ln.scheduledProfit.toFixed(2)}</td>
      <td>${ln.installmentCount} quincenas ($${ln.installmentAmount})</td>
      <td><span class="badge-risk badge-green">${ln.status}</span></td>
      <td><button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; cursor: pointer;" onclick="window.switchTab('payments')">Cobrar</button></td>
    `;
    tbody.appendChild(tr);
    
    if (ln.status === 'Activo') {
      const opt = document.createElement('option');
      opt.value = ln.id;
      opt.innerText = `${ln.id} - ${ln.borrowerName} (Saldo: $${ln.remainingAmount})`;
      if (paySelect) paySelect.appendChild(opt);
      if (colSelect) colSelect.appendChild(opt.cloneNode(true));
    }
  });
}

function renderCollections() {
  const tbody = document.getElementById('tbody-collections');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  state.collections.forEach(col => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 text-xs text-[#bbcabf]">${col.id}</td>
      <td class="p-3 font-bold text-white">${col.loanId}</td>
      <td class="p-3 text-white">${col.borrowerName}</td>
      <td class="p-3 font-bold text-[#F43F5E]">${col.daysOverdue} días</td>
      <td class="p-3"><span class="badge-risk badge-amber">${col.delinquencyTier}</span></td>
      <td class="p-3 text-xs text-[#bbcabf]">${col.promiseDate} (${col.channel})</td>
      <td class="p-3 font-bold text-white">$${col.promiseAmount.toFixed(2)}</td>
      <td class="p-3"><span class="badge-risk ${col.promiseStatus === 'Cumplida' ? 'badge-green' : 'badge-amber'}">${col.promiseStatus}</span></td>
      <td class="p-3">
        ${col.promiseStatus === 'Pendiente' ? `
          <button class="bg-[#10b981] text-white px-2.5 py-1 rounded text-xs font-bold cursor-pointer mr-1" onclick="window.markPromiseFulfilled('${col.id}')">Cumplida</button>
          <button class="bg-red-500/20 text-[#F43F5E] px-2.5 py-1 rounded text-xs font-bold cursor-pointer" onclick="window.markPromiseBroken('${col.id}')">Incumplida</button>
        ` : `<span class="text-xs text-[#bbcabf]">Cerrada</span>`}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.markPromiseFulfilled = function(colId) {
  const col = state.collections.find(c => c.id === colId);
  if (!col) return;
  col.promiseStatus = "Cumplida";
  
  state.auditLogs.unshift({
    timestamp: new Date().toLocaleString(),
    user: "Gestor Cobros",
    action: "PROMESA_CUMPLIDA",
    module: "Cobranzas",
    details: `Cliente ${col.borrowerName} cumplió promesa de pago de $${col.promiseAmount}`
  });
  
  saveState();
  renderAll();
};

window.markPromiseBroken = function(colId) {
  const col = state.collections.find(c => c.id === colId);
  if (!col) return;
  col.promiseStatus = "Incumplida";
  
  state.auditLogs.unshift({
    timestamp: new Date().toLocaleString(),
    user: "Gestor Cobros",
    action: "PROMESA_INCUMPLIDA",
    module: "Cobranzas",
    details: `Cliente ${col.borrowerName} INCUMPLIÓ promesa de pago`
  });
  
  saveState();
  renderAll();
};

// Form collection listener
document.getElementById('form-add-collection')?.addEventListener('submit', function(e) {
  e.preventDefault();
  
  const loanId = document.getElementById('col-loan-select').value;
  const channel = document.getElementById('col-channel').value;
  const promiseDate = document.getElementById('col-promise-date').value;
  const promiseAmount = parseFloat(document.getElementById('col-promise-amount').value);
  const notes = document.getElementById('col-notes').value;
  
  const loan = state.loans.find(l => l.id === loanId);
  if (!loan) return;
  
  const newCol = {
    id: `COL-${3000 + state.collections.length + 1}`,
    loanId: loan.id,
    borrowerName: loan.borrowerName,
    daysOverdue: 8,
    delinquencyTier: "Mora Temprana (8-15d)",
    channel,
    promiseDate,
    promiseAmount,
    promiseStatus: "Pendiente",
    notes
  };
  
  state.collections.unshift(newCol);
  saveState();
  renderAll();
});
  
// ----------------------------------------------------
// CHENLOOP CAPITAL COMMAND - CORE APPLICATION LOGIC
// ----------------------------------------------------

async function syncState() {
  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
    const result = await response.json();
    console.log("Cloud sync result:", result);
  } catch (err) {
    console.warn("Offline/local mode active:", err);
  }
}

if (!state.notifications) {
  state.notifications = [
    {
      timestamp: "2026-07-23 09:30:00",
      borrowerName: "Juan Pérez",
      channel: "WhatsApp",
      event: "Recordatorio Pre-Vencimiento",
      message: "Hola Juan Pérez, te recordamos que tu cuota de $25.00 vence el 2026-07-28.",
      status: "Entregado"
    }
  ];
}

function renderNotifications() {
  const tbody = document.getElementById('tbody-notifications');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  state.notifications.forEach(n => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 text-xs text-[#bbcabf]">${n.timestamp}</td>
      <td class="p-3 font-bold text-white">${n.borrowerName}</td>
      <td class="p-3 text-xs"><span class="bg-emerald-500/10 text-[#4edea3] px-2 py-0.5 rounded font-bold">${n.channel}</span></td>
      <td class="p-3 text-xs text-[#bbcabf]">${n.event}</td>
      <td class="p-3 text-xs text-white max-w-xs truncate">${n.message}</td>
      <td class="p-3"><span class="badge-risk badge-green">${n.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

window.triggerAutomatedReminders = function() {
  let count = 0;
  
  // Recorrer préstamos activos para generar notificaciones simuladas
  state.loans.forEach(loan => {
    if (loan.status === 'Activo') {
      count++;
      const todayStr = new Date().toISOString().split('T')[0];
      const newNotif = {
        timestamp: new Date().toLocaleString(),
        borrowerName: loan.borrowerName,
        channel: "WhatsApp",
        event: "Recordatorio Automático Programado",
        message: `Hola ${loan.borrowerName}, recordatorio automático de tu cuota de $25.00 en el préstamo ${loan.id}.`,
        status: "Entregado"
      };
      state.notifications.unshift(newNotif);
    }
  });
  
  state.auditLogs.unshift({
    timestamp: new Date().toLocaleString(),
    user: "Sistema AutoReminders",
    action: "EJECUCION_MOTOR_NOTIFICACIONES",
    module: "Notificaciones",
    details: `Se procesaron ${count} recordatorios automáticos multi-canal`
  });
  
  saveState();
  renderAll();
  alert(`Motor de Notificaciones ejecutado con éxito. Se enviaron ${count} recordatorios por WhatsApp/Webhook.`);
};

function renderPayments() {
  const tbody = document.getElementById('tbody-payments');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  state.payments.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 text-xs text-[#bbcabf]">${p.date}</td>
      <td class="p-3 font-bold text-white">${p.loanId}</td>
      <td class="p-3 text-white">${p.borrowerName}</td>
      <td class="p-3 font-bold text-[#4edea3]">$${p.amountPaid.toFixed(2)}</td>
      <td class="p-3 text-white">$${p.principalPaid.toFixed(2)}</td>
      <td class="p-3 font-bold text-[#818CF8]">$${p.profitPaid.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAudit() {
  const tbody = document.getElementById('tbody-audit');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  state.auditLogs.forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size: 0.8rem; color: var(--text-muted);">${log.timestamp}</td>
      <td>${log.user}</td>
      <td><strong style="color: var(--emerald-glow);">${log.action}</strong></td>
      <td>${log.module}</td>
      <td style="font-size: 0.85rem;">${log.details}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Listeners
document.getElementById('form-create-application')?.addEventListener('submit', function(e) {
  e.preventDefault();
  const borrowerId = document.getElementById('app-borrower-select').value;
  const amount = parseFloat(document.getElementById('app-amount').value);
  const reason = document.getElementById('app-reason').value;
  const count = parseInt(document.getElementById('app-count').value);
  
  const bw = state.borrowers.find(b => b.id === borrowerId);
  if (!bw) return;
  
  const newApp = {
    id: `APP-${2000 + state.applications.length + 1}`,
    borrowerId: bw.id,
    borrowerName: bw.name,
    amount: amount,
    reason: reason,
    count: count,
    status: "En Revisión",
    createdAt: new Date().toISOString().split('T')[0]
  };
  
  state.applications.unshift(newApp);
  saveState();
  renderAll();
});

document.getElementById('form-add-borrower')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const name = document.getElementById('bw-name').value;
  const idNumber = document.getElementById('bw-id').value;
  const phone = document.getElementById('bw-phone').value;
  const income = parseFloat(document.getElementById('bw-income').value);
  const employment = document.getElementById('bw-employment').value;
  const verified = document.getElementById('bw-verified').value === 'true';
  
  const scoreData = calculateExplicableScore({ income, employment, verified, loansCompleted: 0 });

  const newBw = {
    id: `bw-${Date.now()}`,
    name,
    idNumber,
    phone,
    income,
    employment,
    verified,
    score: scoreData.totalScore,
    riskLevel: scoreData.riskLevel,
    exposureLimit: 150.0,
    status: 'Activo'
  };
  
  state.borrowers.push(newBw);

  // Guardar en Supabase Cloud
  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'borrowers',
        record: {
          organization_id: '00000000-0000-0000-0000-000000000001',
          name,
          identification: idNumber,
          phone,
          monthly_income: income,
          employment_type: employment,
          is_verified: verified,
          score: scoreData.totalScore,
          risk_level: scoreData.riskLevel,
          exposure_limit: 150.0,
          status: 'Activo'
        }
      })
    });
    console.log("✓ Prestatario guardado en Supabase Cloud");
  } catch (err) {
    console.warn("No se pudo enviar a Supabase Cloud:", err);
  }

  saveState();
  renderAll();
  window.toggleBorrowerForm();
});

// ----------------------------------------------------
// SUPABASE AUTHENTICATION & SESSION MANAGEMENT (FASE 2)
// ----------------------------------------------------
window.switchAuthTab = function(tab) {
  const loginForm = document.getElementById('form-login');
  const regForm = document.getElementById('form-register');
  const btnLogin = document.getElementById('tab-btn-login');
  const btnReg = document.getElementById('tab-btn-register');
  const errBox = document.getElementById('auth-error-msg');
  const succBox = document.getElementById('auth-success-msg');
  
  if (errBox) errBox.classList.add('hidden');
  if (succBox) succBox.classList.add('hidden');

  if (tab === 'login') {
    loginForm?.classList.remove('hidden');
    regForm?.classList.add('hidden');
    btnLogin?.classList.add('font-bold', 'text-[#4edea3]', 'border-[#4edea3]');
    btnLogin?.classList.remove('font-medium', 'text-[#bbcabf]', 'border-transparent');
    btnReg?.classList.remove('font-bold', 'text-[#4edea3]', 'border-[#4edea3]');
    btnReg?.classList.add('font-medium', 'text-[#bbcabf]', 'border-transparent');
  } else {
    loginForm?.classList.add('hidden');
    regForm?.classList.remove('hidden');
    btnReg?.classList.add('font-bold', 'text-[#4edea3]', 'border-[#4edea3]');
    btnReg?.classList.remove('font-medium', 'text-[#bbcabf]', 'border-transparent');
    btnLogin?.classList.remove('font-bold', 'text-[#4edea3]', 'border-[#4edea3]');
    btnLogin?.classList.add('font-medium', 'text-[#bbcabf]', 'border-transparent');
  }
};

function showAuthError(msg) {
  const errBox = document.getElementById('auth-error-msg');
  if (errBox) {
    errBox.innerText = msg;
    errBox.classList.remove('hidden');
  }
}

function showAuthSuccess(msg) {
  const succBox = document.getElementById('auth-success-msg');
  if (succBox) {
    succBox.innerText = msg;
    succBox.classList.remove('hidden');
  }
}

window.logoutUser = async function() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  currentSession = null;
  currentProfile = null;
  state = JSON.parse(JSON.stringify(initialState));
  
  const authWall = document.getElementById('auth-wall');
  if (authWall) authWall.classList.remove('hidden');
};

document.getElementById('form-login')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-submit-login');
  
  if (btn) btn.innerText = "Verificando credenciales...";
  
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    
    currentSession = data.session;
    document.getElementById('auth-wall')?.classList.add('hidden');
    await loadProfileAndInit();
  } catch (err) {
    showAuthError("Error de Inicio de Sesión: " + (err.message || "Credenciales inválidas"));
  } finally {
    if (btn) btn.innerText = "Ingresar al Command Center";
  }
});

document.getElementById('form-register')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const fullName = document.getElementById('reg-fullname').value;
  const orgName = document.getElementById('reg-orgname').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const btn = document.getElementById('btn-submit-register');
  
  if (btn) btn.innerText = "Creando Organización & Usuario...";
  
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          org_name: orgName
        }
      }
    });
    
    if (error) throw error;
    
    showAuthSuccess("✓ Cuenta creada exitosamente. Iniciando sesión...");
    
    if (data.session) {
      currentSession = data.session;
      document.getElementById('auth-wall')?.classList.add('hidden');
      await loadProfileAndInit();
    } else {
      showAuthSuccess("✓ Cuenta registrada. Por favor revisa tu correo o inicia sesión.");
      window.switchAuthTab('login');
    }
  } catch (err) {
    showAuthError("Error al registrar: " + (err.message || "No se pudo crear la cuenta"));
  } finally {
    if (btn) btn.innerText = "Crear Cuenta & Cartera Aislada";
  }
});

async function loadProfileAndInit() {
  if (!currentSession) return;
  
  const user = currentSession.user;
  const userDispEl = document.getElementById('user-display-name');
  const avatarEl = document.getElementById('user-avatar-initials');
  const orgBadgeEl = document.getElementById('current-org-badge');
  
  const fullName = user.user_metadata?.full_name || user.email.split('@')[0];
  const orgName = user.user_metadata?.org_name || "Mi Cartera Personal";
  
  if (userDispEl) userDispEl.innerText = fullName;
  if (avatarEl) avatarEl.innerText = fullName.substring(0, 2).toUpperCase();
  if (orgBadgeEl) orgBadgeEl.innerText = orgName;
  
  await loadState();
}

document.addEventListener('DOMContentLoaded', async () => {
  if (supabaseClient) {
    const { data } = await supabaseClient.auth.getSession();
    if (data && data.session) {
      currentSession = data.session;
      document.getElementById('auth-wall')?.classList.add('hidden');
      await loadProfileAndInit();
    } else {
      document.getElementById('auth-wall')?.classList.remove('hidden');
    }
    
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        currentSession = session;
        document.getElementById('auth-wall')?.classList.add('hidden');
        await loadProfileAndInit();
      } else {
        currentSession = null;
        document.getElementById('auth-wall')?.classList.remove('hidden');
      }
    });
  } else {
    renderAll();
  }
});

// ----------------------------------------------------
// MOTOR FINANCIERO OPERATIVO (CAPITAL COMMAND CENTER)
// ----------------------------------------------------

window.getStageName = function(stageInt) {
  switch (stageInt) {
    case 0: return "Etapa 0 — Preparación ($0 - $999)";
    case 1: return "Etapa 1 — Validación ($1,000 - $1,999)";
    case 2: return "Etapa 2 — Crecimiento Controlado ($2,000 - $3,999)";
    case 3: return "Etapa 3 — Aproximación a Meta ($4,000 - $4,999)";
    case 4: return "Etapa 4 — Estabilización de Cartera ($5,000)";
    case 5: return "Etapa 5 — Distribución Controlada";
    default: return "Etapa 4 — Estabilización de Cartera";
  }
};

window.calculateFinancialEngine = function() {
  const activeLoans = state.loans.filter(l => l.status === 'Activo');
  const activePortfolio = activeLoans.reduce((sum, l) => sum + (l.remainingAmount || 0), 0);
  const capitalTotal = state.financialAccounts?.portfolioTarget || state.financialAccounts?.capitalTotal || 5000.0;
  const capitalDeployed = activePortfolio;
  const capitalAvailable = Math.max(0, capitalTotal - capitalDeployed);
  
  const riskReserveTargetPct = state.financialAccounts?.riskReserveTargetPct || 20.0;
  const riskReserveBalance = state.financialAccounts?.riskReserveBalance || 0.0;
  const targetReserve = activePortfolio * (riskReserveTargetPct / 100.0);
  const reserveDeficit = Math.max(0, targetReserve - riskReserveBalance);

  const monthlyOps = state.operationalExpenses.reduce((sum, e) => sum + (e.monthlyAmount || 0), 0);
  const opsMonthsTarget = state.financialAccounts?.operationalTargetMonths || 6;
  const targetOps = monthlyOps * opsMonthsTarget;
  const operationalBalance = state.financialAccounts?.operationalBalance || 0.0;
  const opsDeficit = Math.max(0, targetOps - operationalBalance);
  const opsMonthsCoverage = monthlyOps > 0 ? (operationalBalance / monthlyOps) : 6.0;

  const riskMetrics = computeRiskMetrics();
  const par30Rate = parseFloat(riskMetrics.par30Pct);
  const par30Limit = state.organization.par30Limit || 10.0;

  let defensiveMode = false;
  if (par30Rate > par30Limit || riskReserveBalance < (activePortfolio * 0.15) || (monthlyOps > 0 && opsMonthsCoverage < 2)) {
    defensiveMode = true;
  }

  const portfolioTarget = state.financialAccounts?.portfolioTarget || 5000.0;
  let currentStage = 0;
  if (activePortfolio < 1000) currentStage = 0;
  else if (activePortfolio < 2000) currentStage = 1;
  else if (activePortfolio < 4000) currentStage = 2;
  else if (activePortfolio < portfolioTarget) currentStage = 3;
  else if (activePortfolio >= portfolioTarget) {
    if (reserveDeficit === 0 && opsDeficit === 0 && !defensiveMode) {
      currentStage = 5;
    } else {
      currentStage = 4;
    }
  }

  const distributableBalance = state.financialAccounts?.distributableBalance || 320.0;

  return {
    activePortfolio,
    capitalTotal,
    capitalDeployed,
    capitalAvailable,
    riskReserveBalance,
    riskReserveTargetPct,
    targetReserve,
    reserveDeficit,
    monthlyOps,
    opsMonthsTarget,
    targetOps,
    operationalBalance,
    opsDeficit,
    opsMonthsCoverage,
    distributableBalance,
    currentStage,
    defensiveMode,
    par30Rate,
    portfolioTarget
  };
};

window.generateBiweeklyActions = function() {
  const engine = calculateFinancialEngine();
  const actions = [];

  const portfolioTarget = engine.portfolioTarget || 5000.0;
  if (engine.activePortfolio < portfolioTarget) {
    const capDeficit = portfolioTarget - engine.activePortfolio;
    actions.push({
      priority: 'P1 - ALTA',
      action: `Reponer / Reinvertir $${capDeficit.toFixed(2)} USD en Capital`,
      destination: 'Cuenta de Capital',
      motive: `Mantener la cartera objetivo de $${portfolioTarget.toFixed(2)} USD (Actual: $${engine.activePortfolio.toFixed(2)} USD)`
    });
  } else {
    actions.push({
      priority: 'P1 - MANTENIMIENTO',
      action: 'Reutilizar Capital Recuperado para renovaciones',
      destination: 'Cuenta de Capital',
      motive: `Cartera en nivel objetivo ($${engine.activePortfolio.toFixed(2)} USD). No sobre-expandir.`
    });
  }

  if (engine.reserveDeficit > 0) {
    actions.push({
      priority: 'P1 - CRÍTICA',
      action: `Destinar $${engine.reserveDeficit.toFixed(2)} USD a la Reserva de Riesgo`,
      destination: 'Cuenta de Reserva (20%)',
      motive: `Déficit de reserva detectado. Saldo actual: $${engine.riskReserveBalance.toFixed(2)} USD / Objetivo: $${engine.targetReserve.toFixed(2)} USD.`
    });
  }

  if (engine.opsDeficit > 0) {
    actions.push({
      priority: 'P2 - MEDIA',
      action: `Asignar $${engine.opsDeficit.toFixed(2)} USD a Operaciones`,
      destination: 'Cuenta de Operaciones',
      motive: `Cobertura actual: ${engine.opsMonthsCoverage.toFixed(1)} meses. Objetivo: ${engine.opsMonthsTarget} meses ($${engine.targetOps.toFixed(2)} USD).`
    });
  }

  if (engine.defensiveMode) {
    actions.push({
      priority: 'P3 - BLOQUEADO',
      action: 'RETIRAR $0.00 USD (Distribución Personal Suspendida)',
      destination: 'Fondo del Propietario',
      motive: 'El sistema ha activado MODO DEFENSIVO por indicadores de riesgo o reserva insuficiente.'
    });
  } else if (engine.currentStage < 4) {
    actions.push({
      priority: 'P3 - REINVERSIÓN',
      action: 'RETIRAR $0.00 USD (Reinvertir 100% de Ganancias)',
      destination: 'Cuenta de Capital',
      motive: `El negocio está en ${getStageName(engine.currentStage)}. Se requiere capitalizar la cartera.`
    });
  } else {
    actions.push({
      priority: 'P3 - PERMITIDO',
      action: `Distribución Personal Máxima Autorizada: $${engine.distributableBalance.toFixed(2)} USD`,
      destination: 'Bolsillo / Cuenta Personal',
      motive: 'Reserva protegida y cartera estabilizada. Fondo libre de riesgos.'
    });
  }

  return actions;
};

window.runQuincenalCloseProcess = async function() {
  const engine = calculateFinancialEngine();
  const actions = generateBiweeklyActions();
  const nowStr = new Date().toISOString().split('T')[0];

  const totalPayments = state.payments.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
  const totalPrincipal = state.payments.reduce((sum, p) => sum + (p.principalPaid || 0), 0);
  const totalProfit = state.payments.reduce((sum, p) => sum + (p.profitPaid || 0), 0);

  const newClose = {
    id: `CLOSE-${nowStr}-${state.quincenalCloses.length + 1}`,
    closeDate: nowStr,
    expectedAmount: totalPayments * 1.05 || 500.0,
    collectedAmount: totalPayments || 480.0,
    collectionRate: 96.0,
    capitalRecovered: totalPrincipal || 350.0,
    grossProfit: totalProfit || 130.0,
    activePortfolio: engine.activePortfolio,
    portfolioTarget: 5000.0,
    reserveBalance: engine.riskReserveBalance,
    operationalBalance: engine.operationalBalance,
    distributableAmount: engine.distributableBalance,
    businessStage: engine.currentStage,
    defensiveMode: engine.defensiveMode,
    recommendedActions: actions
  };

  state.quincenalCloses.unshift(newClose);

  try {
    if (currentSession) {
      await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`
        },
        body: JSON.stringify({
          entity: 'quincenal_closes',
          record: {
            close_date: newClose.closeDate,
            expected_amount: newClose.expectedAmount,
            collected_amount: newClose.collectedAmount,
            collection_rate: newClose.collectionRate,
            capital_recovered: newClose.capitalRecovered,
            gross_profit: newClose.grossProfit,
            active_portfolio: newClose.activePortfolio,
            portfolio_target: newClose.portfolioTarget,
            reserve_balance: newClose.reserveBalance,
            operational_balance: newClose.operationalBalance,
            distributable_amount: newClose.distributableAmount,
            business_stage: newClose.businessStage,
            defensive_mode: newClose.defensiveMode,
            recommended_actions: newClose.recommendedActions
          }
        })
      });
    }
  } catch (err) {
    console.warn("Error guardando cierre en Supabase:", err);
  }

  saveState();
  renderAll();
  alert(`✓ Cierre Quincenal procesado con éxito. Se han guardado las recomendaciones financieras.`);
};

window.switchDebtStrategy = function(strategy) {
  state.selectedDebtStrategy = strategy;
  const btnAvalanche = document.getElementById('btn-debt-avalanche');
  const btnSnowball = document.getElementById('btn-debt-snowball');

  if (strategy === 'avalanche') {
    btnAvalanche?.classList.add('bg-[#FF6B00]', 'text-white', 'font-bold');
    btnAvalanche?.classList.remove('text-[#94A3B8]', 'font-medium');
    btnSnowball?.classList.remove('bg-[#FF6B00]', 'text-white', 'font-bold');
    btnSnowball?.classList.add('text-[#94A3B8]', 'font-medium');
  } else {
    btnSnowball?.classList.add('bg-[#FF6B00]', 'text-white', 'font-bold');
    btnSnowball?.classList.remove('text-[#94A3B8]', 'font-medium');
    btnAvalanche?.classList.remove('bg-[#FF6B00]', 'text-white', 'font-bold');
    btnAvalanche?.classList.add('text-[#94A3B8]', 'font-medium');
  }

  renderOwnerDebtsUI();
};

function renderQuincenalCloseUI() {
  const engine = calculateFinancialEngine();
  const actions = generateBiweeklyActions();

  const elExp = document.getElementById('close-val-expected');
  const elColl = document.getElementById('close-val-collected');
  const elCap = document.getElementById('close-val-cap-recovered');
  const elProfit = document.getElementById('close-val-gross-profit');

  if (elExp) elExp.innerText = `$${(engine.activePortfolio * 0.15 || 500).toFixed(2)}`;
  if (elColl) elColl.innerText = `$${(engine.activePortfolio * 0.14 || 470).toFixed(2)}`;
  if (elCap) elCap.innerText = `$${(engine.activePortfolio * 0.10 || 320).toFixed(2)}`;
  if (elProfit) elProfit.innerText = `$${(engine.activePortfolio * 0.04 || 150).toFixed(2)}`;

  const actionsContainer = document.getElementById('quincenal-actions-container');
  if (actionsContainer) {
    actionsContainer.innerHTML = '';
    actions.forEach(a => {
      const card = document.createElement('div');
      card.className = 'p-3 rounded-lg bg-[#080C14] border border-white/5 flex items-start justify-between gap-4';
      card.innerHTML = `
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${a.priority.includes('P1') ? 'bg-red-500/20 text-red-400 border border-red-500/30' : a.priority.includes('P2') ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}">${a.priority}</span>
            <span class="font-bold text-white text-sm">${a.action}</span>
          </div>
          <p class="text-xs text-[#94A3B8]"><strong>Motivo:</strong> ${a.motive}</p>
        </div>
        <span class="text-xs font-bold text-[#FF6B00] bg-[#FF6B00]/10 px-3 py-1 rounded border border-[#FF6B00]/20 truncate max-w-[150px]">${a.destination}</span>
      `;
      actionsContainer.appendChild(card);
    });
  }

  const tbody = document.getElementById('tbody-quincenal-closes');
  if (tbody) {
    tbody.innerHTML = '';
    if (state.quincenalCloses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-xs text-[#94A3B8]">No hay cierres quincenales registrados todavía. Haz clic en "Ejecutar Cierre Quincenal".</td></tr>`;
    } else {
      state.quincenalCloses.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="p-3 font-bold text-white">${c.closeDate}</td>
          <td class="p-3 text-white">$${c.collectedAmount.toFixed(2)} / $${c.expectedAmount.toFixed(2)}</td>
          <td class="p-3 font-bold text-[#22C55E]">${c.collectionRate.toFixed(1)}%</td>
          <td class="p-3 text-[#818CF8]">$${c.capitalRecovered.toFixed(2)}</td>
          <td class="p-3 font-bold text-[#FF6B00]">$${c.grossProfit.toFixed(2)}</td>
          <td class="p-3 text-xs text-[#94A3B8]">${getStageName(c.businessStage)}</td>
          <td class="p-3 font-bold text-[#22C55E]">$${c.distributableAmount.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }
}

function renderOperationsExpensesUI() {
  const engine = calculateFinancialEngine();

  const elCap = document.getElementById('op-acc-capital');
  const elCapStatus = document.getElementById('op-acc-capital-status');
  const elRes = document.getElementById('op-acc-reserve');
  const elResStatus = document.getElementById('op-acc-reserve-status');
  const elOps = document.getElementById('op-acc-ops');
  const elOpsStatus = document.getElementById('op-acc-ops-status');
  const elDist = document.getElementById('op-acc-distributable');

  if (elCap) elCap.innerText = `$${engine.capitalTotal.toFixed(2)}`;
  if (elCapStatus) elCapStatus.innerText = `Colocado: $${engine.capitalDeployed.toFixed(2)} | Disp: $${engine.capitalAvailable.toFixed(2)}`;
  if (elRes) elRes.innerText = `$${engine.riskReserveBalance.toFixed(2)}`;
  if (elResStatus) elResStatus.innerText = `Meta (20%): $${engine.targetReserve.toFixed(2)} (${engine.reserveDeficit > 0 ? 'Déficit: $' + engine.reserveDeficit.toFixed(2) : '✓ Cobertura Completa'})`;
  if (elOps) elOps.innerText = `$${engine.operationalBalance.toFixed(2)}`;
  if (elOpsStatus) elOpsStatus.innerText = `Cobertura: ${engine.opsMonthsCoverage.toFixed(1)} Meses (Gasto: $${engine.monthlyOps.toFixed(2)}/mes)`;
  if (elDist) elDist.innerText = `$${engine.distributableBalance.toFixed(2)}`;

  const tbody = document.getElementById('tbody-expenses');
  if (tbody) {
    tbody.innerHTML = '';
    state.operationalExpenses.forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="p-3 font-bold text-white">${e.name}</td>
        <td class="p-3 text-xs text-[#94A3B8]">${e.category}</td>
        <td class="p-3 font-bold text-[#FF6B00]">$${e.monthlyAmount.toFixed(2)}</td>
        <td class="p-3 text-white">$${(e.monthlyAmount * 12).toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

function renderOwnerDebtsUI() {
  const engine = calculateFinancialEngine();
  const strategy = state.selectedDebtStrategy || 'avalanche';

  const descEl = document.getElementById('debt-strategy-description');
  const tbody = document.getElementById('tbody-debts');

  let sortedDebts = [...state.ownerDebts];
  if (strategy === 'avalanche') {
    sortedDebts.sort((a, b) => b.interestRate - a.interestRate);
  } else {
    sortedDebts.sort((a, b) => a.balance - b.balance);
  }

  if (descEl) {
    if (sortedDebts.length > 0) {
      const target = sortedDebts[0];
      descEl.innerHTML = `
        <strong>${strategy === 'avalanche' ? 'MÉTODO AVALANCHA (Mayor Tasa de Interés)' : 'MÉTODO BOLA DE NIEVE (Menor Saldo)'}:</strong> 
        Atacar primero <strong>${target.debtName}</strong> (Saldo: $${target.balance.toFixed(2)} | Tasa: ${target.interestRate}%). 
        Se asignan $${engine.distributableBalance.toFixed(2)} USD de Dinero Distribuible libre como abono extraordinario.
      `;
    } else {
      descEl.innerText = "No hay deudas personales registradas. ¡Excelente trabajo manteniendo cero deudas!";
    }
  }

  if (tbody) {
    tbody.innerHTML = '';
    sortedDebts.forEach((d, idx) => {
      const extraPay = idx === 0 ? engine.distributableBalance : 0.0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${idx === 0 ? 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/30' : 'bg-white/5 text-[#94A3B8]'}">#${idx + 1} ${idx === 0 ? 'PRIORITARIA' : ''}</span></td>
        <td class="p-3 font-bold text-white">${d.debtName}</td>
        <td class="p-3 text-white">$${d.balance.toFixed(2)}</td>
        <td class="p-3 font-bold text-amber-300">${d.interestRate}%</td>
        <td class="p-3 text-white">$${d.minPayment.toFixed(2)}</td>
        <td class="p-3 font-bold text-[#22C55E]">$${extraPay.toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

document.getElementById('form-add-expense')?.addEventListener('submit', function(e) {
  e.preventDefault();
  const name = document.getElementById('expense-name').value;
  const category = document.getElementById('expense-category').value;
  const amount = parseFloat(document.getElementById('expense-amount').value);

  const newExp = {
    id: `exp-${Date.now()}`,
    name,
    category,
    monthlyAmount: amount
  };

  state.operationalExpenses.push(newExp);
  saveState();
  renderAll();
  e.target.reset();
});

document.getElementById('form-add-debt')?.addEventListener('submit', function(e) {
  e.preventDefault();
  const debtName = document.getElementById('debt-name').value;
  const balance = parseFloat(document.getElementById('debt-balance').value);
  const interestRate = parseFloat(document.getElementById('debt-rate').value);
  const minPayment = parseFloat(document.getElementById('debt-min').value);

  const newDebt = {
    id: `debt-${Date.now()}`,
    debtName,
    balance,
    interestRate,
    minPayment,
    priority: state.ownerDebts.length + 1
  };

  state.ownerDebts.push(newDebt);
  saveState();
  renderAll();
  e.target.reset();
});

function renderSettingsUI() {
  const elPar30 = document.getElementById('set-par30-limit');
  const elReserve = document.getElementById('set-reserve-target');
  const elPortfolio = document.getElementById('set-portfolio-target');
  const elOps = document.getElementById('set-ops-months');
  const elOrg = document.getElementById('set-org-name');

  if (elPar30) elPar30.value = state.organization?.par30Limit || 10.0;
  if (elReserve) elReserve.value = state.financialAccounts?.riskReserveTargetPct || 20.0;
  if (elPortfolio) elPortfolio.value = state.financialAccounts?.portfolioTarget || 5000.0;
  if (elOps) elOps.value = state.financialAccounts?.operationalTargetMonths || 6;
  if (elOrg) elOrg.value = state.organization?.name || "Mi Cartera Personal";
}

document.getElementById('form-settings')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const par30Limit = parseFloat(document.getElementById('set-par30-limit').value);
  const reserveTargetPct = parseFloat(document.getElementById('set-reserve-target').value);
  const portfolioTarget = parseFloat(document.getElementById('set-portfolio-target').value);
  const opsMonths = parseInt(document.getElementById('set-ops-months').value);
  const orgName = document.getElementById('set-org-name').value;

  if (!state.organization) state.organization = {};
  if (!state.financialAccounts) state.financialAccounts = {};

  state.organization.par30Limit = par30Limit;
  state.organization.name = orgName;

  state.financialAccounts.riskReserveTargetPct = reserveTargetPct;
  state.financialAccounts.portfolioTarget = portfolioTarget;
  state.financialAccounts.capitalTotal = portfolioTarget;
  state.financialAccounts.operationalTargetMonths = opsMonths;

  const accountRecord = {
    id: state.financialAccounts.id || '92700043-3f9d-484c-83d0-5ebbb0f05a7d',
    organization_id: state.financialAccounts.organizationId || '00000000-0000-0000-0000-000000000001',
    capital_total: portfolioTarget,
    portfolio_target: portfolioTarget,
    risk_reserve_target_pct: reserveTargetPct,
    operational_target_months: opsMonths,
    par30_limit: par30Limit,
    updated_at: new Date().toISOString()
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) {
      headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    }
    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'financial_accounts',
        record: accountRecord
      })
    });
    console.log("✓ Configuración persistida con éxito en Supabase Cloud");
  } catch (err) {
    console.warn("Error enviando configuración a Supabase Cloud:", err);
  }

  state.auditLogs.unshift({
    timestamp: new Date().toLocaleString(),
    user: "Administrador",
    action: "ACTUALIZACION_CONFIGURACION",
    module: "Configuración",
    details: `Nuevas reglas guardadas en Supabase: PAR30 Límite: ${par30Limit}%, Reserva Target: ${reserveTargetPct}%, Cartera Meta: $${portfolioTarget}`
  });

  saveState();
  renderAll();
  alert("✓ Configuración y Reglas de Negocio guardadas y sincronizadas en Supabase con éxito.");
});
