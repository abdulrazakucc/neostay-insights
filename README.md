# NeoStay Insights

A sign-in web app that gives doctors and nurse management the NeoStay NICU insights built in `acuity-models`:
babies and stays, nurse staffing and ratios, the six centers (Center 6 real data, Centers 1–5 synthetic
scenarios), real-versus-synthetic evidence, and the predictive model evaluation.

Hosted on GitHub Pages: https://abdulrazakucc.github.io/neostay-insights/

## What is in it

- **Overview**, then for Center 6: **Babies**, **Nurses**, **Babies & nurses** (real data), **Counts: real &
  synthetic** (stays and how long they lasted, care, admissions and census, nursing by skill tier, simulated
  nurse shifts), the synthetic-data and evaluation pages, and the models.
- **How good are the predictions?**: every prediction scored in plain words beside the simple rule it must
  beat, the model used and why, the models compared, its pass marks and its status (ready for a silent trial,
  not ready, measured but not yet gated).
- **Metrics explained**: every evaluation term in plain words and technical terms.
- **Bayesian network** (Reasoning): draw and edit how the babies' facts and care relate, learn the
  probabilities from the data (real Center 6 or any center's synthetic data) in the browser, and ask "what
  if" questions. Its data files (`data/bn/*.json`) are encrypted like the rest.
- Centers 1–5 (synthetic scenarios): configuration, synthetic insights, longitudinal and operational
  analysis, staffing, **Counts**, validation.

- **Guide (PDF)** under Start: the plain-language guide to every page, with screenshots, to read in the app or
  download. It is built in `acuity-models` (`docs/neostay/insights-brief/NeoStay-Insights-Brief.pdf`);
  `npm run sync-data` copies it to `data-private/guide.pdf`, with `guide_sections.json` (each section's page,
  so a click on a section title opens the PDF there), and `npm run encrypt` encrypts both like the data,
  because its screenshots show real results. The deploy refuses any plain PDF under `public/`.

## How the data is protected

This repository and its Pages site are public, and the Center 6 data describes real babies. So the data
is **never committed in plain form**:

- `npm run encrypt` gzips each JSON file (and the PDF guide) and encrypts it with AES-256-GCM. The key is derived from the
  username and password with PBKDF2-SHA256 (600,000 iterations, random salt per run).
- Only the ciphertext (`public/data/**/*.enc`) and the salt (`public/data/vault.json`) are committed.
- On sign-in the browser derives the key and decrypts. A wrong username or password fails the GCM
  check, so nothing decrypts. No password is sent to any server.
- The key is kept for the current browser tab only (sessionStorage). "Sign out" clears it.
- The deploy workflow refuses to publish if any plain `.json` file is found under `public/`.

The protection is only as strong as the password. Use a long random password, share it privately, and
re-encrypt with a new password if it leaks (old ciphertext stays in git history, so also review whether
the old data needs rotating out).

Plain data lives in `data-private/` and credentials in `.credentials`; both are git-ignored.

## Update the data

```bash
# 1. In acuity-models: rebuild the Insights data files
make insights-data

# 2. Here: copy them into data-private/ (git-ignored)
npm run sync-data          # set ACUITY_MODELS=/path/to/acuity-models if it is not next to this repo

# 3. Encrypt into public/data/ (reads NEOSTAY_USER and NEOSTAY_PASSWORD from the environment or .credentials)
npm run encrypt

# 4. Commit public/data/ and push: GitHub Actions builds and deploys to Pages
git add public/data && git commit -m "Update encrypted data" && git push
```

`.credentials` format:

```
NEOSTAY_USER=waseem.altaf
NEOSTAY_PASSWORD=<long random password>
```

To change the password, edit `.credentials`, run `npm run encrypt`, commit and push.

## Run locally

```bash
npm ci
npm run dev       # http://127.0.0.1:5174
```

## What differs from acuity-models

The app is `apps/insights/` from `acuity-models` with:

- a sign-in screen (`src/Login.tsx`) and encrypted data loading (`src/vault.ts`);
- read-only center pages: editing center parameters, running generation jobs and downloading exports need
  the local Python API in `acuity-models`, so they are hidden here.

Decision support for planning, not for individual care.
