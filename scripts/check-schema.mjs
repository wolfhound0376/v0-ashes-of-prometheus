import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // Check characters table columns
  const { data: chars } = await supabase.from('characters').select('*').limit(1);
  console.log('Characters columns:', chars ? Object.keys(chars[0] || {}) : 'none');
  
  // Check if npc_encounters table exists
  const { data: npcs, error: npcErr } = await supabase.from('npc_encounters').select('*').limit(1);
  console.log('npc_encounters:', npcErr ? 'NOT EXISTS - ' + npcErr.message : 'exists');
}

run();
