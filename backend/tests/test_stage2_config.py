from tribble.config import Settings


def test_stage2_flags_default_to_safe_values(monkeypatch):
    monkeypatch.setenv("TRIBBLE_SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("TRIBBLE_SUPABASE_SERVICE_KEY", "svc")
    monkeypatch.setenv("TRIBBLE_SUPABASE_ANON_KEY", "anon")
    s = Settings()
    assert s.enable_openclaw is False
    assert s.enable_flock is False
    assert s.enable_satellite_ml is False
