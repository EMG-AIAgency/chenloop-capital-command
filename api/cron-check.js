const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // Habilitar CORS
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

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: "Missing Supabase Environment Variables on Vercel Server" });
  }

  // We can use the anon key since we call the get_pending_notifications RPC function
  // which runs as SECURITY DEFINER (bypassing RLS) on the database.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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

    return res.status(200).json(data || []);
  } catch (err) {
    console.error("Cron check execution failed:", err);
    return res.status(500).json({ error: err.message });
  }
};
