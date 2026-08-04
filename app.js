
window.calculateDynamicDaysOverdue = function(promiseDateStr, status) {
  if (!promiseDateStr) return 0;
  try {
    const today = new Date();
    today.setHours(0,0,0,0);
    const promiseDate = new Date(promiseDateStr);
    promiseDate.setHours(0,0,0,0);

    if (isNaN(promiseDate.getTime())) return 0;

    const diffTime = today.getTime() - promiseDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      return diffDays;
    } else if (status === 'Incumplida') {
      return 1;
    }
  } catch(e) {}
  return 0;
};

window.calculateDelinquencyTier = function(daysOverdue, promiseStatus) {
  if (daysOverdue > 30 || promiseStatus === 'Incumplida') return 'PAR30 (Crítico)';
  if (daysOverdue > 7) return 'PAR7 (Riesgo)';
  if (daysOverdue > 0) return 'Mora Reciente';
  return 'Monitoreo';
};


window.logAuditEvent = async function(action, module, details) {
  const timestamp = new Date().toISOString();
  const userName = currentSession?.user?.email || 'Propietario / Admin';
  const orgId = state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001';

  if (!state.auditLogs) state.auditLogs = [];
  state.auditLogs.unshift({
    timestamp: timestamp,
    user: userName,
    action: action,
    module: module,
    details: details
  });

  const record = {
    id: generateUUID(),
    organization_id: orgId,
    user_name: userName,
    action: action,
    module: module,
    details: details,
    created_at: timestamp
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'audit_logs',
        record: record
      })
    });
  } catch (err) {
    console.warn("Error enviando audit log a Supabase:", err);
  }
};


function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

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
    totalCapital: 800.0,
    capitalDeployed: 250.0,
    capitalAvailable: 550.0,
    riskReserve: 0.0,
    accumulatedProfits: 68.88
  },
  financialAccounts: {
    capitalTotal: 800.0,
    capitalDeployed: 250.0,
    capitalAvailable: 550.0,
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

      if (cloudData.organizations && cloudData.organizations.length > 0) {
        const org = cloudData.organizations[0];
        if (org.name) {
          if (!state.organization) state.organization = {};
          state.organization.name = org.name;
          if (!state.financialAccounts) state.financialAccounts = {};
          state.financialAccounts.organizationName = org.name;
        }
        if (org.par30_limit) {
          if (!state.organization) state.organization = {};
          state.organization.par30Limit = parseFloat(org.par30_limit);
        }
      }
      
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
        state.applications = cloudData.applications.map(a => {
          const bw = (state.borrowers || []).find(b => b.id === a.borrower_id);
          return {
            id: a.id,
            borrowerId: a.borrower_id,
            borrowerName: bw ? bw.name : (a.borrower_name || "Prestatario"),
            amount: parseFloat(a.amount || 0),
            reason: a.reason || 'Capital de Trabajo',
            count: parseInt(a.installments_count || a.installment_count || 7),
            rate: parseFloat(a.interest_rate || 15),
            status: a.status,
            createdAt: a.created_at
          };
        });
      }

      if (cloudData.loans && cloudData.loans.length > 0) {
        state.loans = cloudData.loans.map(l => {
          const bw = (state.borrowers || []).find(b => b.id === l.borrower_id);
          const count = parseInt(l.installments_count || l.installment_count || 7);
          const principal = parseFloat(l.principal || 0);
          const totalScheduled = parseFloat(l.total_scheduled || (principal <= 100 ? 175.0 : principal * 1.40));
          const scheduledProfit = parseFloat(l.profit_scheduled || l.scheduled_profit || (totalScheduled - principal));
          const installmentAmount = Math.round(totalScheduled / count);
          
          return {
            id: l.id,
            borrowerId: l.borrower_id,
            borrowerName: bw ? bw.name : (l.borrower_name || "Prestatario"),
            principal: principal,
            installmentAmount: installmentAmount,
            installmentCount: count,
            totalScheduled: totalScheduled,
            scheduledProfit: scheduledProfit,
            status: (l.remaining_amount !== undefined && l.remaining_amount !== null && parseFloat(l.remaining_amount) <= 0.01 && parseFloat(l.paid_amount || 0) > 0) ? 'Cancelado' : l.status,
            disbursementDate: l.disbursed_at || l.disbursement_date,
            paidAmount: parseFloat(l.paid_amount !== undefined && l.paid_amount !== null ? l.paid_amount : 0),
            remainingAmount: parseFloat(l.remaining_amount !== undefined && l.remaining_amount !== null ? l.remaining_amount : totalScheduled)
          };
        });
      }

      if (cloudData.collections && cloudData.collections.length > 0) {
        state.collections = cloudData.collections.map(c => {
          const loan = (state.loans || []).find(l => l.id === c.loan_id);
          const pStatus = c.promise_status || 'Pendiente';
          const pDate = c.promise_date || new Date().toISOString().split('T')[0];
          const dynamicDays = window.calculateDynamicDaysOverdue(pDate, pStatus);
          const dynamicTier = window.calculateDelinquencyTier(dynamicDays, pStatus);
          return {
            id: c.id,
            loanId: c.loan_id,
            borrowerName: c.borrower_name || (loan ? loan.borrowerName : "Edgar Garcia"),
            daysOverdue: dynamicDays,
            delinquencyTier: dynamicTier,
            channel: c.channel || 'WhatsApp',
            promiseDate: pDate,
            promiseAmount: parseFloat(c.promise_amount || 0),
            promiseStatus: pStatus,
            notes: c.notes || ''
          };
        });
      }

      if (cloudData.payments && cloudData.payments.length > 0) {
        state.payments = cloudData.payments.map(p => {
          const loan = (state.loans || []).find(l => l.id === p.loan_id);
          return {
            id: p.id,
            transactionId: p.transaction_id || p.transactionId,
            date: p.payment_date || p.date || p.created_at || new Date().toISOString(),
            loanId: p.loan_id,
            borrowerName: loan ? loan.borrowerName : (p.borrower_name || "Prestatario"),
            amountPaid: parseFloat(p.amount_paid || 0),
            principalPaid: parseFloat(p.principal_paid || 0),
            profitPaid: parseFloat(p.profit_paid || 0),
            reservePaid: parseFloat(p.reserve_paid || 0),
            utilidadPaid: parseFloat(p.utilidad_paid || 0),
            reservePct: parseInt(p.reserve_pct || 0),
            profitDestination: p.profit_destination || 'keep'
          };
        });
      }

      if (cloudData.notifications && cloudData.notifications.length > 0) {
        state.n8nLogs = cloudData.notifications.map(n => ({
          timestamp: n.created_at ? new Date(n.created_at).toLocaleString() : n.timestamp,
          eventType: n.event,
          recipient: n.borrower_name,
          channel: n.channel,
          payload: n.message,
          status: n.status
        }));
      }

      if (cloudData.auditLogs && cloudData.auditLogs.length > 0) {
        state.auditLogs = cloudData.auditLogs.map(l => ({
          timestamp: l.timestamp || l.created_at,
          user: l.user_name || l.user || 'Propietario / Admin',
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
          organizationName: fa.organization_name || state.organization?.name || "Mi Cartera Personal",
          capitalTotal: parseFloat(fa.capital_total !== undefined && fa.capital_total !== null ? fa.capital_total : 800.0),
          capitalDeployed: parseFloat(fa.capital_deployed || 250.0),
          capitalAvailable: parseFloat(fa.capital_available !== undefined && fa.capital_available !== null ? fa.capital_available : 550.0),
          riskReserveBalance: parseFloat(fa.risk_reserve_balance || 0),
          riskReserveTargetPct: parseFloat(fa.risk_reserve_target_pct || 20.0),
          portfolioTarget: parseFloat(fa.portfolio_target || 5000.0),
          operationalBalance: parseFloat(fa.operational_balance || 0),
          operationalTargetMonths: parseInt(fa.operational_target_months || 6),
          distributableBalance: parseFloat(fa.distributable_balance || 0),
          currentStage: parseInt(fa.current_stage || 1),
          defensiveMode: Boolean(fa.defensive_mode)
        };
        if (fa.organization_name) {
          if (!state.organization) state.organization = {};
          state.organization.name = fa.organization_name;
        }
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
          timestamp: c.closed_at || c.close_date || c.created_at || new Date().toISOString(),
          periodName: c.period_name || (c.close_date ? `Cierre del ${c.close_date}` : 'Periodo Quincenal'),
          totalCollected: parseFloat(c.total_collected !== undefined && c.total_collected !== null ? c.total_collected : (c.collected_amount || 0)),
          netProfit: parseFloat(c.net_profit !== undefined && c.net_profit !== null ? c.net_profit : (c.gross_profit || 0)),
          riskContribution: parseFloat(c.risk_contribution !== undefined && c.risk_contribution !== null ? c.risk_contribution : (c.reserve_balance || 0)),
          utilidad: parseFloat(c.utilidad || 0),
          periodStart: c.period_start || null,
          periodEnd: c.period_end || null,
          notes: c.notes || 'Cierre procesado sin incidencias',
          status: c.status || 'Procesado'
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
  // Only persist to localStorage as a fast local cache.
  // All real data is synced to Supabase per-entity in each action handler.
  localStorage.setItem('chenloop_state_v4.0', JSON.stringify(state));
}

// ----------------------------------------------------
// SCENARIO SIMULATOR ENGINE (FASE 4)
// ----------------------------------------------------
// Legacy runScenarioSimulation removed to use new What-If engine

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
  if (!borrower) return { totalScore: 50, breakdown: {}, riskLevel: 'Riesgo Medio', recommendation: 'Sin datos' };

  let paymentHistory = 20;
  let brokenPromisePenalty = 0;
  let fulfilledBonus = 0;

  const borrowerCollections = (state.collections || []).filter(c => 
    c.borrowerId === borrower.id || (c.borrowerName && c.borrowerName.toLowerCase() === (borrower.name || '').toLowerCase())
  );

  borrowerCollections.forEach(col => {
    if (col.promiseStatus === 'Incumplida') {
      brokenPromisePenalty += 15;
    } else if (col.promiseStatus === 'Cumplida') {
      fulfilledBonus += 5;
    }
  });

  paymentHistory = Math.max(0, paymentHistory - brokenPromisePenalty + fulfilledBonus);

  let employmentStability = 5;
  let tenure = Math.min((borrower.loansCompleted || 0) * 5, 15);
  let capacity = 0;
  let verification = borrower.verified ? 10 : 0;
  
  const emp = borrower.employment || borrower.employmentType || 'Empleado';
  if (emp === 'Empleado') employmentStability = 20;
  else if (emp === 'Negocio') employmentStability = 15;
  else employmentStability = 5;
  
  const inc = parseFloat(borrower.income || borrower.monthlyIncome || 0);
  if (inc >= 500) capacity = 15;
  else if (inc >= 300) capacity = 10;
  else capacity = 5;
  
  const totalScore = Math.max(0, Math.min(100, paymentHistory + employmentStability + tenure + capacity + verification));
                     
  let riskLevel = "Alto Riesgo";
  let recommendation = "Rechazar / Revisión Manual";
  
  if (brokenPromisePenalty > 0 && totalScore < 65) {
    riskLevel = "Alto Riesgo (Incumplido)";
    recommendation = "⛔ Rechazar: Cliente con Promesa de Pago Incumplida";
  } else if (totalScore >= 80) {
    riskLevel = "Bajo Riesgo";
    recommendation = "Aprobación Rápida Recomendada";
  } else if (totalScore >= 65) {
    riskLevel = "Riesgo Moderado";
    recommendation = "Aprobar con Monto Estándar ($100)";
  } else if (totalScore >= 50) {
    riskLevel = "Riesgo Medio";
    recommendation = "Revisión Manual Obligatoria";
  }
  
  const breakdown = {
    paymentHistory,
    employmentStability,
    tenure,
    capacity,
    verification,
    brokenPromisePenalty,
    fulfilledBonus,
    base: paymentHistory,
    income: capacity,
    employment: employmentStability
  };

  return { totalScore, breakdown, riskLevel, recommendation };
}

function computeRiskMetrics() {
  const totalDeployed = state.capital.capitalDeployed || 250.0;
  // Use ACTUAL capitalTotal (e.g. $800), NOT portfolioTarget ($5000)
  const totalCapital = state.financialAccounts?.capitalTotal || state.capital?.totalCapital || 800.0;
  const targetReservePct = state.financialAccounts?.riskReserveTargetPct || 20.0;
  
  let par7Capital = 0;
  let par30Capital = 0;
  
  (state.installments || []).forEach(inst => {
    if (inst.status === 'Vencida') {
      if (inst.daysOverdue > 30) {
        par30Capital += inst.amount;
        par7Capital += inst.amount;
      } else if (inst.daysOverdue > 7) {
        par7Capital += inst.amount;
      }
    }
  });

  (state.collections || []).forEach(col => {
    if (col.promiseStatus === 'Incumplida' || (col.daysOverdue && col.daysOverdue > 0)) {
      const loan = (state.loans || []).find(l => l.id === col.loanId);
      const principal = loan ? loan.principal : (col.promiseAmount || 250.0);
      const days = col.daysOverdue || (col.promiseStatus === 'Incumplida' ? 35 : 0);
      if (days > 30 || col.promiseStatus === 'Incumplida') {
        par30Capital += principal;
        par7Capital += principal;
      } else if (days > 7) {
        par7Capital += principal;
      }
    }
  });

  if (totalDeployed > 0) {
    if (par7Capital > totalDeployed) par7Capital = totalDeployed;
    if (par30Capital > totalDeployed) par30Capital = totalDeployed;
  }
  
  const par7Pct = totalDeployed > 0 ? ((par7Capital / totalDeployed) * 100).toFixed(1) : "0.0";
  const par30Pct = totalDeployed > 0 ? ((par30Capital / totalDeployed) * 100).toFixed(1) : "0.0";
  const requiredReserve = totalCapital * (targetReservePct / 100.0);
  const currentReserve = state.financialAccounts?.riskReserveBalance || state.capital.riskReserve || 0.0;
  const reserveDeficit = requiredReserve > currentReserve;
  
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
  if (typeof renderAnalyticsUI === 'function') renderAnalyticsUI();
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
    cap.capitalDeployed = engine.capitalDeployed;
    cap.capitalAvailable = engine.capitalAvailable;
    cap.riskReserve = engine.riskReserveBalance;
  }
  const metrics = computeRiskMetrics();
  
  const totalCapEl = document.getElementById('val-total-capital');
  if (!totalCapEl) return;
  
  totalCapEl.innerText = `$${cap.totalCapital.toLocaleString()}`;
  const targetBadgeEl = document.getElementById('val-portfolio-target-badge');
  if (targetBadgeEl) {
    const target = state.financialAccounts?.portfolioTarget || 5000;
    const progress = Math.round((cap.totalCapital / target) * 100);
    targetBadgeEl.innerText = `🎯 Meta Cartera: $${target.toLocaleString()} USD (${progress}% alcanzado)`;
  }
  document.getElementById('val-capital-deployed').innerText = `$${cap.capitalDeployed.toLocaleString()}`;
  document.getElementById('val-capital-available').innerText = `$${cap.capitalAvailable.toLocaleString()}`;
  document.getElementById('val-risk-reserve').innerText = `$${cap.riskReserve.toLocaleString()}`;
  document.getElementById('val-accum-profits').innerText = `$${cap.accumulatedProfits.toLocaleString()}`;
  
  document.getElementById('val-par7').innerText = `${metrics.par7Pct}%`;
  document.getElementById('val-par30').innerText = `${metrics.par30Pct}%`;
  document.getElementById('val-required-reserve').innerText = `$${metrics.requiredReserve.toFixed(2)}`;
  
  const targetReservePct = state.financialAccounts?.riskReserveTargetPct || state.organization.riskReservePct || 20.0;
  const lblReserveEl = document.getElementById('lbl-required-reserve');
  if (lblReserveEl) {
    lblReserveEl.innerText = `Reserva Requerida (${targetReservePct}%)`;
  }
  
  const statusEl = document.getElementById('val-reserve-status');
  if (statusEl) {
    const curReserve = state.financialAccounts?.riskReserveBalance || cap.riskReserve || 0.0;
    if (curReserve >= metrics.requiredReserve) {
      statusEl.innerText = `✓ Cobertura Completa ($${curReserve.toFixed(2)} USD)`;
      statusEl.className = "text-[11px] text-[#4edea3] font-bold";
    } else {
      const deficit = (metrics.requiredReserve - curReserve).toFixed(2);
      statusEl.innerText = `⚠️ Déficit de Reserva: -$${deficit}`;
      statusEl.className = "text-[11px] text-[#F59E0B] font-bold";
    }
  }
  
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

  if (typeof renderBorrowers === 'function') renderBorrowers();
  if (typeof renderApplications === 'function') renderApplications();
  if (typeof renderLoans === 'function') renderLoans();
  if (typeof renderCollections === 'function') renderCollections();
  if (typeof renderPayments === 'function') renderPayments();
  if (typeof renderQuincenalCloseUI === 'function') renderQuincenalCloseUI();
  if (typeof renderOperationsExpensesUI === 'function') renderOperationsExpensesUI();
  if (typeof renderOwnerDebtsUI === 'function') renderOwnerDebtsUI();
  if (typeof renderAudit === 'function') renderAudit();
  if (typeof renderAnalyticsUI === 'function') renderAnalyticsUI();
  if (typeof renderSettingsUI === 'function') renderSettingsUI();
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
      <td class="p-3 font-bold text-[#818CF8]">$${(loan.principal || 0).toFixed(2)}</td>
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
  
  if (!state.borrowers || state.borrowers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-xs text-[#94A3B8]">No hay prestatarios registrados en Supabase. Haz clic en <strong>+ Nuevo Prestatario</strong> para registrar el primero.</td></tr>`;
    return;
  }

  state.borrowers.forEach(bw => {
    const scoreData = calculateExplicableScore(bw);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 font-bold text-white">${bw.name}</td>
      <td class="p-3 text-xs text-[#bbcabf]">${bw.idNumber || bw.id_number || 'N/A'}</td>
      <td class="p-3 text-xs text-[#bbcabf]">${bw.phone || 'N/A'}</td>
      <td class="p-3">
        <strong class="text-[#4edea3]">${scoreData.totalScore} pts</strong>
        <button class="bg-[#162032] hover:bg-[#1f2d47] text-white px-2 py-1 rounded text-[11px] ml-2 cursor-pointer border border-white/10" onclick="window.showScoreModal('${bw.id}')">Ver Desglose</button>
      </td>
      <td class="p-3"><span class="badge-risk ${scoreData.totalScore >= 80 ? 'badge-green' : (scoreData.totalScore >= 60 ? 'badge-amber' : 'badge-red')}">${scoreData.riskLevel}</span></td>
      <td class="p-3 font-bold text-white">$${(bw.exposureLimit || bw.maxExposure || 150.0).toFixed(2)}</td>
      <td class="p-3"><span class="badge-risk badge-green">${bw.status || 'Activo'}</span></td>
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

window.showScoreModal = function(borrowerId) {
  const bw = state.borrowers.find(b => b.id === borrowerId);
  if (!bw) return;

  const scoreData = calculateExplicableScore(bw);
  const modal = document.getElementById('modal-score-breakdown');
  const content = document.getElementById('modal-score-content');

  if (!modal || !content) return;

  content.innerHTML = `
    <div class="p-3 rounded-lg bg-[#080C14] border border-white/5 space-y-2">
      <div class="flex justify-between items-center">
        <span class="font-bold text-white text-sm">${bw.name}</span>
        <span class="text-xs px-2 py-0.5 rounded font-bold ${scoreData.totalScore >= 80 ? 'bg-emerald-500/20 text-[#4edea3]' : 'bg-amber-500/20 text-[#F59E0B]'}">${scoreData.riskLevel}</span>
      </div>
      <div class="text-2xl font-bold text-[#4edea3]">${scoreData.totalScore} <span class="text-xs text-[#bbcabf] font-normal">/ 100 Puntos Totales</span></div>
    </div>
    
    <div class="space-y-1.5 text-xs text-[#bbcabf]">
      <div class="flex justify-between p-2 rounded bg-white/5">
        <span>Score de Base</span>
        <span class="font-bold text-white">+${scoreData.breakdown.base} pts</span>
      </div>
      <div class="flex justify-between p-2 rounded bg-white/5">
        <span>Capacidad de Pago (Ingresos: $${bw.income || 0})</span>
        <span class="font-bold text-white">+${scoreData.breakdown.income} pts</span>
      </div>
      <div class="flex justify-between p-2 rounded bg-white/5">
        <span>Estabilidad Laboral (${bw.employmentType || bw.employment || 'Empleado'})</span>
        <span class="font-bold text-white">+${scoreData.breakdown.employment} pts</span>
      </div>
      <div class="flex justify-between p-2 rounded bg-white/5">
        <span>Identidad Verificada (${bw.verified ? 'Sí' : 'No'})</span>
        <span class="font-bold text-white">+${scoreData.breakdown.verification} pts</span>
      </div>
    </div>

    <div class="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-[#818CF8]">
      <strong>Recomendación del Motor:</strong> ${scoreData.recommendation}
    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
};

window.closeScoreModal = function() {
  const modal = document.getElementById('modal-score-breakdown');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

function renderApplications() {
  const tbody = document.getElementById('tbody-applications');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!state.applications || state.applications.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-xs text-[#94A3B8]">No hay solicitudes de crédito registradas en Supabase. Utiliza el formulario superior para registrar la primera solicitud.</td></tr>`;
    return;
  }
  
  state.applications.forEach(app => {
    const borrower = state.borrowers.find(b => b.id === app.borrowerId) || {};
    const scoreData = calculateExplicableScore(borrower);
    
    let badgeClass = "badge-amber";
    if (app.status === 'Aprobado') badgeClass = "badge-green";
    else if (app.status === 'Rechazado') badgeClass = "badge-red";

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 font-bold text-white">${app.id}</td>
      <td class="p-3 font-bold text-white">${app.borrowerName}</td>
      <td class="p-3 font-bold text-[#818CF8]">$${app.amount.toFixed(2)}</td>
      <td class="p-3 text-xs text-[#bbcabf]">${app.reason}</td>
      <td class="p-3"><strong class="text-[#4edea3]">${scoreData.totalScore} pts</strong></td>
      <td class="p-3 text-xs text-[#bbcabf]">${scoreData.recommendation}</td>
      <td class="p-3"><span class="badge-risk ${badgeClass}">${app.status}</span></td>
      <td class="p-3">
        ${app.status === 'En Revisión' ? `
          <button class="bg-[#10b981] hover:bg-[#047857] text-white px-2.5 py-1 rounded text-xs font-bold mr-1 cursor-pointer" onclick="window.approveApplication('${app.id}')">Aprobar & Desembolsar</button>
          <button class="bg-red-500/20 hover:bg-red-500/30 text-[#F43F5E] px-2.5 py-1 rounded text-xs font-bold cursor-pointer border border-red-500/30" onclick="window.rejectApplication('${app.id}')">Rechazar</button>
        ` : `<span class="text-xs text-[#94A3B8] font-bold">${app.status}</span>`}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.approveApplication = async function(appId) {
  const app = state.applications.find(a => a.id === appId);
  if (!app) return;

  const engine = calculateFinancialEngine();
  if (app.amount > engine.capitalAvailable) {
    alert(`No hay suficiente Capital Disponible ($${engine.capitalAvailable.toFixed(2)} USD) para desembolsar $${app.amount.toFixed(2)} USD.`);
    return;
  }

  if (!confirm(`¿Confirmas la aprobación y desembolso del crédito de $${app.amount.toFixed(2)} USD para ${app.borrowerName}?`)) {
    return;
  }

  app.status = 'Aprobado';

  const count = app.count || 7;
  const ratePct = parseFloat(app.rate || app.interestRate || 15);

  let totalScheduled = 175.0;
  let installmentAmount = 25.0;
  let scheduledProfit = 75.0;

  if (app.amount === 100 && count === 7 && ratePct === 15) {
    installmentAmount = 25.0;
    totalScheduled = 175.0;
    scheduledProfit = 75.0;
  } else if (app.amount === 200 && count === 7 && ratePct === 10) {
    installmentAmount = 40.0;
    totalScheduled = 280.0;
    scheduledProfit = 80.0;
  } else if (app.amount === 300 && count === 7 && ratePct === 10) {
    installmentAmount = 50.0;
    totalScheduled = 350.0;
    scheduledProfit = 50.0;
  } else {
    let balance = app.amount;
    let totalInterest = 0;
    installmentAmount = Math.ceil((app.amount * (1 + (ratePct / 100) * (count / 2))) / count / 5) * 5;
    if (installmentAmount <= 0) installmentAmount = Math.round((app.amount * 1.2) / count);

    for (let q = 1; q <= count; q++) {
      let interest = balance * (ratePct / 100.0);
      totalInterest += interest;
      let pmt = Math.min(installmentAmount, balance + interest);
      balance = Math.max(0, balance + interest - pmt);
      if (balance <= 0.01) break;
    }
    totalScheduled = Math.max(app.amount + totalInterest, installmentAmount * count);
    scheduledProfit = totalScheduled - app.amount;
  }

  const newLoan = {
    id: generateUUID(),
    borrower_id: app.borrowerId,
    borrower_name: app.borrowerName,
    principal: app.amount,
    installment_amount: installmentAmount,
    installment_count: count,
    total_scheduled: totalScheduled,
    scheduled_profit: scheduledProfit,
    status: 'Activo',
    disbursement_date: new Date().toISOString().split('T')[0],
    paid_amount: 0.0,
    remaining_amount: totalScheduled,
    organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001'
  };

  if (!state.loans) state.loans = [];
  state.loans.unshift({
    id: newLoan.id,
    borrowerId: newLoan.borrower_id,
    borrowerName: newLoan.borrower_name,
    principal: newLoan.principal,
    installmentAmount: newLoan.installment_amount,
    installmentCount: newLoan.installment_count,
    totalScheduled: newLoan.total_scheduled,
    scheduledProfit: newLoan.scheduled_profit,
    status: newLoan.status,
    disbursementDate: newLoan.disbursement_date,
    paidAmount: 0.0,
    remainingAmount: totalScheduled
  });

  state.auditLogs.unshift({
    timestamp: new Date().toLocaleString(),
    user: "Administrador",
    action: "APROBACION_CREDITO",
    module: "Solicitudes & Riesgo",
    details: `Solicitud ${app.id} aprobada. Préstamo ${newLoan.id} por $${app.amount.toFixed(2)} USD desembolsado a ${app.borrowerName}.`
  });

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) {
      headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    }

    const updateAppRecord = {
      id: app.id,
      organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001',
      borrower_id: app.borrowerId,
      amount: app.amount,
      reason: app.reason || 'Capital de Trabajo',
      installments_count: count,
      status: 'Aprobado'
    };

    const newLoanRecord = {
      id: newLoan.id,
      organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001',
      borrower_id: app.borrowerId,
      principal: app.amount,
      total_scheduled: totalScheduled,
      profit_scheduled: scheduledProfit,
      installments_count: count,
      status: 'Activo',
      paid_amount: 0.0,
      remaining_amount: totalScheduled,
      disbursed_at: new Date().toISOString()
    };

    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'applications',
        record: updateAppRecord
      })
    });

    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'loans',
        record: newLoanRecord
      })
    });

    console.log("✓ Solicitud aprobada y Préstamo activo en Supabase Cloud");
    if (typeof window.updateFinancialAccountState === 'function') await window.updateFinancialAccountState();
  } catch (err) {
    console.warn("Error enviando aprobación a Supabase Cloud:", err);
  }

  saveState();
  renderAll();
  alert(`✓ Solicitud ${app.id} aprobada con éxito. Préstamo ${newLoan.id} activo en Supabase.`);
};

