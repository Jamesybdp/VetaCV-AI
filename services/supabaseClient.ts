
import { createClient } from '@supabase/supabase-js';

// ⚠️ IMPORTANT: REPLACE THESE WITH YOUR ACTUAL SUPABASE URL AND ANON KEY
// You can find these in your Supabase Dashboard -> Settings -> API
const SUPABASE_URL = 'https://jtkfonblgbkghwcrthbx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0a2ZvbmJsZ2JrZ2h3Y3J0aGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MjY3OTgsImV4cCI6MjA4NDIwMjc5OH0.rYKcmolhcMsS-zgMD1rIZfcIsa3oLUs5mkj7nTZCvB8';

// Initialize the Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
