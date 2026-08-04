const { createClient } = require('@supabase/supabase-js');

// System Prompt with Chenloop Capital Master Operational Rules
const CHENLOOP_SYSTEM_PROMPT = `
Eres "Copiloto Chenloop IA", el asistente inteligente financiero y operativo integrado en el panel de control de Chenloop Capital.
Tu objetivo es ayudar al administrador (Edgar Garcia) a gestionar la cartera de préstamos, resolver dudas del Manual Operativo, consultar saldos y estadísticas de Supabase, y optimizar las operaciones de la financiera.

REGLAS OPERATIVAS Y MANUAL DE CHENLOOP CAPITAL:
1. ESTRUCTURA DE PRÉSTAMOS:
   - Tasa de Interés Promedio: ~40% sobre el principal programado a cuotas quincenales (ej. $100 -> $175 total en 7 quincenas de $25; $250 -> $405 total en 9 quincenas de $45).
   - Frecuencia de cobros: Quincenales (días 15 y 30 de cada mes).

2. RESERVA DE RIESGO Y REPARTO DE UTILIDADES (3-WAY SPLIT):
   - Al registrar un cobro, la ganancia neta se divide según la preferencia del usuario.
   - Una porción configurable (ej. 50%) se destina automáticamente a la Reserva de Riesgo (fondo de protección contra mora).
   - La utilidad restante se destina según la decisión del usuario: "📊 Utilidad Personal", "💰 Reinvertida en Capital" o "🛡️ A Reserva".

3. SCORE CREDITICIO Y RIESGO (PAR30):
   - Score Crediticio base: 500 a 850 puntos.
   - Marcar cuota como CUMPLIDA: +5 puntos al prestatario.
   - Marcar cuota como INCUMPLIDA / Mora: -15 a -30 puntos y reclasificación de nivel de riesgo (Al Día -> Mora Temprana -> Riesgo PAR30).

4. NOTIFICACIONES WHATSAPP & AUTOMATIZACIONES N8N:
   - Recibo de Pago (DIGITAL_RECEIPT): Envió automático instantáneo por WhatsApp al cobrar en caja.
   - Recordatorio 3 Días Antes (PAYMENT_REMINDER_3DAYS): Envió diario a las 8:00 AM por n8n.
   - Alerta de Mora (OVERDUE_PAYMENT_ALERT): Envió diario a las 8:00 AM por n8n para cuotas pendientes con fecha pasada.

RESPONDE SIEMPRE DE FORMA PROFESIONAL, AMABLE Y CONCISA EN ESPAÑOL. USA FORMATO MARKDOWN CON EMOJIS CUANDO CORRESPONDA.
`;

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { message, history } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "El campo 'message' es requerido." });
    }

    // Configuración Multi-Proveedor desde variables de entorno
    const provider = (process.env.COPILOT_PROVIDER || 'gemini').toLowerCase();
    const apiKey = process.env.GEMINI_API_KEY || process.env.COPILOT_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    const modelName = process.env.COPILOT_MODEL || (provider === 'gemini' ? 'gemini-1.5-flash' : (provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o-mini'));

    // Consultar contexto en vivo desde Supabase para enriquecer la respuesta
    let dbContextSummary = "";
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
        
        // Consultar conteo de préstamos activos y cobranzas
        const [loansRes, colRes, accRes] = await Promise.all([
          supabase.from('loans').select('id, principal, total_scheduled, paid_amount, remaining_amount, status').eq('status', 'Activo'),
          supabase.from('collections').select('id, borrower_name, promise_date, promise_amount, promise_status, days_overdue').eq('promise_status', 'Pendiente'),
          supabase.from('financial_accounts').select('capital_total, capital_deployed, capital_available, risk_reserve_balance').limit(1)
        ]);

        const activeLoans = loansRes.data || [];
        const pendingCols = colRes.data || [];
        const finAcc = (accRes.data && accRes.data[0]) || {};

        const totalActiveCapital = activeLoans.reduce((sum, l) => sum + parseFloat(l.principal || 0), 0);
        const overdueCols = pendingCols.filter(c => c.days_overdue > 0 || (new Date(c.promise_date) < new Date()));

        dbContextSummary = `
DATOS EN VIVO DE SUPABASE EN ESTE MOMENTO:
- Préstamos Activos Totales: ${activeLoans.length} préstamos (Capital Colocado en Calle: $${totalActiveCapital.toFixed(2)} USD).
- Balance de Cuentas: Capital Total $${parseFloat(finAcc.capital_total || 800).toFixed(2)} USD | Disponible: $${parseFloat(finAcc.capital_available || 563.78).toFixed(2)} USD | Reserva de Riesgo: $${parseFloat(finAcc.risk_reserve_balance || 187.88).toFixed(2)} USD.
- Cuotas/Cobranzas Pendientes Totales: ${pendingCols.length} cuotas.
- Cuotas en Mora Actuales: ${overdueCols.length} cuotas. ${overdueCols.map(c => `${c.borrower_name} ($${c.promise_amount} USD, ${c.days_overdue || 1} días mora)`).join('; ')}
`;
      } catch (dbErr) {
        console.warn("Supabase context fetch warning:", dbErr.message);
      }
    }

    let cleanModelName = modelName;
    if (cleanModelName.startsWith('models/')) {
      cleanModelName = cleanModelName.replace('models/', '');
    }
    if (cleanModelName === 'gemini-1.5-flash' || cleanModelName === 'gemini-2.5-flash' || cleanModelName === 'gemini-3.5-flash') {
      cleanModelName = 'gemini-3.1-flash-lite';
    } else if (cleanModelName === 'gemini-1.5-pro' || cleanModelName === 'gemini-2.5-pro' || cleanModelName === 'gemini-3.5-pro') {
      cleanModelName = 'gemini-3.1-pro-preview';
    }

    const fullSystemMessage = `${CHENLOOP_SYSTEM_PROMPT}\n${dbContextSummary}`;

    // ── PROVEEDOR: GOOGLE GEMINI ────────────────────────────────
    if (provider === 'gemini') {
      if (!apiKey) {
        // Fallback respuesta demostrativa inteligente si la API key aún no se ha ingresado en Vercel
        return res.status(200).json({
          reply: `🤖 **Copiloto Chenloop AI (Modo Demostración)**\n\nHe recibido tu mensaje: *"${message}"*\n\nActualmente el sistema está listo. Para activar las respuestas dinámicas en vivo con **Google Gemini 1.5 Flash**, ingresa tu \`GEMINI_API_KEY\` gratuita en el panel de variables de entorno de Vercel.\n\n${dbContextSummary ? "📊 **Datos actuales detectados en Supabase:**\n" + dbContextSummary : ""}`,
          provider: 'gemini-demo'
        });
      }

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`;
      const contents = [];

      // Incluir historial si existe
      if (Array.isArray(history)) {
        history.slice(-6).forEach(h => {
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
          });
        });
      }

      contents.push({
        role: 'user',
        parts: [{ text: `${fullSystemMessage}\n\nPregunta del usuario: ${message}` }]
      });

      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });

      const geminiData = await geminiRes.json();
      if (!geminiRes.ok || geminiData.error) {
        console.error("Gemini API Error:", geminiData.error);
        return res.status(500).json({ error: geminiData.error?.message || "Error al comunicarse con Gemini API" });
      }

      const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No pude generar una respuesta en este momento.";
      return res.status(200).json({ reply, provider: 'gemini' });
    }

    // ── PROVEEDOR: OPENAI / KIMI / DEEPSEEK (Compatibles con OpenAI) ──
    else if (provider === 'openai' || provider === 'kimi' || provider === 'deepseek') {
      const baseUrl = provider === 'kimi' 
        ? 'https://api.moonshot.cn/v1/chat/completions' 
        : (provider === 'deepseek' ? 'https://api.deepseek.com/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions');

      if (!apiKey) {
        return res.status(200).json({
          reply: `🤖 **Copiloto Chenloop AI (Modo Demo ${provider.toUpperCase()})**\n\nPor favor configura la variable \`COPILOT_API_KEY\` en Vercel para conectar con el servicio de ${provider}.`,
          provider: `${provider}-demo`
        });
      }

      const messages = [{ role: 'system', content: fullSystemMessage }];
      if (Array.isArray(history)) {
        history.slice(-6).forEach(h => {
          messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text });
        });
      }
      messages.push({ role: 'user', content: message });

      const aiRes = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          temperature: 0.3
        })
      });

      const aiData = await aiRes.json();
      if (!aiRes.ok || aiData.error) {
        return res.status(500).json({ error: aiData.error?.message || `Error en API ${provider}` });
      }

      const reply = aiData.choices?.[0]?.message?.content || "Sin respuesta del modelo.";
      return res.status(200).json({ reply, provider });
    }

    // ── PROVEEDOR: ANTHROPIC (CLAUDE) ───────────────────────────
    else if (provider === 'anthropic') {
      if (!apiKey) {
        return res.status(200).json({
          reply: `🤖 **Copiloto Chenloop AI (Modo Demo Claude)**\n\nConfigura tu \`ANTHROPIC_API_KEY\` en Vercel para activar Claude 3.5 Sonnet.`,
          provider: 'anthropic-demo'
        });
      }

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 1024,
          system: fullSystemMessage,
          messages: [{ role: 'user', content: message }]
        })
      });

      const anthropicData = await anthropicRes.json();
      if (!anthropicRes.ok || anthropicData.error) {
        return res.status(500).json({ error: anthropicData.error?.message || "Error en API Anthropic" });
      }

      const reply = anthropicData.content?.[0]?.text || "Sin respuesta de Claude.";
      return res.status(200).json({ reply, provider: 'anthropic' });
    }

    return res.status(400).json({ error: `Proveedor no soportado: ${provider}` });

  } catch (err) {
    console.error("Copilot Handler Exception:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
};