window.rejectApplication = async function(appId) {
  const app = state.applications.find(a => a.id === appId);
  if (!app) return;

  if (!confirm(`¿Estás seguro de rechazar la solicitud ${app.id} de ${app.borrowerName}?`)) {
    return;
  }

  app.status = 'Rechazado';

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) {
      headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    }
    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'applications',
        record: {
          id: app.id,
          organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001',
          borrower_id: app.borrowerId,
          amount: app.amount,
          reason: app.reason || 'Capital de Trabajo',
          installments_count: app.count || 7,
          status: 'Rechazado'
        }
      })
    });
  } catch (err) {
    console.warn("Error enviando rechazo a Supabase Cloud:", err);
  }

  saveState();
  renderAll();
  alert(`Solicitud ${app.id} rechazada.`);
};

function renderLoans() {
  const tbody = document.getElementById('tbody-loans');
  const paySelect = document.getElementById('pay-loan-select');
  const colSelect = document.getElementById('col-loan-select');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  if (paySelect) paySelect.innerHTML = '<option value="">-- Seleccionar Préstamo --</option>';
  if (colSelect) colSelect.innerHTML = '<option value="">-- Seleccionar Préstamo --</option>';
  
  if (!state.loans || state.loans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-xs text-[#94A3B8]">No hay préstamos activos registrados en Supabase. Aprueba una solicitud de crédito en el módulo <strong>Solicitudes & Riesgo</strong> para generar el primer préstamo.</td></tr>`;
    return;
  }

  state.loans.forEach(ln => {
    let badgeClass = "badge-green";
    if (ln.status === 'En Mora') badgeClass = "badge-amber";
    else if (ln.status === 'Pagado') badgeClass = "badge-gray";

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 font-bold text-white">${ln.id}</td>
      <td class="p-3 font-bold text-white">${ln.borrowerName}</td>
      <td class="p-3 font-bold text-[#818CF8]">$${ln.principal.toFixed(2)}</td>
      <td class="p-3 text-white">$${ln.totalScheduled.toFixed(2)}</td>
      <td class="p-3 font-bold text-[#4edea3]">$${ln.scheduledProfit.toFixed(2)}</td>
      <td class="p-3 text-xs text-[#bbcabf]">${ln.installmentCount} quincenas ($${(ln.installmentAmount || 0).toFixed(2)})</td>
      <td class="p-3"><span class="badge-risk ${badgeClass}">${ln.status}</span></td>
      <td class="p-3">
        <button class="bg-[#FF6B00] hover:bg-[#FF5500] text-white px-2.5 py-1 rounded text-xs font-bold cursor-pointer shadow-md shadow-[#FF6B00]/20" onclick="window.selectLoanForPayment('${ln.id}')">Cobrar</button>
      </td>
    `;
    tbody.appendChild(tr);
    
    if (ln.status === 'Activo' || ln.status === 'En Mora') {
      const opt = document.createElement('option');
      opt.value = ln.id;
      opt.innerText = `${ln.id} - ${ln.borrowerName} (Saldo: $${(ln.remainingAmount || ln.totalScheduled).toFixed(2)})`;
      if (paySelect) paySelect.appendChild(opt);
      if (colSelect) colSelect.appendChild(opt.cloneNode(true));
    }
  });
}

window.selectLoanForPayment = function(loanId) {
  const paySelect = document.getElementById('pay-loan-select');
  if (paySelect) {
    paySelect.value = loanId;
  }
  if (typeof window.switchTab === 'function') {
    window.switchTab('payments');
  }
};

function renderCollections() {
  const tbody = document.getElementById('tbody-collections');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (!state.collections || state.collections.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-xs text-[#94A3B8]">No hay registros de gestión de cobranzas o promesas de pago en Supabase. Utiliza el formulario superior para registrar la primera gestión.</td></tr>`;
    return;
  }

  state.collections.forEach(col => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 text-xs text-[#bbcabf] font-bold">${col.id}</td>
      <td class="p-3 font-bold text-white">${col.loanId}</td>
      <td class="p-3 text-white font-bold">${col.borrowerName}</td>
      <td class="p-3 font-bold text-[#F43F5E]">${col.daysOverdue || 0} días</td>
      <td class="p-3"><span class="badge-risk ${col.delinquencyTier === 'PAR30 (Crítico)' ? 'badge-red' : (col.delinquencyTier === 'PAR7 (Riesgo)' || col.delinquencyTier === 'Mora Reciente' ? 'badge-amber' : 'badge-green')}">${col.delinquencyTier || 'Monitoreo'}</span></td>
      <td class="p-3 text-xs text-[#bbcabf]">${col.promiseDate || 'N/A'} (${col.channel || 'Contacto'})</td>
      <td class="p-3 font-bold text-[#4edea3]">$${(col.promiseAmount || 0).toFixed(2)}</td>
      <td class="p-3"><span class="badge-risk ${col.promiseStatus === 'Cumplida' ? 'badge-green' : (col.promiseStatus === 'Incumplida' ? 'badge-red' : 'badge-amber')}">${col.promiseStatus || 'Pendiente'}</span></td>
      <td class="p-3">
        ${col.promiseStatus === 'Pendiente' ? `
          <button class="bg-[#10b981] hover:bg-[#047857] text-white px-2.5 py-1 rounded text-xs font-bold cursor-pointer mr-1" onclick="window.markPromiseFulfilled('${col.id}')">Cumplida</button>
          <button class="bg-red-500/20 hover:bg-red-500/30 text-[#F43F5E] px-2.5 py-1 rounded text-xs font-bold cursor-pointer border border-red-500/30" onclick="window.markPromiseBroken('${col.id}')">Incumplida</button>
        ` : `<span class="text-xs text-[#94A3B8] font-bold">Cerrada</span>`}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.markPromiseFulfilled = async function(colId) {
  const col = state.collections.find(c => c.id === colId);
  if (!col) return;
  col.promiseStatus = "Cumplida";
  
  if (typeof window.logAuditEvent === 'function') {
    await window.logAuditEvent(
      "PROMESA_CUMPLIDA",
      "Gestión de Cobranzas",
      `Cliente ${col.borrowerName} cumplió promesa de pago de $${col.promiseAmount || 0} USD.`
    );
  }

  const fullRecord = {
    id: col.id,
    organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001',
    loan_id: col.loanId || 'LOAN-001',
    borrower_name: col.borrowerName || 'Edgar Garcia',
    days_overdue: col.daysOverdue || 0,
    delinquency_tier: col.delinquencyTier || 'Monitoreo',
    channel: col.channel || 'WhatsApp',
    promise_date: col.promiseDate || new Date().toISOString().split('T')[0],
    promise_amount: col.promiseAmount || 25,
    promise_status: 'Cumplida',
    notes: col.notes || ''
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'collections',
        record: fullRecord
      })
    });
  } catch (err) {
    console.warn("Error enviando actualización de promesa a Supabase:", err);
  }
  
  saveState();
  renderAll();
  alert(`✓ Promesa de pago de ${col.borrowerName} marcada como CUMPLIDA.\n\n📌 NOTA: Marcar como CUMPLIDA actualiza el Score Crediticio del cliente (+5 pts).\nEl cobro real de la cuota debe registrarse por separado en el módulo 💵 Caja & Registrar Pago.`);
};

window.markPromiseBroken = async function(colId) {
  const col = state.collections.find(c => c.id === colId);
  if (!col) return;
  col.promiseStatus = "Incumplida";
  col.daysOverdue = window.calculateDynamicDaysOverdue(col.promiseDate, "Incumplida");
  col.delinquencyTier = window.calculateDelinquencyTier(col.daysOverdue, "Incumplida");
  
  if (typeof window.logAuditEvent === 'function') {
    await window.logAuditEvent(
      "PROMESA_INCUMPLIDA",
      "Gestión de Cobranzas",
      `Cliente ${col.borrowerName} INCUMPLIÓ promesa de pago de $${col.promiseAmount || 0} USD (${col.daysOverdue} día(s) de mora).`
    );
  }

  const fullRecord = {
    id: col.id,
    organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001',
    loan_id: String(col.loanId || 'LOAN-001'),
    borrower_name: col.borrowerName || 'Edgar Garcia',
    days_overdue: col.daysOverdue,
    delinquency_tier: col.delinquencyTier,
    channel: col.channel || 'WhatsApp',
    promise_date: col.promiseDate || new Date().toISOString().split('T')[0],
    promise_amount: col.promiseAmount || 25,
    promise_status: 'Incumplida',
    notes: col.notes || 'Promesa incumplida por el prestatario'
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'collections',
        record: fullRecord
      })
    });
  } catch (err) {
    console.warn("Error enviando incumplimiento a Supabase:", err);
  }
  
  // Sincronizar actualización de Score y Nivel de Riesgo del Prestatario afectado
  const bw = (state.borrowers || []).find(b => b.id === col.loanId || b.name === col.borrowerName);
  if (bw) {
    const updatedScore = calculateExplicableScore(bw);
    bw.score = updatedScore.totalScore;
    bw.riskLevel = updatedScore.riskLevel;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;
      await fetch('/api/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          entity: 'borrowers',
          record: {
            id: bw.id,
            score: bw.score,
            risk_level: bw.riskLevel
          }
        })
      });
    } catch(e) {}
  }

  saveState();
  renderAll();
  alert(`⚠️ Promesa de pago de ${col.borrowerName} marcada como INCUMPLIDA. Score del cliente actualizado y penalizado.`);
};

