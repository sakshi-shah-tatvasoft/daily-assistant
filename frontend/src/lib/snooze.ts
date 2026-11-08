import { supabase } from './supabase';

/** Snooze a check-in ('after_dinner', 'custom-<id>') for N minutes. Replaces any existing snooze for it. */
export async function snooze(key: string, minutes: number): Promise<Date> {
  const due = new Date(Date.now() + minutes * 60_000);
  const { error } = await supabase.from('snoozes')
    .upsert({ key, due_at: due.toISOString() }, { onConflict: 'user_id,key' });
  if (error) throw error;
  return due;
}

export async function getSnooze(key: string): Promise<Date | null> {
  const { data, error } = await supabase.from('snoozes').select('due_at').eq('key', key).maybeSingle();
  if (error || !data) return null;
  const due = new Date(data.due_at);
  return due > new Date() ? due : null;
}

export async function cancelSnooze(key: string) {
  await supabase.from('snoozes').delete().eq('key', key);
}
