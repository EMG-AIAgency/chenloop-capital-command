const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

module.exports = async (req, res) => {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Cron-Secret'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Modo de gracia: si CRON_SHARED_SECRET no esta configurada en Vercel,
  // el chequeo no se activa (compatibilidad total con el comportamiento
  // actual). Una vez configurada, valida el header X-Cron-Secret, pero
  // TODAVIA acepta requests sin ese header (solo con una advertencia en
  // los logs) hasta que se confirme que el workflow de n8n en Railway ya
  // lo esta enviando. Retirar ese caso de gracia es un cambio separado,
  // posterior a esa confirmacion.
  const cronSharedSecret = process.env.CRON_SHARED_SECRET;
  if (cronSharedSecret) {
    const provided = req.headers['x-cron-secret'] || req.headers['X-Cron-Secret'];
    if (provided) {
      const a = Buffer.from(String(provided));
      const b = Buffer.from(cronSharedSecret);
      const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!valid) {
        return res.status(401).json({ error: "Secreto de cron invalido" });
      }
    } else {
      console.warn('[cron-check] MODO DE GRACIA: request sin header X-Cron-Secret aceptado temporalmente. Actualizar el workflow de n8n en Railway para incluir el header antes de retirar este modo.');
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || (!supabaseServiceKey && !supabaseAnonKey)) {
    return res.status(500).json({ error: "Missing Supabase Environment Variables on Vercel Server" });
  }

  // Use service role key if available to bypass RLS and allow inserts, fallback to anon key
  const supabaseKey = supabaseServiceKey || supabaseAnonKey;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    const { data, error } = await supabase.rpc('get_pending_notifications');
    if (error) {
      console.error("Supabase RPC error:", error.message);
      return res.status(500).json({ error: error.message });
    }

    // Auto-log these automated cron runs to the notifications table so they persist in the UI history
    if (data && data.length > 0) {
      const logsToInsert = data.map(item => ({
        id: crypto.randomUUID(),
        organization_id: '00000000-0000-0000-0000-000000000001',
        borrower_name: `${item.borrower_name} (${item.phone})`,
        channel: item.event === 'OVERDUE_PAYMENT_ALERT' ? 'WhatsApp / n8n [MORA]' : 'WhatsApp / n8n [RECORDATORIO]',
        event: item.event,
        message: JSON.stringify(item),
        status: 'Enviado (Automático)',
        created_at: new Date().toISOString()
      }));

      const { error: insertError } = await supabase.from('notifications').insert(logsToInsert);
      if (insertError) {
        console.error("Error inserting notifications log:", insertError.message);
      }
    }

    return res.status(200).json(data || []);
  } catch (err) {
    console.error("Cron check execution failed:", err);
    return res.status(500).json({ error: err.message });
  }
};