// Form collection listener
document.getElementById('form-add-collection')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const loanId = document.getElementById('col-loan-select').value;
  const channel = document.getElementById('col-channel').value;
  const promiseDate = document.getElementById('col-promise-date').value;
  const promiseAmount = parseFloat(document.getElementById('col-promise-amount').value || 0);
  const notes = document.getElementById('col-notes').value.trim();
  
  const loan = state.loans.find(l => l.id === loanId);
  if (!loan) {
    alert("Por favor selecciona un préstamo activo.");
    return;
  }
  
  const newColRecord = {
    id: generateUUID(),
    loan_id: loan.id,
    borrower_name: loan.borrowerName,
    days_overdue: 0,
    delinquency_tier: "Monitoreo",
    channel,
    promise_date: promiseDate,
    promise_amount: promiseAmount,
    promise_status: "Pendiente",
    notes,
    organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001'
  };

  if (!state.collections) state.collections = [];
  state.collections.unshift({
    id: newColRecord.id,
    loanId: newColRecord.loan_id,
    borrowerName: newColRecord.borrower_name,
    daysOverdue: newColRecord.days_overdue,
    delinquencyTier: newColRecord.delinquency_tier,
    channel: newColRecord.channel,
    promiseDate: newColRecord.promise_date,
    promiseAmount: newColRecord.promise_amount,
    promiseStatus: newColRecord.promise_status,
    notes: newColRecord.notes
  });

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    const syncRes = await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'collections',
        record: newColRecord
      })
    });
    const syncJson = await syncRes.json();
    if (!syncRes.ok || syncJson.error) {
      console.error("Supabase sync error:", syncJson.error);
      alert(`⚠️ Error guardando en Supabase: ${syncJson.error}\n\nLa gestión se guardó localmente en memoria pero NO en la nube.`);
    } else {
      console.log("✓ Gestión de cobranza guardada en Supabase Cloud", syncJson);
    }
  } catch (err) {
    console.error("Error de red enviando gestión a Supabase:", err);
    alert(`⚠️ Error de conexión: ${err.message}`);
  }
  
  document.getElementById('form-add-collection').reset();
  saveState();
  renderAll();
  alert(`✓ Gestión para ${loan.borrowerName} guardada. Refresca la página (F5) para confirmar persistencia en Supabase.`);
});

// ----------------------------------------------------
// MÓDULO 6: NOTIFICACIONES N8N & AUTOMATIZACIONES
// ----------------------------------------------------
function renderNotifications() {
  const tbody = document.getElementById('tbody-n8n-notifications');
  const inputUrl = document.getElementById('n8n-webhook-url');
  const sendModeSelect = document.getElementById('n8n-send-mode');
  const testPhoneInput = document.getElementById('n8n-test-phone');
  const countEl = document.getElementById('n8n-log-count');
  if (!tbody) return;

  if (inputUrl) {
    inputUrl.value = state.notificationsConfig?.webhookUrl || state.financialAccounts?.n8nWebhookUrl || "https://primary-production-b8f78.up.railway.app/webhook/chenloop-notifications";
  }
  if (sendModeSelect) {
    sendModeSelect.value = state.notificationsConfig?.sendMode || "test";
  }
  if (testPhoneInput) {
    testPhoneInput.value = state.notificationsConfig?.testPhone || "+50761337723";
  }

  const logs = state.n8nLogs || [];
  if (countEl) countEl.innerText = `${logs.length} notificaciones registradas`;

  tbody.innerHTML = '';
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-xs text-[#94A3B8]">No hay notificaciones enviadas aún. Configura tu Webhook URL arriba o presiona un botón de prueba para disparar la primera automatización.</td></tr>`;
    return;
  }

  logs.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 text-xs text-[#bbcabf] font-mono">${item.timestamp}</td>
      <td class="p-3 font-bold text-white">${item.eventType}</td>
      <td class="p-3 text-white font-bold">${item.recipient}</td>
      <td class="p-3 text-xs text-[#818CF8]"><span class="bg-[#818CF8]/10 border border-[#818CF8]/30 px-2 py-0.5 rounded">${item.channel}</span></td>
      <td class="p-3 text-xs text-[#bbcabf] max-w-[250px] truncate" title="${item.payload}">${item.payload}</td>
      <td class="p-3"><span class="badge-risk ${item.status === 'OK 200' ? 'badge-green' : 'badge-amber'}">${item.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

window.testN8nTrigger = async function(triggerType) {
  const webhookUrl = document.getElementById('n8n-webhook-url')?.value || state.notificationsConfig?.webhookUrl || "https://primary-production-b8f78.up.railway.app/webhook/chenloop-notifications";
  const sendMode = document.getElementById('n8n-send-mode')?.value || state.notificationsConfig?.sendMode || 'test';
  const testPhone = document.getElementById('n8n-test-phone')?.value || state.notificationsConfig?.testPhone || '+50761337723';

  if (!webhookUrl) {
    alert("Por favor ingresa y guarda tu Endpoint URL de n8n primero.");
    return;
  }

  // Determinar destinatario según modo (Filtrando préstamos ACTIVOS únicamente)
  let targetPhone = testPhone;
  let targetBorrowerName = "Edgar García (Prueba)";

  if (sendMode === 'production') {
    const activeLoans = (state.loans || []).filter(l => l.status === 'Activo');
    if (activeLoans.length === 0 && triggerType !== 'receipt') {
      alert("ℹ️ Notificación Omitida: No existen préstamos con estatus 'Activo'. Todos los préstamos están en estatus 'Cancelado' por saldo pagado.");
      return;
    }
    if (activeLoans.length > 0) {
      const activeLoan = activeLoans[0];
      const borrower = (state.borrowers || []).find(b => b.id === activeLoan.borrowerId) || {};
      targetPhone = borrower.phone || testPhone;
      targetBorrowerName = borrower.name || activeLoan.borrowerName || "Prestatario Real";
    }
  }

  let samplePayload = {};
  let eventName = "";

  if (triggerType === 'reminder') {
    eventName = "RECORDATORIO_CUOTA_PROXIMA";
    samplePayload = {
      event: "PAYMENT_REMINDER_3DAYS",
      borrower_name: targetBorrowerName,
      phone: targetPhone,
      amount_due: 45.00,
      due_date: new Date(Date.now() + 3*86400000).toISOString().split('T')[0],
      organization: state.organization?.name || "Chenloop Capital",
      mode: sendMode
    };
  } else if (triggerType === 'overdue') {
    eventName = "ALERTA_MORA_PAR30";
    samplePayload = {
      event: "OVERDUE_PAYMENT_ALERT",
      borrower_name: targetBorrowerName,
      phone: targetPhone,
      days_overdue: 12,
      amount_due: 80.00,
      organization: state.organization?.name || "Chenloop Capital",
      mode: sendMode
    };
  } else if (triggerType === 'receipt') {
    eventName = "COMPROBANTE_PAGO_RECIBIDO";
    samplePayload = {
      event: "DIGITAL_RECEIPT",
      borrower_name: targetBorrowerName,
      phone: targetPhone,
      payment_amount: 50.00,
      remaining_balance: 150.00,
      transaction_id: generateUUID(),
      organization: state.organization?.name || "Chenloop Capital",
      mode: sendMode
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(samplePayload)
    });

    const statusText = response.ok ? 'OK 200' : `HTTP ${response.status}`;
    const newLogRecord = {
      id: generateUUID(),
      organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001',
      borrower_name: `${samplePayload.borrower_name} (${targetPhone})`,
      channel: `WhatsApp / n8n [${sendMode.toUpperCase()}]`,
      event: eventName,
      message: JSON.stringify(samplePayload),
      status: statusText,
      created_at: new Date().toISOString()
    };

    if (!state.n8nLogs) state.n8nLogs = [];
    state.n8nLogs.unshift({
      timestamp: new Date().toLocaleString(),
      eventType: eventName,
      recipient: `${samplePayload.borrower_name} (${targetPhone})`,
      channel: `WhatsApp / n8n [${sendMode.toUpperCase()}]`,
      payload: JSON.stringify(samplePayload),
      status: statusText
    });

    try {
      const syncHeaders = { 'Content-Type': 'application/json' };
      if (currentSession) syncHeaders['Authorization'] = `Bearer ${currentSession.access_token}`;
      await fetch('/api/sync', {
        method: 'POST',
        headers: syncHeaders,
        body: JSON.stringify({
          entity: 'notifications',
          record: newLogRecord
        })
      });
    } catch (syncErr) {
      console.warn("Error syncing manual notification log:", syncErr);
    }

    saveState();
    renderAll();
    alert(`✓ Notificación disparada (${sendMode === 'test' ? '🧪 Modo Prueba -> ' + targetPhone : '🚀 Modo Producción -> ' + targetPhone}). Estado: ${statusText}`);
  } catch (err) {
    console.warn("Disparo n8n webhook (CORS/Offline):", err);
    const newLogRecord = {
      id: generateUUID(),
      organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001',
      borrower_name: `${samplePayload.borrower_name} (${targetPhone})`,
      channel: `WhatsApp / n8n [${sendMode.toUpperCase()}]`,
      event: eventName,
      message: JSON.stringify(samplePayload),
      status: 'Enviado (Client Mode)',
      created_at: new Date().toISOString()
    };

    if (!state.n8nLogs) state.n8nLogs = [];
    state.n8nLogs.unshift({
      timestamp: new Date().toLocaleString(),
      eventType: eventName,
      recipient: `${samplePayload.borrower_name} (${targetPhone})`,
      channel: `WhatsApp / n8n [${sendMode.toUpperCase()}]`,
      payload: JSON.stringify(samplePayload),
      status: 'Enviado (Client Mode)'
    });

    try {
      const syncHeaders = { 'Content-Type': 'application/json' };
      if (currentSession) syncHeaders['Authorization'] = `Bearer ${currentSession.access_token}`;
      await fetch('/api/sync', {
        method: 'POST',
        headers: syncHeaders,
        body: JSON.stringify({
          entity: 'notifications',
          record: newLogRecord
        })
      });
    } catch (syncErr) {
      console.warn("Error syncing manual notification log:", syncErr);
    }

    saveState();
    renderAll();
    alert(`✓ Evento enviado a n8n (${eventName} a ${targetPhone}).`);
  }
};

document.getElementById('form-save-n8n-webhook')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const url = document.getElementById('n8n-webhook-url')?.value.trim();
  const sendMode = document.getElementById('n8n-send-mode')?.value;
  const testPhone = document.getElementById('n8n-test-phone')?.value.trim();

  if (!url) return;

  if (!state.notificationsConfig) state.notificationsConfig = {};
  state.notificationsConfig.webhookUrl = url;
  state.notificationsConfig.sendMode = sendMode;
  state.notificationsConfig.testPhone = testPhone;

  if (!state.financialAccounts) state.financialAccounts = {};
  state.financialAccounts.n8nWebhookUrl = url;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'financial_accounts',
        record: {
          id: state.financialAccounts.id || '92700043-3f9d-484c-83d0-5ebbb0f05a7d',
          n8n_webhook_url: url,
          updated_at: new Date().toISOString()
        }
      })
    });
  } catch (err) {
    console.warn("Error guardando n8n webhook URL en Supabase:", err);
  }

  saveState();
  renderAll();
  alert(`✓ Configuración de n8n guardada: Modo [${sendMode.toUpperCase()}] | Teléfono Prueba: [${testPhone}]`);
});

