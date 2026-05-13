# Implementation Plan

## Product Goal

Build a one-day hackathon MVP for 냉장고 재료:

```text
ingredient input -> AI recipe recommendations -> savings report
```

The first version should prove that users can turn ingredients they already own
into practical meals and visible food-cost savings.

## MVP Scope

### Required

- Ingredient input
- Recipe recommendation results
- Missing ingredient display
- Priority ingredients based on expiration or waste risk
- Estimated savings calculation
- Recommendation history storage

### Optional

- Anonymous user mode
- Basic weekly savings summary
- Demo fallback results when the AI API is unavailable

### Excluded From Day-One Build

- Fridge photo recognition
- Payment
- Grocery partner integration
- Full nutrition analysis

## Technical Architecture

```text
Browser UI
  -> App server API
  -> OpenAI API for structured recipe recommendations
  -> Supabase REST API for user and recommendation data
```

API keys must stay server-side. The browser should never call OpenAI directly.

## AI API Management

- Store `OPENAI_API_KEY` in `.env`.
- Commit only `.env.example`.
- Call AI through `POST /api/recommend`.
- Request structured JSON output from the model.
- Validate and normalize AI output before sending it to the UI.
- Use deterministic fallback recommendations when the AI API fails.
- Add request limits later if the demo grows beyond local testing.

Expected AI response shape:

```json
{
  "recipes": [
    {
      "name": "김치볶음밥",
      "reason": "보유 재료 대부분으로 만들 수 있음",
      "ownedIngredients": ["김치", "밥", "계란", "대파"],
      "missingIngredients": ["참기름"],
      "cookTimeMinutes": 10,
      "difficulty": "easy",
      "steps": ["대파를 볶는다", "김치를 넣는다", "밥과 김치를 넣고 볶는다"],
      "estimatedSavings": 8500
    }
  ],
  "priorityIngredients": ["두부"],
  "summary": "배달 대신 조리하면 약 8,500원을 절약할 수 있습니다."
}
```

## Database Strategy

Use Supabase because it can cover database, authentication, and row-level
security later. For the MVP, anonymous browser IDs are enough.

Initial tables:

```text
anonymous_users
- id
- anonymous_id
- created_at

pantry_items
- id
- anonymous_id
- name
- quantity
- expires_at
- created_at

recommendation_logs
- id
- anonymous_id
- input_ingredients
- ai_response
- created_at

savings_logs
- id
- anonymous_id
- recipe_name
- estimated_savings
- created_at
```

For day one, recommendation logs and savings logs are the highest priority.
Pantry persistence can be added after the core demo works.

## Savings Formula

Keep the calculation transparent and easy to explain:

```text
savings = average delivery cost - estimated home cooking cost
```

Initial constants:

```text
average delivery cost: 12000 KRW
default home cooking cost: 3500 KRW
default savings: 8500 KRW
```

The AI can suggest a value, but the server should clamp or replace unrealistic
values.

## Build Order

1. Create app skeleton.
2. Build ingredient input UI.
3. Build recipe result cards.
4. Add `POST /api/recommend`.
5. Connect OpenAI API behind the server.
6. Parse and validate JSON recommendations.
7. Add fallback demo recommendations.
8. Add Supabase REST logging.
9. Build savings report panel.
10. Add `.env.example` and setup notes.
11. Test locally and push each useful milestone.

## Repository Rules

- Do not commit `.env`.
- Do not expose API keys in frontend code.
- Do not use `npm install` or `npm uninstall`.
- Keep the first version small enough to demo reliably.
