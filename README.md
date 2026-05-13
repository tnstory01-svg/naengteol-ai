# Naengteol AI

Naengteol AI is a hackathon MVP for reducing food waste and daily meal costs.
Users enter ingredients they already have, then receive recipe ideas, missing
ingredients, priority ingredients to use first, and an estimated savings amount.

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

Optional environment setup:

```bash
cp .env.example .env
```

Fill `OPENAI_API_KEY` and `OPENAI_MODEL` to use AI recommendations. Leave them
empty to use the deterministic demo fallback.

## API and Data

- `POST /api/recommend` accepts ingredients and returns structured recipe cards.
- OpenAI keys are read only by `server.js`.
- Supabase logging is optional and uses the REST API from the server.
- Database setup SQL is in `supabase/schema.sql`.