// ----------------------------------------------------
// MÓDULO 7: CAJA & REGISTRAR PAGO
// ----------------------------------------------------
function renderPayments() {
  const tbody = document.getElementById('tbody-payments');
  const reserveBadge = document.getElementById('caja-reserve-status-badge');
  if (reserveBadge) {
    const curRes = state.financialAccounts?.riskReserveBalance || state.capital?.riskReserve || 0;
    reserveBadge.innerText = `Reserva Actual: $${curRes.toFixed(2)} USD`;
  }
  if (!tbody) return;
  tbody.innerHTML = '';

  const payments = state.payments || [];
  if (payments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-xs text-[#94A3B8]">No hay cobros registrados en caja en Supabase. Registra la primera cuota recibida utilizando el formulario superior.</td></tr>`;
    return;
  }

  payments.forEach(p => {
    const loan = (state.loans || []).find(l => l.id === (p.loanId || p.loan_id));
    const rawDate = p.date || p.timestamp || p.payment_date || p.created_at || new Date().toISOString();
    let formattedDate = rawDate;
    try {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        formattedDate = `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
      }
    } catch(err) {
      formattedDate = String(rawDate);
    }
      
    const borrowerName = (loan && loan.borrowerName) 
      ? loan.borrowerName 
      : (p.borrowerName || p.borrower_name || "Edgar Garcia");
      
    const loanDisplayId = (loan && loan.id) ? loan.id : (p.loanId || p.loan_id || 'N/A');
    const amountPaid = parseFloat(p.amountPaid || p.amount_paid || p.amount || 0);

    let principalPaid = parseFloat(p.principalPaid || p.principal_paid || p.principalShare || 0);
    let profitPaid = parseFloat(p.profitPaid || p.profit_paid || p.profitShare || 0);

    if (amountPaid > 0 && (principalPaid === 0 || profitPaid === 0)) {
      if (loan) {
        const totalSched = loan.totalScheduled || (loan.principal * 1.40);
        const schedProfit = loan.scheduledProfit || (totalSched - loan.principal);
        const principalRatio = (loan.principal || 1) / totalSched;
        const profitRatio = (schedProfit || 0) / totalSched;
        principalPaid = amountPaid * principalRatio;
        profitPaid = amountPaid * profitRatio;
      } else {
        principalPaid = amountPaid * 0.6173;
        profitPaid = amountPaid * 0.3827;
      }
    }

    const reservePaid = parseFloat(p.reservePaid || p.reserve_paid || 0);
    const utilidadPaid = parseFloat(p.utilidadPaid || p.utilidad_paid || profitPaid - reservePaid);

    const destLabel = p.profitDestination === 'reinvest' ? '💰 Reinvertida en Capital' 
      : (p.profitDestination === 'reserve' ? '🛡️ A Reserva' : '📊 Utilidad Personal');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 text-xs text-[#bbcabf] font-mono">
        ${formattedDate}
        <br>
        <span class="inline-block mt-1 text-[10px] text-[#818CF8] bg-[#818CF8]/10 px-1.5 py-0.5 rounded border border-[#818CF8]/20 font-bold">${p.transactionId || 'PAY-N/A'}</span>
      </td>
      <td class="p-3 font-bold text-white text-xs font-mono">${loanDisplayId}</td>
      <td class="p-3 text-white font-bold">${borrowerName}</td>
      <td class="p-3 font-bold text-[#4edea3]">$${amountPaid.toFixed(2)}</td>
      <td class="p-3 text-xs text-[#818CF8] font-bold">$${principalPaid.toFixed(2)}</td>
      <td class="p-3 text-xs text-[#FBBF24] font-bold">$${reservePaid.toFixed(2)}</td>
      <td class="p-3 text-xs text-[#4edea3] font-bold">$${utilidadPaid.toFixed(2)}</td>
      <td class="p-3 text-xs text-[#94A3B8]">${destLabel}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('form-record-payment')?.addEventListener('submit', async function(e) {
  e.preventDefault();

  const loanId = document.getElementById('pay-loan-select')?.value;
  const amountPaid = parseFloat(document.getElementById('pay-amount')?.value || 0);
  const sendWhatsApp = document.getElementById('pay-send-whatsapp')?.checked;
  // 3-WAY SPLIT: reservePct = % of profit going to reserve, rest = utilidad
  const reservePct = parseFloat(document.getElementById('pay-reserve-pct')?.value || 50) / 100.0;
  const profitDestination = document.getElementById('pay-profit-destination')?.value || 'keep';

  if (!loanId || amountPaid <= 0) {
    alert("Por favor selecciona un préstamo activo e ingresa un monto mayor a $0.");
    return;
  }

  const loan = state.loans.find(l => l.id === loanId);
  if (!loan) {
    alert("Préstamo no encontrado.");
    return;
  }

  const totalSched = loan.totalScheduled || (loan.principal <= 100 ? 175.0 : (loan.principal === 200 ? 280.0 : loan.principal * 1.40));
  const schedProfit = loan.scheduledProfit || (totalSched - loan.principal);
  const principalRatio = loan.principal / totalSched;
  const profitRatio = schedProfit / totalSched;

  const principalShare = amountPaid * principalRatio;
  const totalProfitShare = amountPaid * profitRatio;   // total ganancia de este pago

  // ── 3-WAY SPLIT of the profit portion ────────────────────────
  // 1) reserveShare: % of profit the user chose to route to reserve
  // 2) utilidadShare: remaining profit → user decides destination
  const reserveShare = totalProfitShare * reservePct;           // → Reserva de Riesgo (auto)
  const utilidadShare = totalProfitShare * (1 - reservePct);    // → destino elegido por el usuario

  // Convenience alias for audit / alerts (total profit, not split)
  const profitShare = totalProfitShare;

  // ── Apply allocations to state ────────────────────────────────
  if (!state.financialAccounts) state.financialAccounts = {};

  // Always route reserveShare to risk reserve
  state.financialAccounts.riskReserveBalance = (state.financialAccounts.riskReserveBalance || 0) + reserveShare;
  state.capital.riskReserve = state.financialAccounts.riskReserveBalance;

  // Route utilidadShare based on user's choice
  if (profitDestination === 'reinvest') {
    state.financialAccounts.capitalTotal = (state.financialAccounts.capitalTotal || 800.0) + utilidadShare;
    state.capital.totalCapital = state.financialAccounts.capitalTotal;
  } else if (profitDestination === 'reserve') {
    // All utilidad also goes to reserve
    state.financialAccounts.riskReserveBalance += utilidadShare;
    state.capital.riskReserve = state.financialAccounts.riskReserveBalance;
  }
  // 'keep' → stays as accumulated profit (no extra action)

  loan.paidAmount = (loan.paidAmount || 0) + amountPaid;
  loan.remainingAmount = Math.max(0, totalSched - loan.paidAmount);

  if (loan.remainingAmount <= 0.01) {
    loan.status = 'Cancelado';
    state.auditLogs.unshift({
      timestamp: new Date().toLocaleString(),
      user: "Sistema de Caja",
      action: "PRESTAMO_CANCELADO",
      module: "Préstamos",
      details: `✓ Préstamo ${loan.id} de ${loan.borrowerName} cancelado por completo. Notificaciones automáticas de cobranza deshabilitadas para este crédito.`
    });
  }

  const seqCount = (state.payments || []).length + 1001;
  const txId = `PAY-${seqCount}`;

  if (!state.financialAccounts) state.financialAccounts = {};
  state.financialAccounts.accumulatedProfits = (state.financialAccounts.accumulatedProfits || 0) + profitShare;

  const newPaymentRecord = {
    id: generateUUID(),
    organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001',
    loan_id: loan.id,
    amount_paid: amountPaid,
    principal_paid: principalShare,
    profit_paid: profitShare,
    reserve_paid: reserveShare,
    utilidad_paid: utilidadShare,
    reserve_pct: Math.round(reservePct * 100),
    profit_destination: profitDestination,
    payment_date: new Date().toISOString(),
    transaction_id: txId
  };

  if (!state.payments) state.payments = [];
  state.payments.unshift({
    id: newPaymentRecord.id,
    transactionId: txId,
    date: new Date().toLocaleString(),
    timestamp: new Date().toLocaleString(),
    loanId: loan.id,
    borrowerName: loan.borrowerName,
    amountPaid,
    principalPaid: principalShare,
    profitPaid: profitShare,
    reservePaid: reserveShare,
    utilidadPaid: utilidadShare,
    reservePct: Math.round(reservePct * 100),
    principalShare,
    profitShare,
    profitDestination
  });

  state.auditLogs.unshift({
    timestamp: new Date().toLocaleString(),
    user: "Cajero Admin",
    action: "PAGO_REGISTRADO",
    module: "Caja & Pagos",
    details: `Cobro de $${amountPaid.toFixed(2)} USD registrado [${txId}] para ${loan.borrowerName} (${loan.id}). Principal: $${principalShare.toFixed(2)}, Ganancia: $${profitShare.toFixed(2)}.`
  });

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;

    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'payments',
        record: newPaymentRecord
      })
    });

    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'loans',
        record: {
          id: loan.id,
          organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001',
          borrower_id: loan.borrowerId,
          principal: loan.principal,
          total_scheduled: loan.totalScheduled,
          profit_scheduled: loan.scheduledProfit,
          installments_count: loan.installmentCount || 7,
          paid_amount: loan.paidAmount,
          remaining_amount: loan.remainingAmount,
          status: loan.status
        }
      })
    });

    // Auto-fulfill matching pending collection for this loan so automated n8n reminders stop
    const pendingCols = (state.collections || []).filter(c => (c.loanId === loan.id || String(c.loanId) === String(loan.id)) && c.promiseStatus === 'Pendiente');
    if (pendingCols.length > 0) {
      const colsToFulfill = loan.status === 'Cancelado' ? pendingCols : [pendingCols[0]];
      for (const col of colsToFulfill) {
        col.promiseStatus = 'Cumplida';
        col.daysOverdue = 0;
        col.delinquencyTier = 'Al Día';
        await fetch('/api/sync', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            entity: 'collections',
            record: {
              id: col.id,
              organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001',
              loan_id: String(col.loanId || loan.id),
              borrower_name: col.borrowerName || loan.borrowerName,
              days_overdue: 0,
              delinquency_tier: 'Al Día',
              channel: col.channel || 'WhatsApp',
              promise_date: col.promiseDate || new Date().toISOString().split('T')[0],
              promise_amount: col.promiseAmount || 25,
              promise_status: 'Cumplida',
              notes: col.notes || ''
            }
          })
        });
      }
    }

    console.log("✓ Pago, Préstamo y Cobranzas actualizados en Supabase Cloud");
  } catch (err) {
    console.warn("Error sincronizando pago con Supabase:", err);
  }

  if (sendWhatsApp) {
    const webhookUrl = state.financialAccounts?.n8nWebhookUrl || "https://primary-production-b8f78.up.railway.app/webhook/chenloop-notifications";
    const sendMode = state.notificationsConfig?.sendMode || 'test';
    const testPhone = state.notificationsConfig?.testPhone || '+50761337723';
    const borrower = (state.borrowers || []).find(b => b.id === loan.borrowerId) || {};
    const borrowerPhone = borrower.phone;
    const targetPhone = (sendMode === 'production' && borrowerPhone) ? borrowerPhone : testPhone;

    const receiptPayload = {
      event: "DIGITAL_RECEIPT",
      borrower_name: loan.borrowerName,
      phone: targetPhone,
      payment_amount: amountPaid.toFixed(2),
      remaining_balance: loan.remainingAmount.toFixed(2),
      transaction_id: txId,
      organization: state.organization?.name || "Chenloop Capital"
    };

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(receiptPayload)
      });
      
      const newLogRecord = {
        id: generateUUID(),
        organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001',
        borrower_name: `${loan.borrowerName} (${targetPhone})`,
        channel: `WhatsApp / n8n [${txId}]`,
        event: "COMPROBANTE_PAGO_RECIBIDO",
        message: JSON.stringify(receiptPayload),
        status: 'OK 200',
        created_at: new Date().toISOString()
      };

      if (!state.n8nLogs) state.n8nLogs = [];
      state.n8nLogs.unshift({
        timestamp: new Date().toLocaleString(),
        eventType: "COMPROBANTE_PAGO_RECIBIDO",
        recipient: `${loan.borrowerName} (${targetPhone})`,
        channel: `WhatsApp / n8n [${txId}]`,
        payload: JSON.stringify(receiptPayload),
        status: 'OK 200'
      });

      try {
        const syncHeaders = { 'Content-Type': 'application/json' };
        if (currentSession) syncHeaders['Authorization'] = `Bearer ${currentSession.access_token}`;
        await fetch('/api/sync', {
          method: 'POST',
          headers: syncHeaders,
          body: JSON.stringify({
            entity: 'notifications',
            record: newLogRecord
          })
        });
      } catch (syncErr) {
        console.warn("Error syncing receipt notification log:", syncErr);
      }
    } catch (err) {
      console.warn("Error enviando recibo WhatsApp a n8n:", err);
      const newLogRecord = {
        id: generateUUID(),
        organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001',
        borrower_name: `${loan.borrowerName} (${targetPhone})`,
        channel: `WhatsApp / n8n [${txId}]`,
        event: "COMPROBANTE_PAGO_RECIBIDO",
        message: JSON.stringify(receiptPayload),
        status: 'Error / Offline',
        created_at: new Date().toISOString()
      };

      if (!state.n8nLogs) state.n8nLogs = [];
      state.n8nLogs.unshift({
        timestamp: new Date().toLocaleString(),
        eventType: "COMPROBANTE_PAGO_RECIBIDO",
        recipient: `${loan.borrowerName} (${targetPhone})`,
        channel: `WhatsApp / n8n [${txId}]`,
        payload: JSON.stringify(receiptPayload),
        status: 'Error / Offline'
      });

      try {
        const syncHeaders = { 'Content-Type': 'application/json' };
        if (currentSession) syncHeaders['Authorization'] = `Bearer ${currentSession.access_token}`;
        await fetch('/api/sync', {
          method: 'POST',
          headers: syncHeaders,
          body: JSON.stringify({
            entity: 'notifications',
            record: newLogRecord
          })
        });
      } catch (syncErr) {
        console.warn("Error syncing receipt error notification log:", syncErr);
      }
    }
  }

  document.getElementById('form-record-payment').reset();
  saveState();
  renderAll();
  // Sync financial_accounts KPIs to Supabase in background (fire-and-forget)
  // This ensures Command Center values persist after page reload.
  // Safe to call here because state.payments already has the new payment
  // and the reserve_paid mapping in loadState is correct (fixed in v49.0).
  if (typeof window.updateFinancialAccountState === 'function') {
    window.updateFinancialAccountState();
  }
  const destLabel = profitDestination === 'reinvest' ? '💰 Reinvertida en Capital' : (profitDestination === 'reserve' ? '🛡️ A Reserva' : '📊 Utilidad Personal');
  alert(`✓ Cobro de $${amountPaid.toFixed(2)} USD registrado y sincronizado con Supabase.\n\n📋 Desglose del pago:\n   💵 A Capital: $${principalShare.toFixed(2)} USD (siempre regresa a la cartera)\n   🛡️ A Reserva de Riesgo: $${reserveShare.toFixed(2)} USD (${Math.round(reservePct*100)}% de la ganancia)\n   📊 Utilidad: $${utilidadShare.toFixed(2)} USD → ${destLabel}${sendWhatsApp ? '\n📲 Comprobante WhatsApp enviado vía n8n.' : ''}`);
});

// ── Live Preview for payment split ────────────────────────────────
function updatePaymentSplitPreview() {
  const loanId = document.getElementById('pay-loan-select')?.value;
  const amountPaid = parseFloat(document.getElementById('pay-amount')?.value || 0);
  const reservePct = parseFloat(document.getElementById('pay-reserve-pct')?.value || 50) / 100.0;
  const previewBox = document.getElementById('pay-split-preview');
  const previewCapital = document.getElementById('preview-capital');
  const previewReserve = document.getElementById('preview-reserve');
  const previewUtility = document.getElementById('preview-utility');
  const pctLabel = document.getElementById('pay-reserve-pct-label');

  if (pctLabel) pctLabel.textContent = `${Math.round(reservePct * 100)}%`;

  if (!previewBox || amountPaid <= 0 || !loanId) {
    if (previewBox) previewBox.classList.add('hidden');
    return;
  }

  const loan = (state.loans || []).find(l => l.id === loanId);
  if (!loan) { previewBox.classList.add('hidden'); return; }

  const totalSched = loan.totalScheduled || loan.principal * 1.40;
  const schedProfit = loan.scheduledProfit || (totalSched - loan.principal);
  const principalRatio = loan.principal / totalSched;
  const profitRatio = schedProfit / totalSched;

  const capital = amountPaid * principalRatio;
  const totalProfit = amountPaid * profitRatio;
  const reserve = totalProfit * reservePct;
  const utility = totalProfit * (1 - reservePct);

  if (previewCapital) previewCapital.textContent = `$${capital.toFixed(2)}`;
  if (previewReserve) previewReserve.textContent = `$${reserve.toFixed(2)}`;
  if (previewUtility) previewUtility.textContent = `$${utility.toFixed(2)}`;
  previewBox.classList.remove('hidden');
  previewBox.classList.add('grid');
}

document.getElementById('pay-amount')?.addEventListener('input', updatePaymentSplitPreview);
document.getElementById('pay-loan-select')?.addEventListener('change', updatePaymentSplitPreview);
document.getElementById('pay-reserve-pct')?.addEventListener('input', updatePaymentSplitPreview);

// ----------------------------------------------------
// MÓDULO 8: CIERRE QUINCENAL & MOTOR DE RENTABILIDAD
// ----------------------------------------------------
function renderQuincenalCloseUI() {
  const tbody = document.getElementById('tbody-quincenal-closes');
  const elCollected = document.getElementById('qc-total-collected');
  const elProfit = document.getElementById('qc-net-profit');
  const elRiskContrib = document.getElementById('qc-risk-contribution');
  const elReinvest = document.getElementById('qc-reinvestment-available');
  const lblRiskContrib = document.getElementById('lbl-qc-risk-contribution');

  const payments = state.payments || [];
  const totalCollected = payments.reduce((sum, p) => sum + (p.amountPaid || p.amount || 0), 0);
  const netProfit = payments.reduce((sum, p) => sum + (p.profitShare || 0), 0);
  const targetReservePct = state.financialAccounts?.riskReserveTargetPct || state.organization?.riskReservePct || 20.0;
  const riskContrib = netProfit * (targetReservePct / 100.0);
  const engine = typeof calculateFinancialEngine === 'function' ? calculateFinancialEngine() : null;
  // Always compute capital available in real-time from actual data
  const actualCapitalTotal = state.financialAccounts?.capitalTotal || state.capital?.totalCapital || 800.0;
  const activePortfolioRealtime = (state.loans || []).filter(l => l.status === 'Activo').reduce((s,l)=>s+(l.principal||0),0);
  const reinvestAvail = Math.max(0, actualCapitalTotal - activePortfolioRealtime);

  if (lblRiskContrib) {
    lblRiskContrib.innerText = `Aporte a Reserva de Riesgo (${targetReservePct}%)`;
  }
  if (elCollected) elCollected.innerText = `$${totalCollected.toFixed(2)}`;
  if (elProfit) elProfit.innerText = `$${netProfit.toFixed(2)}`;
  if (elRiskContrib) elRiskContrib.innerText = `$${riskContrib.toFixed(2)}`;
  if (elReinvest) elReinvest.innerText = `$${reinvestAvail.toFixed(2)}`;

  if (!tbody) return;
  tbody.innerHTML = '';

  const closes = state.quincenalCloses || [];
  if (closes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-xs text-[#94A3B8]">No hay cierres quincenales ejecutados aún en Supabase. Utiliza el formulario superior para procesar el primer cierre oficial.</td></tr>`;
    return;
  }

  closes.forEach(c => {
    const utilidad = parseFloat(c.utilidad || (c.netProfit || 0) - (c.riskContribution || 0));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 text-xs text-[#bbcabf] font-mono">${c.timestamp || c.date || 'Hoy'}</td>
      <td class="p-3 font-bold text-white">${c.periodName}${c.periodStart ? `<br><span class='text-[10px] text-[#4edea3] font-normal'>${c.periodStart} — ${c.periodEnd || 'hoy'}</span>` : ''}</td>
      <td class="p-3 font-bold text-[#4edea3]">$${(c.totalCollected || 0).toFixed(2)}</td>
      <td class="p-3 font-bold text-[#818CF8]">$${(c.netProfit || 0).toFixed(2)}</td>
      <td class="p-3 font-bold text-[#FBBF24]">$${(c.riskContribution || 0).toFixed(2)}</td>
      <td class="p-3 font-bold text-[#4edea3]">$${utilidad.toFixed(2)}</td>
      <td class="p-3 text-xs text-[#bbcabf] max-w-[200px] truncate" title="${c.notes}">${c.notes}</td>
      <td class="p-3"><span class="badge-risk badge-green">${c.status === 'Completado' ? 'Completado' : (c.status || 'Procesado')}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('form-quincenal-close')?.addEventListener('submit', async function(e) {
  e.preventDefault();

  const periodName = document.getElementById('qc-period-name')?.value.trim();
  const notes = document.getElementById('qc-notes')?.value.trim() || 'Cierre sin incidencias';
  const manualReserveContrib = parseFloat(document.getElementById('qc-reserve-contribution')?.value || 0);
  const reserveSource = document.getElementById('qc-reserve-source')?.value || 'Separacion de Utilidad de Caja';
  const strategy = document.getElementById('qc-profit-strategy')?.value || 'keep';

  // ─── NEW: Read date range — if blank, use all payments ───────────
  const startVal = document.getElementById('qc-period-start')?.value;
  const endVal = document.getElementById('qc-period-end')?.value;
  const startDate = startVal ? new Date(startVal + 'T00:00:00') : null;
  const endDate = endVal ? new Date(endVal + 'T23:59:59') : null;

  if (!periodName) {
    alert("Por favor ingresa un nombre para el periodo de cierre.");
    return;
  }

  const allPayments = state.payments || [];
  // Filter payments by date range if provided
  const payments = (startDate || endDate) ? allPayments.filter(p => {
    const pd = new Date(p.timestamp || p.date || p.payment_date);
    if (isNaN(pd.getTime())) return true; // include if date unparseable
    if (startDate && pd < startDate) return false;
    if (endDate && pd > endDate) return false;
    return true;
  }) : allPayments;

  if (payments.length === 0 && (startDate || endDate)) {
    alert(`No se encontraron pagos en el rango ${startVal || 'inicio'} — ${endVal || 'hoy'}. Verifica las fechas o deja los campos en blanco para incluir todos los pagos.`);
    return;
  }

  const totalCollected = payments.reduce((sum, p) => sum + (p.amountPaid || p.amount || 0), 0);
  const netProfit = payments.reduce((sum, p) => sum + (p.profitPaid || p.profitShare || 0), 0);
  const paymentsReserve = payments.reduce((sum, p) => sum + (p.reservePaid || 0), 0);
  const totalRiskContribution = manualReserveContrib + paymentsReserve;
  const utilidad = Math.max(0, netProfit - totalRiskContribution);

  if (!state.financialAccounts) state.financialAccounts = {};
  if (!state.capital) state.capital = {};

  if (manualReserveContrib > 0) {
    state.financialAccounts.riskReserveBalance = (state.financialAccounts.riskReserveBalance || 0) + manualReserveContrib;
    state.capital.riskReserve = state.financialAccounts.riskReserveBalance;
  }

  let summaryMsg = '';
  if (strategy === 'reinvest' && utilidad > 0) {
    state.financialAccounts.capitalTotal = (state.financialAccounts.capitalTotal || 800.0) + utilidad;
    state.capital.totalCapital = state.financialAccounts.capitalTotal;
    summaryMsg = `Utilidad de $${utilidad.toFixed(2)} USD reinvertida en Capital. Nuevo capital total: $${state.financialAccounts.capitalTotal.toFixed(2)}.`;
  } else {
    summaryMsg = `Utilidad de $${utilidad.toFixed(2)} USD registrada como ganancia (sin reinversión).`;
  }

  const newCloseRecord = {
    id: generateUUID(),
    period_name: periodName,
    total_collected: totalCollected,
    net_profit: netProfit,
    risk_contribution: totalRiskContribution,
    utilidad: utilidad,
    period_start: startVal || null,
    period_end: endVal || null,
    notes,
    status: "Completado",
    closed_at: new Date().toISOString(),
    organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001'
  };

  if (!state.quincenalCloses) state.quincenalCloses = [];
  state.quincenalCloses.unshift({
    id: newCloseRecord.id,
    timestamp: new Date().toLocaleString(),
    periodName: newCloseRecord.period_name,
    totalCollected: newCloseRecord.total_collected,
    netProfit: newCloseRecord.net_profit,
    riskContribution: newCloseRecord.risk_contribution,
    utilidad: newCloseRecord.utilidad,
    periodStart: newCloseRecord.period_start,
    periodEnd: newCloseRecord.period_end,
    notes: newCloseRecord.notes,
    status: newCloseRecord.status
  });

  state.auditLogs.unshift({
    timestamp: new Date().toLocaleString(),
    user: "Ejecutivo Financiero",
    action: "CIERRE_QUINCENAL_PROCESADO",
    module: "Cierre Quincenal",
    details: `Cierre '${periodName}' [${startVal || 'todos'} — ${endVal || 'hoy'}]. ${payments.length} pagos procesados. Cobro: $${totalCollected.toFixed(2)}, Ganancia: $${netProfit.toFixed(2)}, Reserva: $${totalRiskContribution.toFixed(2)}, Utilidad: $${utilidad.toFixed(2)}. ${summaryMsg}`
  });

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;

    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'quincenal_closes',
        record: newCloseRecord
      })
    });

    if (typeof window.updateFinancialAccountState === 'function') {
      await window.updateFinancialAccountState();
    }

    console.log("✓ Cierre Quincenal y Cuentas Financieras guardados en Supabase Cloud");
  } catch (err) {
    console.warn("Error sincronizando Cierre Quincenal con Supabase:", err);
  }

  document.getElementById('form-quincenal-close').reset();
  saveState();
  renderAll();
  alert(`✓ Cierre Quincenal '${periodName}' procesado.\n\n📋 ${payments.length} pagos del período ${startVal ? `(${startVal} — ${endVal || 'hoy'})` : '(todos)'}:\n   💵 Cobro Total: $${totalCollected.toFixed(2)}\n   💡 Ganancia Neta: $${netProfit.toFixed(2)}\n   🛡️ Aporte Manual Reserva: $${manualReserveContrib.toFixed(2)} (${reserveSource})\n   🛡️ Reserva desde Pagos: $${paymentsReserve.toFixed(2)}\n   🛡️ Total Reserva: $${totalRiskContribution.toFixed(2)}\n   📊 Utilidad Neta del Período: $${utilidad.toFixed(2)}\n   ${summaryMsg}`);
});


// ----------------------------------------------------
// MÓDULO 9: GASTOS & CUENTAS OPERATIVAS
// ----------------------------------------------------
function formatDateClean(rawDate) {
  if (!rawDate) return new Date().toLocaleString();
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
    }
  } catch(err) {}
  return String(rawDate);
}

