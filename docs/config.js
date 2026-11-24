// StudyPath cloud settings.
// Leave everything empty and the app keeps all data on the device (it still works fully).
// To turn on cloud backup + the research dashboard, create a free Supabase project, run
// supabase/setup.sql in its SQL editor, then paste the project URL and the anon/publishable key here.
// The anon/publishable key is MEANT to be public: Row Level Security protects the data.
// NEVER paste the "service_role" / "secret" key here.
window.STUDYPATH_CONFIG = {
  supabaseUrl: '', // like 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: '', // the long "anon" (or "sb_publishable_...") key
};
