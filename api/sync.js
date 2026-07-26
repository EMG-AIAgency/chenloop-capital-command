const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Missing Supabase Environment Variables on Vercel Server" });
  }

  const authHeader = req.headers.authorization || '';
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {}
    }
  });

  try {
    if (req.method === 'GET') {
      const { data: borrowers } = await supabase.from('borrowers').select('*');
      const { data: applications } = await supabase.from('applications').select('*');
      const { data: loans } = await supabase.from('loans').select('*');
      const { data: collections } = await supabase.from('collections').select('*');
      const { data: payments } = await supabase.from('payments').select('*');
      const { data: notifications } = await supabase.from('notifications').select('*');
      const { data: auditLogs } = await supabase.from('audit_logs').select('*');
      const { data: financialAccounts } = await supabase.from('financial_accounts').select('*');
      const { data: operationalExpenses } = await supabase.from('operational_expenses').select('*');
      const { data: quincenalCloses } = await supabase.from('quincenal_closes').select('*');
      const { data: ownerDebts } = await supabase.from('owner_debts').select('*');
      const { data: financialMovements } = await supabase.from('financial_movements').select('*');

      return res.status(200).json({
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

    if (req.method === 'POST') {
      const { entity, record } = req.body || {};
      if (!entity || !record) {
        return res.status(400).json({ error: "Invalid payload format" });
      }

      const { data, error } = await supabase.from(entity).upsert(record);
      if (error) throw error;

      return res.status(200).json({ success: true, data });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