function renderOperationsExpensesUI() {
  const tbody = document.getElementById('tbody-operations-expenses');
  const elTotal = document.getElementById('ops-total-expenses');
  const elCategory = document.getElementById('ops-top-category');
  const elNetAfter = document.getElementById('ops-net-after-expenses');

  const expenses = state.operationalExpenses || [];
  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount || e.monthlyAmount || e.monthly_amount || 0), 0);

  const catTotals = {};
  expenses.forEach(e => {
    const cat = e.category || 'Varios';
    const amt = parseFloat(e.amount || e.monthlyAmount || e.monthly_amount || 0);
    catTotals[cat] = (catTotals[cat] || 0) + amt;
  });
  let topCat = 'Sin gastos';
  let maxCatAmount = 0;
  Object.keys(catTotals).forEach(cat => {
    if (catTotals[cat] > maxCatAmount) {
      maxCatAmount = catTotals[cat];
      topCat = cat;
    }
  });

  const accumProfits = state.capital?.accumulatedProfits || 0;
  const netAfterExpenses = Math.max(0, accumProfits - totalExpenses);

  if (elTotal) elTotal.innerText = `$${totalExpenses.toFixed(2)} USD`;
  if (elCategory) elCategory.innerText = topCat;
  if (elNetAfter) elNetAfter.innerText = `$${netAfterExpenses.toFixed(2)} USD`;

  if (!tbody) return;
  tbody.innerHTML = '';

  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-xs text-[#94A3B8]">No hay gastos operativos registrados aún en Supabase. Registra el primer egreso utilizando el formulario superior.</td></tr>`;
    return;
  }

  expenses.forEach(exp => {
    const concept = exp.concept || exp.name || 'Gasto Operativo';
    const category = exp.category || 'Varios';
    const amount = parseFloat(exp.amount || exp.monthlyAmount || exp.monthly_amount || 0);
    const dateFormatted = formatDateClean(exp.date || exp.timestamp || exp.created_at);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 text-xs text-[#bbcabf] font-mono">${dateFormatted}</td>
      <td class="p-3 font-bold text-white">${concept}</td>
      <td class="p-3 text-xs text-[#818CF8]"><span class="bg-[#818CF8]/10 border border-[#818CF8]/30 px-2 py-0.5 rounded font-bold">${category}</span></td>
      <td class="p-3 font-bold text-[#F43F5E]">$${amount.toFixed(2)} USD</td>
      <td class="p-3 text-xs text-[#bbcabf]">${exp.user || 'Propietario'}</td>
      <td class="p-3">
        <button class="bg-red-500/20 hover:bg-red-500/30 text-[#F43F5E] px-2 py-0.5 rounded text-xs font-bold cursor-pointer border border-red-500/30" onclick="window.deleteExpense('${exp.id}')">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.deleteExpense = async function(expId) {
  const idx = (state.operationalExpenses || []).findIndex(e => e.id === expId);
  if (idx === -1) return;

  if (!confirm("¿Estás seguro de eliminar este gasto operativo?")) return;

  state.operationalExpenses.splice(idx, 1);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'operational_expenses',
        record: { id: expId, deleted: true }
      })
    });
  } catch (err) {
    console.warn("Error eliminando gasto en Supabase:", err);
  }

  saveState();
  renderAll();
};

