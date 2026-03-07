from tribble.config import Settings


def test_stage2_flags_default_to_safe_values(monkeypatch):
    monkeypatch.setenv("TRIBBLE_SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("TRIBBLE_SUPABASE_SERVICE_KEY", "svc")
    monkeypatch.setenv("TRIBBLE_SUPABASE_ANON_KEY", "anon")
    # Bypass .env file to avoid local config leaking into test
    s = Settings(_env_file=None)
    assert s.enable_openclaw is False
    assert s.enable_flock is False
    assert s.enable_satellite_ml is False
    assert s.enable_satellite_ai_analysis is False
