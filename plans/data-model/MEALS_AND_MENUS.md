# Meals and Menus

## Meal service

Fields:

- id;
- provider;
- organizations/campuses;
- service locations;
- meal periods;
- pricing;
- payment/public account link;
- eligibility/assistance policy link;
- contact;
- allergy/nutrition disclaimer;
- status.

## Menu

Fields:

- id;
- title;
- location/campus;
- date or period;
- meal type;
- menu sections;
- items;
- alternate menu;
- language;
- last updated;
- provenance;
- expiry.

## Menu item

Fields:

- id optional;
- name;
- description;
- category;
- ingredients link or summary if provided;
- allergens as declared by source;
- nutrition facts;
- dietary labels;
- portion;
- price;
- availability;
- image;
- provenance.

## Safety language

EOM must not claim a meal is medically safe for a person. Allergen and dietary values are published source claims and should include disclaimers, last update, and food-service contact.

## Nutrition

Use standardized units and decimal strings.

Fields may include:

- calories;
- protein;
- carbohydrate;
- fat;
- sodium;
- fiber;
- sugars;
- serving size.

A future profile may map USDA or international food identifiers.

## Delegated vendor pattern

Meal menus are a strong cross-origin delegation example:

- school root delegates only `meal-menu-catalog`;
- vendor URL prefix is constrained;
- vendor key optional;
- school retains ability to revoke;
- menu resource names the school subject and vendor publisher;
- freshness expires quickly.

## Website use

Generate:

- daily menu;
- monthly calendar;
- allergen filters with clear caveats;
- printable menus;
- pricing and meal-service pages.