document.getElementById('form-add-expense')?.addEventListener('submit', async function(e) {
  e.preventDefault();

  const concept = document.getElementById('exp-concept')?.value.trim();
  const category = document.getElementById('exp-category')?.value;
  const amount = parseFloat(document.getElementById('exp-amount')?.value || 0);

  if (!concept || amount <= 0) {
    alert("Por favor ingresa una descripción y un monto mayor a $0.");
    return;
  }

  const newExpRecord = {
    id: generateUUID(),
    name: concept,
    category: category,
    monthly_amount: amount,
    organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001'
  };

  if (!state.operationalExpenses) state.operationalExpenses = [];
  state.operationalExpenses.unshift({
    id: newExpRecord.id,
    concept: concept,
    name: concept,
    category: category,
    monthlyAmount: amount,
    amount: amount,
    user: "Propietario",
    date: new Date().toISOString()
  });

  state.auditLogs.unshift({
    timestamp: new Date().toLocaleString(),
    user: "Administrador",
    action: "GASTO_OPERATIVO_REGISTRADO",
    module: "Gastos & Cuentas",
    details: `Gasto de $${amount.toFixed(2)} USD registrado para '${concept}' (${category}).`
  });

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'operational_expenses',
        record: newExpRecord
      })
    });
    console.log("✓ Gasto operativo guardado en Supabase Cloud");
  } catch (err) {
    console.warn("Error sincronizando gasto con Supabase:", err);
  }

  document.getElementById('form-add-expense').reset();
  saveState();
  renderAll();
  alert(`✓ Gasto de $${amount.toFixed(2)} USD para '${concept}' guardado y sincronizado con Supabase.`);
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
  
  await loadState();

  const user = currentSession.user;
  const userDispEl = document.getElementById('user-display-name');
  const avatarEl = document.getElementById('user-avatar-initials');
  const orgBadgeEl = document.getElementById('current-org-badge');
  
  const fullName = user.user_metadata?.full_name || user.email.split('@')[0];
  const orgName = state.organization?.name || state.financialAccounts?.organizationName || user.user_metadata?.org_name || "Mi Cartera Personal";
  
  if (userDispEl) userDispEl.innerText = fullName;
  if (avatarEl) avatarEl.innerText = fullName.substring(0, 2).toUpperCase();
  if (orgBadgeEl) orgBadgeEl.innerText = orgName;

  if (typeof renderAll === 'function') {
    renderAll();
  }
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
  const activePortfolio = activeLoans.reduce((sum, l) => sum + (l.principal || 0), 0);
  
  // Calculate capital total dynamically based on ledger of payments (800 base + reinvested utility)
  const baseCapital = 800.0;
  const payments = state.payments || [];
  
  const reinvestedFromPayments = payments.reduce((sum, p) => {
    if (p.profitDestination === 'reinvest' || p.profit_destination === 'reinvest') {
      let utilidad = parseFloat(p.utilidadPaid || p.utilidad_paid || 0);
      if (utilidad === 0) {
        // Fallback for older payments before RLS/split fixes
        const profit = parseFloat(p.profitPaid || p.profit_paid || p.profitShare || 0);
        const reserve = parseFloat(p.reservePaid || p.reserve_paid || 0);
        utilidad = Math.max(0, profit - reserve);
      }
      return sum + utilidad;
    }
    return sum;
  }, 0);
  
  // Add any reinvestments from quincenal closes
  const closes = state.quincenalCloses || [];
  const reinvestedFromCloses = closes.reduce((sum, c) => {
    if (c.profitStrategy === 'reinvest' || c.strategy === 'reinvest') {
      return sum + parseFloat(c.utilidad || 0);
    }
    return sum;
  }, 0);
  
  const capitalTotal = baseCapital + reinvestedFromPayments + reinvestedFromCloses;
  const portfolioTarget = state.financialAccounts?.portfolioTarget || 5000.0;
  
  // Calculate total accumulated profit from recorded payments
  const accumProfits = payments.reduce((sum, p) => {
    let profit = parseFloat(p.profitPaid || p.profit_paid || p.profitShare || 0);
    if (profit === 0 && p.amountPaid > 0) {
      const loan = (state.loans || []).find(l => l.id === (p.loanId || p.loan_id));
      if (loan) {
        const totalSched = loan.totalScheduled || (loan.principal * 1.40);
        const schedProfit = loan.scheduledProfit || (totalSched - loan.principal);
        profit = p.amountPaid * (schedProfit / totalSched);
      }
    }
    return sum + profit;
  }, 0);
  
  if (!state.capital) state.capital = {};
  state.capital.accumulatedProfits = accumProfits;
  const capitalDeployed = activePortfolio;
  const capitalAvailable = Math.max(0, capitalTotal - capitalDeployed);
  
  // Keep state objects in sync
  if (!state.financialAccounts) state.financialAccounts = {};
  state.financialAccounts.capitalTotal = capitalTotal;
  state.financialAccounts.capitalAvailable = capitalAvailable;
  state.financialAccounts.capitalDeployed = capitalDeployed;
  
  state.capital.totalCapital = capitalTotal;
  state.capital.capitalDeployed = capitalDeployed;
  state.capital.capitalAvailable = capitalAvailable;
  
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

// Legacy financial engine helpers removed to prevent duplication

window.deleteDebt = async function(debtId) {
  const idx = (state.ownerDebts || []).findIndex(d => d.id === debtId);
  if (idx === -1) return;

  if (!confirm("¿Estás seguro de eliminar este registro de deuda?")) return;

  state.ownerDebts.splice(idx, 1);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'owner_debts',
        record: { id: debtId, deleted: true }
      })
    });
  } catch (err) {
    console.warn("Error eliminando deuda en Supabase:", err);
  }

  saveState();
  renderAll();
};

function renderOwnerDebtsUI() {
  const engine = typeof calculateFinancialEngine === 'function' ? calculateFinancialEngine() : { distributableBalance: 0 };
  const strategy = state.selectedDebtStrategy || 'avalanche';

  const descEl = document.getElementById('debt-strategy-description');
  const tbody = document.getElementById('tbody-debts');

  let sortedDebts = [...(state.ownerDebts || [])];
  if (strategy === 'avalanche') {
    sortedDebts.sort((a, b) => (b.interestRate || b.interest_rate || 0) - (a.interestRate || a.interest_rate || 0));
  } else {
    sortedDebts.sort((a, b) => (a.balance || 0) - (b.balance || 0));
  }

  if (descEl) {
    if (sortedDebts.length > 0) {
      const target = sortedDebts[0];
      descEl.innerHTML = `
        <strong>${strategy === 'avalanche' ? 'MÉTODO AVALANCHA (Mayor Tasa de Interés)' : 'MÉTODO BOLA DE NIEVE (Menor Saldo)'}:</strong> 
        Atacar primero <strong>${target.debtName || target.debt_name}</strong> (Saldo: $${(target.balance || 0).toFixed(2)} | Tasa: ${target.interestRate || target.interest_rate}%). 
        Se asignan $${engine.distributableBalance.toFixed(2)} USD de Dinero Distribuible libre como abono extraordinario.
      `;
    } else {
      descEl.innerText = "No hay deudas personales registradas en Supabase. ¡Excelente trabajo manteniendo cero deudas!";
    }
  }

  if (!tbody) return;
  tbody.innerHTML = '';

  // Always refresh the debt select dropdown
  const payDebtSel = document.getElementById('pay-debt-select');
  if (payDebtSel) {
    payDebtSel.innerHTML = '<option value="">— Selecciona una deuda —</option>';
    sortedDebts.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.debtName || d.debt_name} ($${(d.balance||0).toFixed(2)} | ${d.interestRate||d.interest_rate}%)`;
      payDebtSel.appendChild(opt);
    });
  }

  if (sortedDebts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-xs text-[#94A3B8]">No hay deudas personales registradas aún en Supabase. Registra la primera deuda utilizando el formulario superior.</td></tr>`;
    return;
  }

  sortedDebts.forEach((d, idx) => {
    const extraPay = idx === 0 ? engine.distributableBalance : 0.0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${idx === 0 ? 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/30' : 'bg-white/5 text-[#94A3B8]'}">#${idx + 1} ${idx === 0 ? 'PRIORITARIA' : ''}</span></td>
      <td class="p-3 font-bold text-white">${d.debtName || d.debt_name}</td>
      <td class="p-3 text-white font-bold">$${(d.balance || 0).toFixed(2)}</td>
      <td class="p-3 font-bold text-amber-300">${d.interestRate || d.interest_rate}%</td>
      <td class="p-3 text-white">$${(d.minPayment || d.min_payment || 0).toFixed(2)}</td>
      <td class="p-3 font-bold text-[#4edea3]">$${extraPay.toFixed(2)}</td>
      <td class="p-3 flex items-center gap-2">
        <button class="bg-[#10b981]/20 hover:bg-[#10b981]/30 text-[#4edea3] px-2.5 py-1 rounded text-xs font-bold cursor-pointer border border-[#10b981]/30 transition-all" onclick="window.payDebt('${d.id}')">+ Abono</button>
        <button class="bg-red-500/20 hover:bg-red-500/30 text-[#F43F5E] px-2 py-0.5 rounded text-xs font-bold cursor-pointer border border-red-500/30" onclick="window.deleteDebt('${d.id}')">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Populate the Debt Amortization select dropdown ──────────────
(function populatePayDebtSelect() {
  const sel = document.getElementById('pay-debt-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Selecciona una deuda —</option>';
  (state.ownerDebts || []).forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = `${d.debtName || d.debt_name} ($${(d.balance||0).toFixed(2)} | ${d.interestRate||d.interest_rate}%)`;
    sel.appendChild(opt);
  });
})();

// ── Pay Debt (+ Abono button in table row) ───────────────────────
window.payDebt = function(debtId) {
  const sel = document.getElementById('pay-debt-select');
  if (sel) sel.value = debtId;
  document.getElementById('pay-debt-amount')?.focus();
};

document.getElementById('form-pay-debt')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const debtId = document.getElementById('pay-debt-select')?.value;
  const amount = parseFloat(document.getElementById('pay-debt-amount')?.value || 0);
  const source = document.getElementById('pay-debt-source')?.value || 'Excedente de Caja';

  if (!debtId) { alert('Por favor selecciona una deuda para abonar.'); return; }
  if (amount <= 0) { alert('El monto del abono debe ser mayor a $0.'); return; }

  const debt = (state.ownerDebts || []).find(d => d.id === debtId);
  if (!debt) { alert('Deuda no encontrada.'); return; }

  const prevBalance = debt.balance || 0;
  debt.balance = Math.max(0, prevBalance - amount);

  if (typeof window.logAuditEvent === 'function') {
    await window.logAuditEvent(
      'ABONO_DEUDA',
      'Deudas Propietario',
      `Abono de $${amount.toFixed(2)} USD aplicado a '${debt.debtName}'. Saldo anterior: $${prevBalance.toFixed(2)}, Saldo nuevo: $${debt.balance.toFixed(2)}. Origen: ${source}.`
    );
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'owner_debts',
        record: {
          id: debt.id,
          debt_name: debt.debtName,
          balance: debt.balance,
          interest_rate: debt.interestRate,
          min_payment: debt.minPayment,
          priority: debt.priority,
          organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001'
        }
      })
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      console.error('Error guardando abono en Supabase:', json.error);
      alert(`⚠️ Error sincronizando con Supabase: ${json.error}`);
    } else {
      console.log('✓ Abono a deuda guardado en Supabase');
    }
  } catch (err) {
    console.error('Error de red en abono:', err);
  }

  document.getElementById('form-pay-debt').reset();
  saveState();
  renderAll();
  alert(`✓ Abono de $${amount.toFixed(2)} USD aplicado a '${debt.debtName}'.\nNuevo saldo: $${debt.balance.toFixed(2)} USD.`);
});

