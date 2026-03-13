(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const placeholderUrl = "https://YOUR_PROJECT_ID.supabase.co";
  const placeholderKey = "YOUR_SUPABASE_ANON_KEY";

  function isConfigured() {
    return Boolean(
      cfg.url &&
        cfg.anonKey &&
        cfg.url !== placeholderUrl &&
        cfg.anonKey !== placeholderKey
    );
  }

  let client = null;
  function getClient() {
    if (!isConfigured()) return null;
    if (!client) {
      client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }
    return client;
  }

  function bucketName() {
    return cfg.bucket || "gallery-media";
  }

  window.AppSupabase = {
    isConfigured,
    getClient,
    bucketName,
    config: cfg,
  };
})();

