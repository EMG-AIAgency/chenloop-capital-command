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

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    if (req.method === 'GET') {
      const { data: borrowers } = await supabase.from('borrowers').select('*');
      const { data: loans } = await supabase.from('loans').select('*');
      const { data: applications } = await supabase.from('applications').select('*');
      const { data: auditLogs } = await supabase.from('audit_logs').select('*');

      return res.status(200).json({
        borrowers: borrowers || [],
        loans: loans || [],
        applications: applications || [],
        auditLogs: auditLogs || []
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
