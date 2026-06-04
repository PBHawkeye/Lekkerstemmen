export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password, profile_id } = req.body || {};
  if (!email || !password || !profile_id) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wzdxkyclnwpopbfembpp.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' });

  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    // Verwijder bestaand auth account voor dit profiel (als dat er is)
    // zodat we opnieuw kunnen aanmaken met het juiste ID
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${profile_id}`, {
      method: 'DELETE',
      headers
    });

    // Maak auth account aan met exact hetzelfde ID als het profiel
    const crRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: profile_id,  // gebruik profiel-ID als auth-ID
        email,
        password,
        email_confirm: true
      })
    });
    const crData = await crRes.json();
    console.log('Create result:', JSON.stringify(crData).slice(0, 300));

    if (!crData.id) {
      return res.status(400).json({ 
        error: 'Aanmaken mislukt: ' + (crData.msg || crData.message || JSON.stringify(crData))
      });
    }

    return res.json({ success: true, user_id: crData.id });

  } catch (e) {
    console.error('Exception:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