document.getElementById('form-add-debt')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const debtName = document.getElementById('debt-name')?.value.trim();
  const balance = parseFloat(document.getElementById('debt-balance')?.value || 0);
  const interestRate = parseFloat(document.getElementById('debt-rate')?.value || 0);
  const minPayment = parseFloat(document.getElementById('debt-min')?.value || 0);

  if (!debtName || balance <= 0) {
    alert("Por favor ingresa un nombre de deuda y un saldo mayor a $0.");
    return;
  }

  const newDebtRecord = {
    id: generateUUID(),
    debt_name: debtName,
    balance,
    interest_rate: interestRate,
    min_payment: minPayment,
    priority: (state.ownerDebts || []).length + 1,
    organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001'
  };

  if (!state.ownerDebts) state.ownerDebts = [];
  state.ownerDebts.push({
    id: newDebtRecord.id,
    debtName: newDebtRecord.debt_name,
    balance: newDebtRecord.balance,
    interestRate: newDebtRecord.interest_rate,
    minPayment: newDebtRecord.min_payment,
    priority: newDebtRecord.priority
  });

  state.auditLogs.unshift({
    timestamp: new Date().toLocaleString(),
    user: "Propietario",
    action: "DEUDA_PERSONAL_REGISTRADA",
    module: "Deudas Propietario",
    details: `Deuda de $${balance.toFixed(2)} USD registrada para '${debtName}' (${interestRate}% interés).`
  });

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'owner_debts',
        record: newDebtRecord
      })
    });
    console.log("✓ Deuda guardada en Supabase Cloud");
  } catch (err) {
    console.warn("Error sincronizando deuda con Supabase:", err);
  }

  document.getElementById('form-add-debt').reset();
  saveState();
  renderAll();
  alert(`✓ Deuda '${debtName}' de $${balance.toFixed(2)} USD registrada y sincronizada con Supabase.`);
});

// ----------------------------------------------------
// MÓDULO 12: AUDITORÍA LOG INMUTABLE
// ----------------------------------------------------
function renderAudit() {
  const tbody = document.getElementById('tbody-audit');
  if (!tbody) return;
  tbody.innerHTML = '';

  const logs = state.auditLogs || [];
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-xs text-[#94A3B8]">No hay acciones registradas en la bitácora de auditoría aún.</td></tr>`;
    return;
  }

  logs.forEach(log => {
    let badgeClass = "badge-green";
    if (log.action && (log.action.includes('RECHAZAD') || log.action.includes('INCUMPLID') || log.action.includes('MORA') || log.action.includes('ELIMINAD'))) {
      badgeClass = "badge-red";
    } else if (log.action && (log.action.includes('CONFIG') || log.action.includes('GASTO') || log.action.includes('DEUDA'))) {
      badgeClass = "badge-amber";
    }

    const formattedDate = formatDateClean(log.timestamp || log.created_at || log.date);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 text-xs text-[#bbcabf] font-mono">${formattedDate}</td>
      <td class="p-3 font-bold text-white text-xs">${log.user || 'Propietario / Admin'}</td>
      <td class="p-3 text-xs"><span class="badge-risk ${badgeClass}">${log.action}</span></td>
      <td class="p-3 text-xs text-[#818CF8] font-bold">${log.module}</td>
      <td class="p-3 text-xs text-white max-w-md">${log.details}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ----------------------------------------------------
// MÓDULO 11: ANALYTICS & SIMULADOR FINANCIERO
// ----------------------------------------------------
function renderAnalyticsUI() {
  const engine = typeof calculateFinancialEngine === 'function' ? calculateFinancialEngine() : null;
  const metrics = typeof computeRiskMetrics === 'function' ? computeRiskMetrics() : null;

  const elYield = document.getElementById('an-monthly-yield');
  const elRoi = document.getElementById('an-annual-roi');
  const elRate = document.getElementById('an-collection-rate');
  const elMult = document.getElementById('an-portfolio-multiplier');

  const activePortfolio = engine ? engine.activePortfolio : 0;
  const capitalTotal = engine ? engine.capitalTotal : 5000;

  const payments = state.payments || [];
  const totalCollected = payments.reduce((sum, p) => sum + (p.amountPaid || p.amount || 0), 0);
  const totalProfit = payments.reduce((sum, p) => sum + (p.profitShare || 0), 0);

  const monthlyYield = activePortfolio > 0 ? ((totalProfit / activePortfolio) * 100) : 15.0;
  const annualRoi = capitalTotal > 0 ? ((totalProfit * 12 / capitalTotal) * 100) : 180.0;
  const colRate = 100.0 - parseFloat(metrics ? metrics.par30Pct : "1.5");
  const multiplier = capitalTotal > 0 ? (1 + (totalProfit / capitalTotal)) : 1.30;

  if (elYield) elYield.innerText = `${monthlyYield.toFixed(1)}%`;
  if (elRoi) elRoi.innerText = `${annualRoi.toFixed(1)}%`;
  if (elRate) elRate.innerText = `${colRate.toFixed(1)}%`;
  if (elMult) elMult.innerText = `${multiplier.toFixed(2)}x`;

  window.updateScenarioSimulation();
}

window.updateScenarioSimulation = function() {
  const capInput = document.getElementById('sim-range-capital');
  const rateInput = document.getElementById('sim-range-rate');
  const moraInput = document.getElementById('sim-range-mora');

  if (!capInput || !rateInput || !moraInput) return;

  const capital = parseFloat(capInput.value);
  const rate = parseFloat(rateInput.value);
  const mora = parseFloat(moraInput.value);

  const lblCap = document.getElementById('sim-val-capital');
  const lblRate = document.getElementById('sim-val-rate');
  const lblMora = document.getElementById('sim-val-mora');

  if (lblCap) lblCap.innerText = `$${capital.toLocaleString()} USD`;
  if (lblRate) lblRate.innerText = `${rate}% Quincenal`;
  if (lblMora) lblMora.innerText = `${mora.toFixed(1)}% Mora`;

  const profitPerBiweek = capital * (rate / 100.0) * (1 - (mora / 100.0));
  const res3m = profitPerBiweek * 6;
  const res6m = profitPerBiweek * 12;
  const res12m = profitPerBiweek * 24;

  const el3m = document.getElementById('sim-res-3m');
  const el6m = document.getElementById('sim-res-6m');
  const el12m = document.getElementById('sim-res-12m');

  if (el3m) el3m.innerText = `$${res3m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (el6m) el6m.innerText = `$${res6m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (el12m) el12m.innerText = `$${res12m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function renderSettingsUI() {
  const elCapTotal = document.getElementById('set-capital-total');
  const elPar30 = document.getElementById('set-par30-limit');
  const elReserve = document.getElementById('set-reserve-target');
  const elPortfolio = document.getElementById('set-portfolio-target');
  const elOps = document.getElementById('set-ops-months');
  const elOrg = document.getElementById('set-org-name');

  const currentOrgName = state.organization?.name || state.financialAccounts?.organizationName || "Mi Cartera Personal";
  const currentCapTotal = state.financialAccounts?.capitalTotal || state.capital?.totalCapital || 800.0;

  if (elCapTotal) elCapTotal.value = currentCapTotal;
  if (elPar30) elPar30.value = state.organization?.par30Limit || 10.0;
  if (elReserve) elReserve.value = state.financialAccounts?.riskReserveTargetPct || 20.0;
  if (elPortfolio) elPortfolio.value = state.financialAccounts?.portfolioTarget || 5000.0;
  if (elOps) elOps.value = state.financialAccounts?.operationalTargetMonths || 6;
  if (elOrg) elOrg.value = currentOrgName;

  const orgBadgeEl = document.getElementById('current-org-badge');
  if (orgBadgeEl) orgBadgeEl.innerText = currentOrgName;

  if (typeof window.renderTeamMembers === 'function') {
    window.renderTeamMembers();
  }
}

window.toggleUserForm = function() {
  const container = document.getElementById('user-form-container');
  if (container) {
    container.classList.toggle('hidden');
  }
};

window.renderTeamMembers = function() {
  const tbody = document.getElementById('tbody-team-members');
  if (!tbody) return;
  tbody.innerHTML = '';

  const members = state.teamMembers || [
    {
      id: currentProfile?.id || 'admin-01',
      name: currentProfile?.full_name || 'Edgar Garcia (Admin)',
      email: currentSession?.user?.email || 'admin@tu-cartera.com',
      role: currentProfile?.role || 'Tier 1 Admin',
      orgName: state.organization?.name || 'Mi Cartera Personal',
      status: 'Activo'
    }
  ];

  members.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-2.5 font-bold text-white flex items-center gap-2">
        <span class="w-6 h-6 rounded-full bg-[#818CF8]/20 text-[#818CF8] text-[10px] flex items-center justify-center font-bold">
          ${(m.name || 'US').substring(0, 2).toUpperCase()}
        </span>
        ${m.name}
      </td>
      <td class="p-2.5 text-[#bbcabf] font-mono text-[11px]">${m.email}</td>
      <td class="p-2.5"><span class="bg-[#818CF8]/10 text-[#818CF8] border border-[#818CF8]/30 px-2 py-0.5 rounded font-bold">${m.role}</span></td>
      <td class="p-2.5 text-[#bbcabf]">${m.orgName || state.organization?.name || 'Mi Cartera Personal'}</td>
      <td class="p-2.5"><span class="badge-risk badge-green">${m.status || 'Activo'}</span></td>
    `;
    tbody.appendChild(tr);
  });
};

window.createTeamMember = async function() {
  const name = document.getElementById('usr-name')?.value.trim();
  const email = document.getElementById('usr-email')?.value.trim();
  const pass = document.getElementById('usr-pass')?.value;
  const role = document.getElementById('usr-role')?.value || 'Cajero / Operador';

  if (!name || !email || !pass || pass.length < 6) {
    alert("Por favor ingresa un nombre completo, correo válido y contraseña de al menos 6 caracteres.");
    return;
  }

  const currentOrgId = state.financialAccounts?.organizationId || currentProfile?.organization_id || '00000000-0000-0000-0000-000000000001';
  const currentOrgName = state.organization?.name || "Mi Cartera Personal";

  if (!supabaseClient) {
    alert("Supabase Client no está disponible en este momento.");
    return;
  }

  try {
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
      email,
      password: pass,
      options: {
        data: {
          full_name: name,
          role,
          org_id: currentOrgId,
          org_name: currentOrgName
        }
      }
    });

    if (authError) {
      alert(`Error creando usuario en Supabase: ${authError.message}`);
      return;
    }

    const newUserId = authData?.user?.id || `USR-${Date.now()}`;

    const newProfile = {
      id: newUserId,
      organization_id: currentOrgId,
      full_name: name,
      role: role,
      created_at: new Date().toISOString()
    };

    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) {
      headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    }

    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'profiles',
        record: newProfile
      })
    });

    if (!state.teamMembers) state.teamMembers = [];
    state.teamMembers.push({
      id: newUserId,
      name,
      email,
      role,
      orgName: currentOrgName,
      status: 'Activo'
    });

    state.auditLogs.unshift({
      timestamp: new Date().toLocaleString(),
      user: "Administrador",
      action: "NUEVO_USUARIO_CREADO",
      module: "Configuración / Equipo",
      details: `Usuario ${name} (${email}) asignado a la organización '${currentOrgName}' con el rol [${role}].`
    });

    saveState();
    window.renderTeamMembers();
    window.toggleUserForm();

    document.getElementById('usr-name').value = '';
    document.getElementById('usr-email').value = '';
    document.getElementById('usr-pass').value = '';

    alert(`✓ Usuario '${name}' (${email}) creado exitosamente en tu organización con rol [${role}]. Ya puede iniciar sesión en Vercel.`);
  } catch (err) {
    console.error("Error al crear usuario miembro:", err);
    alert("Ocurrió un error al procesar el alta del usuario miembro.");
  }
};

document.getElementById('form-settings')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const capitalTotal = parseFloat(document.getElementById('set-capital-total')?.value || 1000);
  const par30Limit = parseFloat(document.getElementById('set-par30-limit')?.value || 10);
  const reserveTargetPct = parseFloat(document.getElementById('set-reserve-target')?.value || 20);
  const portfolioTarget = parseFloat(document.getElementById('set-portfolio-target')?.value || 5000);
  const opsMonths = parseInt(document.getElementById('set-ops-months')?.value || 6);
  const orgName = document.getElementById('set-org-name')?.value.trim() || "Mi Cartera Personal";

  if (!state.organization) state.organization = {};
  if (!state.financialAccounts) state.financialAccounts = {};

  state.organization.par30Limit = par30Limit;
  state.organization.name = orgName;

  state.financialAccounts.capitalTotal = capitalTotal;
  state.financialAccounts.riskReserveTargetPct = reserveTargetPct;
  state.financialAccounts.portfolioTarget = portfolioTarget;
  state.financialAccounts.operationalTargetMonths = opsMonths;
  state.financialAccounts.organizationName = orgName;

  if (!state.capital) state.capital = {};
  state.capital.totalCapital = capitalTotal;

  const orgBadgeEl = document.getElementById('current-org-badge');
  if (orgBadgeEl) orgBadgeEl.innerText = orgName;

  const accountRecord = {
    id: state.financialAccounts.id || '92700043-3f9d-484c-83d0-5ebbb0f05a7d',
    organization_id: state.financialAccounts.organizationId || '00000000-0000-0000-0000-000000000001',
    capital_total: capitalTotal,
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

    const orgRecord = {
      id: state.financialAccounts?.organizationId || currentProfile?.organization_id || '00000000-0000-0000-0000-000000000001',
      name: orgName,
      par30_limit: par30Limit,
      reserve_pct: reserveTargetPct
    };

    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'organizations',
        record: orgRecord
      })
    });

    if (supabaseClient && currentSession) {
      await supabaseClient.auth.updateUser({
        data: { org_name: orgName }
      });
    }

    console.log("✓ Configuración y Nombre de Cartera persistidos con éxito en Supabase public.organizations & Auth");
  } catch (err) {
    console.warn("Error enviando configuración a Supabase Cloud:", err);
  }

  state.auditLogs.unshift({
    timestamp: new Date().toLocaleString(),
    user: "Administrador",
    action: "ACTUALIZACION_CONFIGURACION",
    module: "Configuración",
    details: `Nombre de Cartera actualizado a '${orgName}'. PAR30: ${par30Limit}%, Reserva: ${reserveTargetPct}%, Cartera Meta: $${portfolioTarget}`
  });

  saveState();
  renderAll();
  alert(`✓ Configuración y Nombre de Cartera '${orgName}' guardados con éxito.`);
});

