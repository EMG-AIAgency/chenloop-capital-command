const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGINS = [
  'chenloop.mynvix.co',
  'chenloop-capital-command.vercel.app',
  'chenloop-capital-command-emg-aiagencys-projects.vercel.app',
  'chenloop-capital-command-git-main-emg-aiagencys-projects.vercel.app'
];

const ALLOWED_ENTITIES = [
  'organizations', 'borrowers', 'applications', 'loans', 'collections', 'payments',
  'notifications', 'audit_logs', 'financial_accounts', 'operational_expenses',
  'quincenal_closes', 'owner_debts', 'financial_movements', 'profiles'
];

module.exports = async (req, res) => {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  const requestOrigin = req.headers.origin || req.headers.Origin;
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin.replace(/^https?:\/\//, ''))) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  }
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

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: "Missing Supabase Environment Variables on Vercel Server" });
  }

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: "No autenticado" });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData || !authData.user) {
    return res.status(401).json({ error: "Sesión inválida o expirada" });
  }

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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', authData.user.id)
    .single();

  const callerOrgId = profile && profile.organization_id;
  if (profileError || !callerOrgId) {
    return res.status(403).json({ error: "No se pudo determinar la organización del usuario" });
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
        supabase.from('organizations').select('*').eq('id', callerOrgId),
        supabase.from('borrowers').select('*').eq('organization_id', callerOrgId),
        supabase.from('applications').select('*').eq('organization_id', callerOrgId),
        supabase.from('loans').select('*').eq('organization_id', callerOrgId),
        supabase.from('collections').select('*').eq('organization_id', callerOrgId),
        supabase.from('payments').select('*').eq('organization_id', callerOrgId).order('payment_date', { ascending: false }),
        supabase.from('notifications').select('*').eq('organization_id', callerOrgId).order('created_at', { ascending: false }).limit(100),
        supabase.from('audit_logs').select('*').eq('organization_id', callerOrgId).order('created_at', { ascending: false }).limit(100),
        supabase.from('financial_accounts').select('*').eq('organization_id', callerOrgId),
        supabase.from('operational_expenses').select('*').eq('organization_id', callerOrgId).order('created_at', { ascending: false }),
        supabase.from('quincenal_closes').select('*').eq('organization_id', callerOrgId).order('created_at', { ascending: false }),
        supabase.from('owner_debts').select('*').eq('organization_id', callerOrgId).order('created_at', { ascending: false }),
        supabase.from('financial_movements').select('*').eq('organization_id', callerOrgId).order('created_at', { ascending: false })
      ]);

      // Log any fetch errors (non-fatal) but still return what we have
      const errorSources = [
        ['organizations', e1], ['borrowers', e2], ['applications', e3], ['loans', e4],
        ['collections', e5], ['payments', e6], ['notifications', e7], ['auditLogs', e8],
        ['financialAccounts', e9], ['operationalExpenses', e10], ['quincenalCloses', e11],
        ['ownerDebts', e12], ['financialMovements', e13]
      ].filter(([, e]) => Boolean(e));
      const partialErrors = errorSources.map(([table, e]) => `${table}: ${e.message}`);
      if (partialErrors.length) console.warn('Supabase GET partial errors:', partialErrors);

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
        financialMovements: financialMovements || [],
        partialErrors
      });
    }

    if (req.method === 'POST') {
      const { entity, record } = req.body || {};
      if (!entity || !record) {
        return res.status(400).json({ error: "Invalid payload: entity and record are required" });
      }

      if (!ALLOWED_ENTITIES.includes(entity)) {
        return res.status(400).json({ error: "Entidad no permitida" });
      }

      // Sanitize: remove undefined values
      const cleanRecord = Object.fromEntries(
        Object.entries(record).filter(([_, v]) => v !== undefined && v !== null || v === 0 || v === '')
      );

      if (entity === 'organizations') {
        if (cleanRecord.id !== callerOrgId) {
          return res.status(403).json({ error: "No puedes modificar una organización distinta a la tuya" });
        }
      } else {
        // Nunca confiar en el organization_id que manda el cliente
        cleanRecord.organization_id = callerOrgId;
      }

      if (cleanRecord.deleted && cleanRecord.id) {
        let deleteQuery = supabase.from(entity).delete().eq('id', cleanRecord.id);
        if (entity !== 'organizations') {
          deleteQuery = deleteQuery.eq('organization_id', callerOrgId);
        }
        const { error } = await deleteQuery;
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
