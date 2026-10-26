import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ppthiahwsqoiefwcbstg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_dfqCLo8XzOi-9O5qkIhScw_fsm2UUdj";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
