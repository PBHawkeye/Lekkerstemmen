// Vercel serverless function: /api/set-member-password

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password, profile_id } = req.body || {};
  if (!email || !password || !profile_id) {
    return res.status(400).json({ error: 'Missing fields', received: { email: !!email, password: !!password, profile_id: !!profile_id } });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wzdxkyclnwpopbfembpp.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SERVICE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' });
  }

  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    // Maak nieuw account aan via admin API
    const crRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { profile_id }
      })
    });

    const crData = await crRes.json();

    if (crData.error || (!crData.id && !crData.user)) {
      // Account bestaat al — update wachtwoord
      // Zoek eerst het ID
      const listRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`,
        { headers }
      );
      const listData = await listRes.json();
      const existing = (listData.users || []).find(u => u.email === email);

      if (!existing) {
        return res.status(400).json({ 
          error: 'Kon account niet aanmaken en niet vinden', 
          createError: crData.error || crData,
        });
      }

      // Update wachtwoord
      const upRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ password })
      });
      const upData = await upRes.json();
      if (upData.error) return res.status(400).json({ error: 'Update mislukt: ' + upData.error.message });

      // Koppel profiel ID
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile_id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ id: existing.id })
      });

      return res.json({ success: true, user_id: existing.id, action: 'updated' });
    }

    const userId = crData.id || crData.user?.id;

    // Koppel auth ID aan profiel
    if (userId !== profile_id) {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile_id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ id: userId })
      });
    }

    return res.json({ success: true, user_id: userId, action: 'created' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
