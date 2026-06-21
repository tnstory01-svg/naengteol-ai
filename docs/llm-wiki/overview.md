---
title: Product Overview
slug: product-overview
category: product
summary: High-level purpose, users, and flow of 냉장고 재료.
source: README.md, public/index.html
updated: 2026-06-21
tags: [product, mvp, users, savings]
---

# Product Overview

냉장고 재료 is a hackathon MVP for reducing food waste and daily meal cost. The
main promise is simple: users enter ingredients they already have, and the app
returns practical meals, missing ingredients, urgent ingredients to use first,
and estimated savings versus delivery food.

The UI also uses the broader name 자취생의 모든것 because the app has grown into
a small living-alone toolkit with notes, shopping, places, tips, and support
chatbot screens.

## Target users

- Students living alone.
- Young professionals.
- Small households that often waste leftover ingredients.

## Core loop

```text
ingredient input -> recipe recommendations -> missing ingredients -> savings report
```

The demo flow assumes a user enters ingredients such as egg, kimchi, tofu, rice,
and green onion. The app recommends meals, marks missing or optional items,
highlights priority ingredients such as tofu, and estimates money saved by
cooking instead of ordering delivery.

## Product boundaries

In scope:

- Ingredient input and recipe recommendation cards.
- Missing ingredient display.
- Expiration or waste-risk priority hints.
- Estimated savings.
- Account-backed pantry and recommendation history when the backend is active.
- Browser-only helper tools for notes, shopping, places, and tips.

Out of scope for the current MVP:

- Fridge photo recognition.
- Payment.
- Grocery partner integration.
- Full nutrition analysis.

## Business direction

The README lists future business ideas such as grocery affiliate links, premium
weekly meal planning, and personalized nutrition or budget reports. These are
conceptual directions, not implemented revenue features.
