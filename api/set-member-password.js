// /api/set-member-password — Vercel serverless function
// Beveiligd: alleen authenticated Supabase users mogen dit aanroepen

export default async function handler(req, res) {
  // 1. Alleen POST
  if (req.method !== 'POST') return res.status(405).end();

  // 2. CORS — alleen eigen domein
  const origin = req.headers.origin || '';
  const allowed = ['https://lekkerstemmen.app', 'https://www.lekkerstemmen.app'];
  if (origin && !allowed.includes(origin) && !origin.includes('vercel.app')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);

  const { email, password, profile_id } = req.body || {};
  if (!email || !password || !profile_id) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  // 3. Wachtwoord minimale lengte
  if (password.length < 6) {
    return res.status(400).json({ error: 'Wachtwoord minimaal 6 tekens' });
  }

  // 4. Email formaat validatie (geen @ in local part)
  if (!email.includes('@') || email.split('@').length !== 2) {
    return res.status(400).json({ error: 'Ongeldig email formaat' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wzdxkyclnwpopbfembpp.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server not configured' });

  // 5. Verificeer dat de aanvrager een geldige Supabase sessie heeft
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Niet ingelogd' });
  }
  const userToken = authHeader.replace('Bearer ', '');

  // Haal de ingelogde user op
  const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userToken}` }
  });
  if (!meRes.ok) return res.status(401).json({ error: 'Ongeldige sessie' });
  const me = await meRes.json();

  // 6. Controleer dat de aanvrager een parent is in hetzelfde gezin als het profiel
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile_id}&select=family_id,role`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Accept: 'application/json' } }
  );
  const profiles = await profileRes.json();
  const targetProfile = profiles?.[0];
  if (!targetProfile) return res.status(404).json({ error: 'Profiel niet gevonden' });

  const callerRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${me.id}&select=family_id,role`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Accept: 'application/json' } }
  );
  const callerProfiles = await callerRes.json();
  const caller = callerProfiles?.[0];

  if (!caller) return res.status(403).json({ error: 'Eigen profiel niet gevonden' });
  if (caller.family_id !== targetProfile.family_id) {
    return res.status(403).json({ error: 'Geen toegang tot dit gezin' });
  }
  if (caller.role !== 'parent') {
    return res.status(403).json({ error: 'Alleen ouders mogen wachtwoorden instellen' });
  }

  // 7. Voer de actie uit via Admin API
  const adminHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    // Verwijder bestaand account voor dit profile_id
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${profile_id}`, {
      method: 'DELETE', headers: adminHeaders
    });

    // Maak nieuw account aan met hetzelfde ID als het profiel
    const crRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ id: profile_id, email, password, email_confirm: true })
    });
    const crData = await crRes.json();

    if (!crData.id) {
      return res.status(400).json({
        error: 'Aanmaken mislukt: ' + (crData.msg || crData.message || JSON.stringify(crData))
      });
    }

    return res.json({ success: true, user_id: crData.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
