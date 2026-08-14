const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || (!supabaseServiceKey && !supabaseAnonKey)) {
    return res.status(500).json({ error: "Missing Supabase Environment Variables on Vercel Server" });
  }

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader && authHeader.split(' ')[1];

  let supabase;
  if (supabaseServiceKey) {
    // Use service role key for server-side operations (bypasses RLS completely)
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  } else {
    // Fallback to anon key, but we MUST pass the user's JWT to evaluate RLS correctly
    const clientOptions = {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    };
    if (token) {
      clientOptions.global = {
        headers: {
          Authorization: `Bearer ${token}`
        }
      };
    }
    supabase = createClient(supabaseUrl, supabaseAnonKey, clientOptions);
  }

  try {
    if (req.method === 'GET') {
      const [
        { data: organizations, error: e1 },
        { data: borrowers, error: e2 },
        { data: applications, error: e3 },
        { data: loans, error: e4 },
        { data: collections, error: e5 },
        { data: payments, error: e6 },
        { data: notifications, error: e7 },
        { data: auditLogs, error: e8 },
        { data: financialAccounts, error: e9 },
        { data: operationalExpenses, error: e10 },
        { data: quincenalCloses, error: e11 },
        { data: ownerDebts, error: e12 },
        { data: financialMovements, error: e13 }
      ] = await Promise.all([
        supabase.from('organizations').select('*'),
        supabase.from('borrowers').select('*'),
        supabase.from('applications').select('*'),
        supabase.from('loans').select('*'),
        supabase.from('collections').select('*'),
        supabase.from('payments').select('*').order('payment_date', { ascending: false }),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('financial_accounts').select('*'),
        supabase.from('operational_expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('quincenal_closes').select('*').order('created_at', { ascending: false }),
        supabase.from('owner_debts').select('*').order('created_at', { ascending: false }),
        supabase.from('financial_movements').select('*').order('created_at', { ascending: false })
      ]);

      // Log any fetch errors (non-fatal) but still return what we have
      const errs = [e1,e2,e3,e4,e5,e6,e7,e8,e9,e10,e11,e12,e13].filter(Boolean);
      if (errs.length) console.warn('Supabase GET partial errors:', errs.map(e => e.message));

      return res.status(200).json({
        organizations: organizations || [],
        borrowers: borrowers || [],
        applications: applications || [],
        loans: loans || [],
        collections: collections || [],
        payments: payments || [],
        notifications: notifications || [],
        auditLogs: auditLogs || [],
        financialAccounts: financialAccounts || [],
        operationalExpenses: operationalExpenses || [],
        quincenalCloses: quincenalCloses || [],
        ownerDebts: ownerDebts || [],
        financialMovements: financialMovements || []
      });
    }

        if (req.method === 'POST' && req.body && req.body.action === 'RESET_TEST_PAYMENTS') {
      console.log('Executing RESET_TEST_PAYMENTS via server-side client...');
      const { error: delErr } = await supabase.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const { error: loanErr } = await supabase.from('loans').update({ paid_amount: 0.0, remaining_amount: 175.0, status: 'Activo' }).eq('id', 'cea8820e-6341-47ec-a7a0-f03507db9f75');
      const { error: faErr } = await supabase.from('financial_accounts').update({ capital_deployed: 200.0, capital_available: 600.0, capital_total: 800.0 }).eq('id', '92700043-3f9d-484c-83d0-5ebbb0f05a7d');
      return res.status(200).json({ success: true, delErr: delErr ? delErr.message : null, loanErr: loanErr ? loanErr.message : null });
    }

    if (req.method === 'POST') {
      const { entity, record } = req.body || {};
      if (!entity || !record) {
        return res.status(400).json({ error: "Invalid payload: entity and record are required" });
      }

      // Sanitize: remove undefined values
      const cleanRecord = Object.fromEntries(
        Object.entries(record).filter(([_, v]) => v !== undefined && v !== null || v === 0 || v === '')
      );

      if (cleanRecord.deleted && cleanRecord.id) {
        const { error } = await supabase.from(entity).delete().eq('id', cleanRecord.id);
        if (error) {
          console.error(`Supabase DELETE error on ${entity}:`, error);
          return res.status(500).json({ error: error.message });
        }
        return res.status(200).json({ success: true, deleted: true });
      }

      // upsert with ignoreDuplicates: false so it always updates existing rows
      const { data, error } = await supabase
        .from(entity)
        .upsert(cleanRecord, { onConflict: 'id', ignoreDuplicates: false });

      if (error) {
        console.error(`Supabase UPSERT error on ${entity}:`, error);
        return res.status(500).json({ error: error.message, entity, record: cleanRecord });
      }

      return res.status(200).json({ success: true, data });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error('sync.js unhandled error:', err);
    return res.status(500).json({ error: err.message });
  }
};
