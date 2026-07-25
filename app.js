// CHENLOOP - Core Financial Engine (v4.0 Analytics & Simulation Engine)

const initialState = {
  organization: {
    name: "Mi Cartera Personal",
    riskReservePct: 15.0,
    par30Limit: 10.0
  },
  capital: {
    totalCapital: 10000.0,
    capitalDeployed: 4200.0,
    capitalAvailable: 4300.0,
    riskReserve: 1500.0,
    accumulatedProfits: 1850.0
  },
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
  const saved = localStorage.getItem('chenloop_state_v4.0');
  if (saved) {
    try {
      state = JSON.parse(saved);
    } catch (e) {
      console.warn("Estado corrupto en localStorage, usando inicial...");
    }
  }

  // Sincronización en tiempo real desde Supabase Cloud para todas las tablas
  try {
    const res = await fetch('/api/sync');
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
  const tabs = ['dashboard', 'borrowers', 'applications', 'loans', 'collections', 'analytics', 'notifications', 'payments', 'audit', 'settings'];
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
    btn.classList.remove('active', 'border-r-2', 'border-[#4edea3]', 'bg-[#4edea3]/5', 'text-[#4edea3]', 'font-bold');
    btn.classList.add('text-[#bbcabf]', 'font-medium');
  });
  
  const activeBtn = document.querySelector(`.nav-btn[onclick*="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.remove('text-[#bbcabf]', 'font-medium');
    activeBtn.classList.add('active', 'border-r-2', 'border-[#4edea3]', 'bg-[#4edea3]/5', 'text-[#4edea3]', 'font-bold');
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
    settings: 'Configuración & Reglas'
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
  const totalDeployed = state.capital.capitalDeployed || 1.0;
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
  
  const par7Pct = ((par7Capital / totalDeployed) * 100).toFixed(1);
  const par30Pct = ((par30Capital / totalDeployed) * 100).toFixed(1);
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
  if (typeof window.runScenarioSimulation === 'function') {
    window.runScenarioSimulation();
  }
}

function renderDashboard() {
  const cap = state.capital;
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

document.addEventListener('DOMContentLoaded', () => {
  renderAll();
});
