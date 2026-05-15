# 냉장고 재료

냉장고 재료는 음식물 낭비와 하루 식비를 줄이기 위한 해커톤 MVP입니다.
사용자가 이미 가진 재료를 입력하면 만들 수 있는 메뉴, 부족한 재료,
먼저 써야 할 재료, 예상 절약 금액을 보여줍니다.

## One-Line Pitch

Turn leftover fridge ingredients into meal recommendations and visible food-cost
savings.

## Target Users

- Students living alone
- Young professionals
- Small households that often waste ingredients

## MVP Scope

- Ingredient input
- Recipe recommendation cards
- Missing ingredient list
- Expiration-priority ingredient hints
- Estimated savings report

## Demo Flow

1. User enters ingredients: egg, kimchi, tofu, rice, green onion.
2. The app recommends kimchi fried rice, tofu kimchi, and egg soup.
3. The app shows which ingredients are missing or optional.
4. The app highlights tofu as a priority ingredient to use today.
5. The app estimates savings compared with delivery food.

## Business Model

- Grocery delivery affiliate links
- Premium weekly meal planning
- Personalized nutrition and budget reports

## Hackathon Build Rule

Keep the first version focused on:

```text
ingredient input -> recipe results -> savings report
```

## Local Development

This MVP uses a dependency-free Node server, so it can run without installing
packages.

```bash
node server.js
```

Then open:

```text
http://localhost:3000
```

On Windows, double-click this file from the project folder:

```text
냉장고 재료 실행.cmd
```

Optional environment setup:

```bash
cp .env.example .env
```

Fill `GROQ_API_KEY` and `GROQ_MODEL` to use AI recommendations. Leave them
empty to use the deterministic demo fallback.

Authentication and pantry data are stored server-side in `./data/app.db.json`
by default. The file is ignored by Git. Passwords are stored as scrypt hashes,
and browser sessions use an HttpOnly cookie plus CSRF tokens.

## API and Data

- `POST /api/recommend` accepts ingredients and returns structured recipe cards.
- `POST /api/auth/register`, `POST /api/auth/login`, and `POST /api/auth/logout`
  manage secure account sessions.
- `GET /api/pantry` and `POST /api/pantry` manage saved ingredients for logged-in users.
- `GET /api/recommendations` returns the logged-in user's saved recommendation history.
- Groq keys are read only by `server.js`.
- Supabase can be used as the primary server-side database through the REST API.
- Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_ENABLED=true`
  after running `supabase/schema.sql`.
- Leave Supabase values empty to keep using the local JSON DB at `./data/app.db.json`.
- When `SUPABASE_DB_ENABLED=false`, Supabase can still receive recommendation
  logs through `SUPABASE_RECOMMENDATION_TABLE` and `SUPABASE_SAVINGS_TABLE`.
- Database setup SQL is in `supabase/schema.sql`.

## Deployment

Deployment-ready files are included:

- `Dockerfile`
- `render.yaml`
- `railway.toml`
- `Procfile`
- `public/` for static GitHub Pages deployment

GitHub Pages runs the static `public/` app at
`https://tnstory01-svg.github.io/naengteol-ai/`. Server features still require
the Node backend. See `docs/deployment.md` for deployment settings and
environment variables.
