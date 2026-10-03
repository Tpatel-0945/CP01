# Setting up Pocket Ledger

You can do all of this on an iPad using Safari. It takes about 10 minutes.

## 1. Publish the website (GitHub Pages)

1. In Safari, open `github.com/Tpatel-0945/CP01`. If you don't see **Settings**, tap **aA** in the address bar, then **Request Desktop Website**.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**. Pick your branch and the `/ (root)` folder, then tap **Save**.
4. After 1–2 minutes your site will be live at `https://tpatel-0945.github.io/CP01/`.

The site works right away, but until you finish step 2 it saves data only in that browser.

## 2. Create the online database (Supabase, free)

1. Go to **supabase.com** in Safari and tap **Start your project**. Sign in with GitHub.
2. Tap **New project**:
   - **Name:** `pocket-ledger`
   - **Database password:** tap **Generate a password** and keep a copy.
   - **Region:** the one closest to you.
   - Tap **Create new project** and wait about a minute.
3. Create the tables:
   - Open **SQL Editor** from the left menu, then tap **New query**.
   - Open `supabase/schema.sql` from this repo, copy all of it, and paste it into the editor.
   - Tap **Run**. You should see "Success. No rows returned".
4. Tell Supabase where your website is:
   - Go to **Authentication → URL Configuration**.
   - Set **Site URL** to `https://tpatel-0945.github.io/CP01/` and tap **Save**.
   - Confirmation and password-reset emails will now open your website.
5. Get your two keys:
   - Go to **Project Settings** (gear icon), then **Data API** or **API**, and copy the **Project URL** (it looks like `https://abcdxyz.supabase.co`).
   - Then go to **API Keys** and copy the **publishable** key (starts with `sb_publishable_`) or the **anon public** key.
   - **Never use the `service_role` or secret key.**
6. Put the keys in `config.js`:

   ```js
   window.POCKET_LEDGER_CONFIG = {
     supabaseUrl: 'https://abcdxyz.supabase.co',
     supabaseKey: 'sb_publishable_...'
   };
   ```

   Edit it on github.com: open `config.js`, tap the pencil, paste, then tap **Commit changes**. Or just send both values to Claude and it will do it for you.

   The publishable key is meant to be public. The database only lets each signed-in person see and change their own rows.

## 3. Use it full screen on your iPad

1. Open `https://tpatel-0945.github.io/CP01/` in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Open Pocket Ledger from the new Home Screen icon. It runs full screen like an app, without Safari's address bar.
4. Tap **Sign in** (top right), then **Create account**. Confirm your email from the link that arrives, come back, and sign in.

Anything you noted before signing in is added to your account the first time you sign in.

## How it works

| Part | Where it runs |
|------|---------------|
| Website (`index.html`, `styles.css`, `app.js`) | GitHub Pages |
| Sign-in (email + password) | Supabase Auth |
| Database (`ledger_settings`, `ledger_months`, `ledger_expenses`) | Supabase Postgres, with row-level security |
| Offline copy | Your browser's local storage, so the app still opens and saves without internet; changes upload when you're back online |

`vendor/supabase.js` is the official Supabase JavaScript client (MIT licence), version 2.117.2.
