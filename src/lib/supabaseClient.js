import { createClient } from '@supabase/supabase-js';

const fallbackSupabaseUrl = 'https://iiwhhpshcbnxgmhkkilu.supabase.co';
const fallbackSupabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpd2hocHNoY2JueGdtaGtraWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NjI1MjcsImV4cCI6MjA5NjEzODUyN30.7Mo6ZWOznGWiK1L6xluc-b6sOC1r1_M237T_Nneexa0';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackSupabaseAnonKey;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
