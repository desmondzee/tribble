import os

# Hard-assign to prevent real credentials leaking into tests
os.environ["TRIBBLE_SUPABASE_URL"] = "https://test.supabase.co"
os.environ["TRIBBLE_SUPABASE_SERVICE_KEY"] = "test-key"
os.environ["TRIBBLE_SUPABASE_ANON_KEY"] = "test-key"