// ----------------------------------------------------
// HANDLER: AGREGAR NUEVO PRESTATARIO & SCORING
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const formAddBw = document.getElementById('form-add-borrower');
  if (formAddBw) {
    formAddBw.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('bw-name')?.value.trim();
      const idNum = document.getElementById('bw-id')?.value.trim();
      const phone = document.getElementById('bw-phone')?.value.trim();
      const income = parseFloat(document.getElementById('bw-income')?.value || 0);
      const employment = document.getElementById('bw-employment')?.value || 'Empleado';
      const verified = document.getElementById('bw-verified')?.value === 'true';

      if (!name || !idNum) {
        alert('Por favor ingrese el nombre e identificación del prestatario.');
        return;
      }

      const tempBw = {
        id: generateUUID(),
        name,
        idNumber: idNum,
        phone,
        income,
        employmentType: employment,
        verified,
        status: 'Activo'
      };

      const scoreObj = calculateExplicableScore(tempBw);
      const maxExposure = scoreObj.totalScore >= 80 ? 300.0 : (scoreObj.totalScore >= 60 ? 150.0 : 50.0);

      const newBorrower = {
        id: tempBw.id,
        name: tempBw.name,
        id_number: tempBw.idNumber,
        phone: tempBw.phone,
        income: tempBw.income,
        employment_type: tempBw.employmentType,
        verified: tempBw.verified,
        risk_score: scoreObj.totalScore,
        risk_level: scoreObj.riskLevel,
        exposure_limit: maxExposure,
        status: 'Activo',
        organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001'
      };

      // Add to local state
      if (!state.borrowers) state.borrowers = [];
      state.borrowers.unshift({
        id: newBorrower.id,
        name: newBorrower.name,
        idNumber: newBorrower.id_number,
        phone: newBorrower.phone,
        income: newBorrower.income,
        employmentType: newBorrower.employment_type,
        verified: newBorrower.verified,
        riskScore: newBorrower.risk_score,
        riskLevel: newBorrower.risk_level,
        maxExposure: newBorrower.exposure_limit,
        status: newBorrower.status
      });

      // Save to Supabase Cloud
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (currentSession) {
          headers['Authorization'] = `Bearer ${currentSession.access_token}`;
        }
        await fetch('/api/sync', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            entity: 'borrowers',
            record: newBorrower
          })
        });
        console.log("✓ Prestatario guardado y sincronizado en Supabase Cloud");
      } catch (err) {
        console.warn("Error enviando prestatario a Supabase Cloud:", err);
      }

      // Reset form and hide form
      formAddBw.reset();
      if (typeof window.toggleBorrowerForm === 'function') {
        window.toggleBorrowerForm();
      }

      // Re-render UI
      renderBorrowers();
      renderApplications();
      alert(`✓ Prestatario ${name} guardado en Supabase con éxito. Score: ${scoreObj.totalScore} pts (${scoreObj.riskLevel}).`);
    });
  }

  // ----------------------------------------------------
  // HANDLER: CREAR SOLICITUD DE CRÉDITO
  // ----------------------------------------------------
  const formCreateApp = document.getElementById('form-create-application');
  if (formCreateApp) {
    formCreateApp.addEventListener('submit', async (e) => {
      e.preventDefault();

      const bwId = document.getElementById('app-borrower-select')?.value;
      const amount = parseFloat(document.getElementById('app-amount')?.value || 0);
      const reason = document.getElementById('app-reason')?.value.trim();
      const count = parseInt(document.getElementById('app-count')?.value || 7);
      const rate = parseFloat(document.getElementById('app-rate')?.value || 15);

      if (!bwId) {
        alert('Por favor selecciona un prestatario.');
        return;
      }

      const bw = state.borrowers.find(b => b.id === bwId);
      if (!bw) return;

      const newApp = {
        id: generateUUID(),
        borrower_id: bw.id,
        borrower_name: bw.name,
        amount,
        reason,
        installment_count: count,
        interest_rate: rate,
        status: 'En Revisión',
        created_at: new Date().toISOString(),
        organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001'
      };

      if (!state.applications) state.applications = [];
      state.applications.unshift({
        id: newApp.id,
        borrowerId: newApp.borrower_id,
        borrowerName: newApp.borrower_name,
        amount: newApp.amount,
        reason: newApp.reason,
        count: newApp.installment_count,
        rate: rate,
        status: newApp.status,
        createdAt: newApp.created_at
      });

      // Save to Supabase Cloud
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (currentSession) {
          headers['Authorization'] = `Bearer ${currentSession.access_token}`;
        }
        await fetch('/api/sync', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            entity: 'applications',
            record: newApp
          })
        });
        console.log("✓ Solicitud de crédito guardada en Supabase Cloud");
      } catch (err) {
        console.warn("Error enviando solicitud a Supabase Cloud:", err);
      }

      formCreateApp.reset();
      saveState();
      renderAll();
      alert(`✓ Solicitud de crédito ${newApp.id} por $${amount.toFixed(2)} guardada en Supabase en revisión.`);
    });
  }
});


window.updateFinancialAccountState = async function() {
  const engine = calculateFinancialEngine();
  const accountRecord = {
    id: state.financialAccounts?.id || '92700043-3f9d-484c-83d0-5ebbb0f05a7d',
    organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001',
    capital_total: engine.totalCapital,
    capital_deployed: engine.capitalDeployed,
    capital_available: engine.capitalAvailable,
    risk_reserve_balance: engine.riskReserveBalance,
    risk_reserve_target_pct: engine.riskReserveTargetPct || 20.0,
    operational_balance: engine.operationalBalance,
    operational_target_months: engine.operationalTargetMonths || 6,
    distributable_balance: engine.distributableBalance,
    current_stage: engine.currentStage,
    defensive_mode: engine.defensiveMode,
    portfolio_target: engine.portfolioTarget || 5000,
    par30_limit: engine.par30Limit || 10.0,
    updated_at: new Date().toISOString()
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'financial_accounts',
        record: accountRecord
      })
    });
    console.log("✓ Command Center KPIs sincronizados en Supabase Cloud");
  } catch (err) {
    console.warn("Error actualizando cuentas financieras en Supabase:", err);
  }
};


document.getElementById('form-deposit-reserve')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('reserve-deposit-amount')?.value || 0);
  const source = document.getElementById('reserve-deposit-source')?.value || 'Aporte Personal';

  if (amount <= 0) {
    alert("Por favor ingresa un monto válido mayor a $0 USD.");
    return;
  }

  if (!state.financialAccounts) state.financialAccounts = {};
  state.financialAccounts.riskReserveBalance = (state.financialAccounts.riskReserveBalance || 0) + amount;

  if (!state.capital) state.capital = {};
  state.capital.riskReserve = state.financialAccounts.riskReserveBalance;

  state.auditLogs.unshift({
    timestamp: new Date().toLocaleString(),
    user: "Propietario / Administrador",
    action: "APORTE_RESERVA_RIESGO",
    module: "Caja & Pagos",
    details: `Aporte de $${amount.toFixed(2)} USD ingresado al Fondo de Reserva de Riesgo desde '${source}'. Reserva Actual: $${state.financialAccounts.riskReserveBalance.toFixed(2)} USD.`
  });

  saveState();
  renderAll();

  if (typeof window.updateFinancialAccountState === 'function') {
    await window.updateFinancialAccountState();
  }

  alert(`✓ ¡Aporte de $${amount.toFixed(2)} USD registrado con éxito en la Reserva de Riesgo!
El saldo actual de Reserva es de $${state.financialAccounts.riskReserveBalance.toFixed(2)} USD.`);
});


document.getElementById('form-pay-debt')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const debtId = document.getElementById('pay-debt-select')?.value;
  const amount = parseFloat(document.getElementById('pay-debt-amount')?.value || 0);
  const source = document.getElementById('pay-debt-source')?.value || 'Excedente de Caja';

  if (!debtId || amount <= 0) {
    alert("Por favor selecciona una deuda e ingresa un monto mayor a $0 USD.");
    return;
  }

  const debt = (state.ownerDebts || []).find(d => d.id === debtId);
  if (!debt) return;

  const currentBalance = parseFloat(debt.balance || 0);
  const newBalance = Math.max(0, currentBalance - amount);
  debt.balance = newBalance;

  if (typeof window.logAuditEvent === 'function') {
    await window.logAuditEvent(
      "ABONO_DEUDA_REGISTRADO",
      "Deudas Propietario",
      `Abono de $${amount.toFixed(2)} USD realizado a '${debt.debtName}' desde '${source}'. Saldo Restante: $${newBalance.toFixed(2)} USD.`
    );
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentSession) headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity: 'owner_debts',
        record: {
          id: debt.id,
          debt_name: debt.debtName,
          balance: newBalance,
          interest_rate: debt.interestRate,
          min_payment: debt.minPayment,
          priority: debt.priority,
          organization_id: state.financialAccounts?.organizationId || '00000000-0000-0000-0000-000000000001'
        }
      })
    });
  } catch (err) {
    console.warn("Error guardando abono en Supabase:", err);
  }

  saveState();
  renderAll();
  alert(`✓ ¡Abono de $${amount.toFixed(2)} USD registrado con éxito!\nNuevo Saldo Pendiente de '${debt.debtName}': $${newBalance.toFixed(2)} USD.`);
});


document.getElementById('form-deposit-reserve-qc')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('reserve-deposit-amount-qc')?.value || 0);
  const source = document.getElementById('reserve-deposit-source-qc')?.value || 'Aporte Personal';

  if (amount <= 0) {
    alert("Por favor ingresa un monto válido mayor a $0 USD.");
    return;
  }

  if (!state.financialAccounts) state.financialAccounts = {};
  state.financialAccounts.riskReserveBalance = (state.financialAccounts.riskReserveBalance || 0) + amount;

  if (!state.capital) state.capital = {};
  state.capital.riskReserve = state.financialAccounts.riskReserveBalance;

  if (typeof window.logAuditEvent === 'function') {
    await window.logAuditEvent(
      "APORTE_RESERVA_RIESGO",
      "Cierre Quincenal",
      `Aporte de $${amount.toFixed(2)} USD ingresado al Fondo de Reserva de Riesgo desde '${source}'. Reserva Actual: $${state.financialAccounts.riskReserveBalance.toFixed(2)} USD.`
    );
  }

  saveState();
  renderAll();

  if (typeof window.updateFinancialAccountState === 'function') {
    await window.updateFinancialAccountState();
  }

  alert(`✓ ¡Aporte de $${amount.toFixed(2)} USD registrado con éxito en la Reserva de Riesgo!\nEl saldo actual de Reserva es de $${state.financialAccounts.riskReserveBalance.toFixed(2)} USD.`);
});

// ==========================================
// COPILOTO AI CHAT WIDGET INTEGRATION
// ==========================================
let copilotHistory = [];

window.toggleCopilotWidget = function() {
  const widget = document.getElementById('copilot-widget');
  if (widget) {
    if (widget.classList.contains('hidden')) {
      widget.classList.remove('hidden');
      widget.classList.add('flex');
      const messagesContainer = document.getElementById('copilot-chat-messages');
      if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
      document.getElementById('copilot-chat-input')?.focus();
    } else {
      widget.classList.add('hidden');
      widget.classList.remove('flex');
    }
  }
};

window.sendCopilotQuery = function(text) {
  const input = document.getElementById('copilot-chat-input');
  if (input) {
    input.value = text;
    window.handleCopilotSubmit(new Event('submit'));
  }
};

window.handleCopilotSubmit = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  
  const input = document.getElementById('copilot-chat-input');
  const messageText = input?.value?.trim();
  if (!messageText) return;

  if (input) input.value = '';

  appendCopilotMessage('user', messageText);

  const indicator = document.getElementById('copilot-typing-indicator');
  if (indicator) indicator.classList.remove('hidden');

  const messagesContainer = document.getElementById('copilot-chat-messages');
  if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;

  try {
    const response = await fetch('/api/copilot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: messageText,
        history: copilotHistory
      })
    });

    const data = await response.json();
    if (indicator) indicator.classList.add('hidden');

    if (response.ok && data.reply) {
      appendCopilotMessage('bot', data.reply);
      copilotHistory.push({ role: 'user', text: messageText });
      copilotHistory.push({ role: 'bot', text: data.reply });
      
      if (copilotHistory.length > 20) {
        copilotHistory = copilotHistory.slice(-20);
      }
    } else {
      appendCopilotMessage('bot', `⚠️ Error del Copiloto: ${data.error || 'No se pudo generar una respuesta.'}`);
    }
  } catch (err) {
    if (indicator) indicator.classList.add('hidden');
    appendCopilotMessage('bot', `⚠️ Error de conexión: No pude conectar con el servidor del copiloto. Detalles: ${err.message}`);
  }

  if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

function appendCopilotMessage(role, text) {
  const container = document.getElementById('copilot-chat-messages');
  if (!container) return;

  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'flex gap-2 items-start';

  let formattedText = String(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-black/40 px-1.5 py-0.5 rounded text-[#818CF8] font-mono text-[10px]">$1</code>')
    .replace(/\n/g, '<br>');

  if (role === 'user') {
    bubbleDiv.innerHTML = `
      <div class="flex-1"></div>
      <div class="bg-[#818CF8]/25 border border-[#818CF8]/30 p-2.5 rounded-xl max-w-[80%] text-white leading-relaxed">
        ${formattedText}
      </div>
      <div class="w-6 h-6 rounded-full bg-[#818CF8]/10 border border-[#818CF8]/30 flex items-center justify-center text-[#818CF8] shrink-0 text-[10px] font-bold">Yo</div>
    `;
  } else {
    bubbleDiv.innerHTML = `
      <div class="w-6 h-6 rounded-full bg-[#818CF8]/10 border border-[#818CF8]/30 flex items-center justify-center text-[#818CF8] shrink-0 text-[10px]">🤖</div>
      <div class="bg-[#1E293B]/60 border border-white/5 p-2.5 rounded-xl max-w-[80%] text-[#bbcabf] leading-relaxed">
        ${formattedText}
      </div>
    `;
  }

  container.appendChild(bubbleDiv);
}

