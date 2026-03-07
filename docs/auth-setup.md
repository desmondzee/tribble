# Supabase Auth sign-in

The Tribble app uses **Supabase Auth** for sign-in. The flow is implemented and wired to the existing sign-in page and app layout.

## What’s implemented

- **Sign-in page** (`/auth/signin`): Email + password form; submits to `supabase.auth.signInWithPassword()`; shows “Invalid email or password” or other error messages.
- **Auth store** (`store/authSlice.ts`): Holds `user`, `status` (`loading` | `unauthenticated` | `authenticating` | `authenticated` | `forbidden`), and `error`. Exposes `login(email, password)`, `logout()`, and `setSession()`.
- **Session sync** (`components/AuthSync.tsx`): On load, calls `getSession()` and subscribes to `onAuthStateChange` so the app stays in sync with Supabase (e.g. refresh, new tab, or sign-out elsewhere).
- **App layout** (`app/app/layout.tsx`): If not authenticated, redirects to `/auth/signin`; shows nothing while `status === "loading"`.
- **Sidebar**: Logout button calls `logout()`, which calls `supabase.auth.signOut()` and clears the store.

## Supabase Dashboard setup

1. **Enable Email auth**  
   In [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **Providers**, enable **Email**.

2. **Create a user**  
   **Authentication** → **Users** → **Add user** → create a user with email and password (or use **Sign up** if you enable public sign-up).

3. **Optional: user metadata for name/role**  
   The app maps Supabase `user.user_metadata` to the app `User` type:
   - `user_metadata.role` → `User.role` (defaults to the role chosen on the sign-in page, e.g. analyst).
   - `user_metadata.name` → `User.name` (defaults to email local part).
   - `user_metadata.organisation` → `User.organisation`.  
   You can set these in the Dashboard when creating/editing a user, or later via the Auth API.

## Environment

Ensure `tribble/.env.local` has:

- `NEXT_PUBLIC_SUPABASE_URL` — project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — anon key (used by the client for Auth and RLS)

## Optional: sign-up and password reset

The UI already has a link to **CREATE INDIVIDUAL ACCOUNT** pointing to `/auth/register/individual`. To support real sign-up:

- Implement the register page to call `supabase.auth.signUp({ email, password })`, and optionally set `user_metadata` (e.g. name, role).
- For “Forgot password?”, add a flow that uses `supabase.auth.resetPasswordForEmail(email)` and handle the redirect to your password-update page.
