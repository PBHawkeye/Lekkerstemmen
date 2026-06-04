// Vercel serverless function: /api/set-member-password
// Gebruikt Supabase Admin API om wachtwoord te zetten — geen hash-problemen

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password, profile_id } = req.body;
  if (!email || !password || !profile_id) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wzdxkyclnwpopbfembpp.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Missing service role key' });

  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  // Zoek bestaande user op email
  const listRes = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}&page=1&per_page=1`,
    { headers }
  );
  const listData = await listRes.json();
  const existing = listData.users?.[0];

  let userId;
  if (existing) {
    // Update wachtwoord via admin API
    const upRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ password })
    });
    const upData = await upRes.json();
    if (upData.error) return res.status(400).json({ error: upData.error });
    userId = existing.id;
  } else {
    // Maak nieuw account aan
    const crRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, email_confirm: true })
    });
    const crData = await crRes.json();
    if (crData.error) return res.status(400).json({ error: crData.error });
    userId = crData.id;
  }

  // Koppel auth user ID aan profiles tabel
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile_id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ id: userId })
  });

  res.json({ success: true, user_id: userId });
}
