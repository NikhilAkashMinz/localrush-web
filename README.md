# LocalRush: customer website (front end)

The customer side of LocalRush, a hyperlocal quick-commerce platform that delivers from
existing neighbourhood shops within 5 km. Built with Next.js (App Router), React,
TypeScript and three.js.

This is the front end only. There is no backend yet, so shops, stock and prices are
sample data, and the cart, login and orders are saved in the browser.

## Run it

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

For a production build: `npm run build`, then `npm start`.

Other commands:

```bash
npm test            # unit tests for the smart store selection
npm run typecheck   # TypeScript check without building
```

## What is in it

| Page | Address | What it does |
|---|---|---|
| Home | `/` | 3D map of the shops inside your 5 km circle, shops strip, categories, product shelves |
| Category | `/c/[slug]` | Product grid with sorting and an in-stock filter |
| Search | `/search?q=` | Results for a search; the search box also suggests as you type |
| Product | `/p/[id]` | 3D pack you can turn, price, delivery time, every nearby shop that sells it |
| Shops near you | `/shops` | Street map and list of every shop within 5 km, with filters |
| Shop | `/store/[id]` | One shop's own products and prices |
| Checkout | `/checkout` | Address, smart store selection with a live comparison, payment |
| Orders | `/orders` | Order history, track or order again |
| Tracking | `/orders/[id]` | 3D map with the delivery scooter, status steps, door code |
| Login | `/login` | Name and mobile number (demo: any 4-digit code works) |
| Account | `/account` | Name, saved addresses, log out |

## Where things live

```
app/            Pages (one folder per address) and globals.css
components/     Shell (header, cart, search, location), product cards, scene wrappers
scenes/         three.js scenes: radius.ts (home), pack.ts (product), track.ts (tracking)
lib/data.ts     Sample shops, products, stock and prices
lib/nearby.ts   Distance, opening hours, delivery time for each shop
lib/select.ts   Smart store selection (distance, stock, price, workload, delivery time)
lib/mapmath.ts  Map projection maths for the street map on the Shops page
lib/orders.ts   Order stages and the demo clock
lib/state.ts    Cart, login, addresses and orders, saved in the browser
tests/          Unit tests (Node's built-in test runner)
k8s/            Kubernetes manifests: namespace, deployment, service, autoscaler
.github/        The Check and Deploy workflows (GitHub Actions)
Dockerfile      How the site is packaged into an image
```

## Smart store selection

`lib/select.ts` is the core idea of the project. For a cart it:

1. Takes every open shop within 5 km by road.
2. Keeps the shops that have the items in stock, preferring a shop that covers the whole cart.
3. Scores each shop from 0 to 100 on distance, price, workload and delivery time.
4. Picks the highest score. Items no single shop has go to a second shop, chosen the same way.

The customer can switch between Balanced, Fastest and Cheapest at checkout, which changes
the weights. The checkout page shows the scores side by side.

## Things to know when you demo it

- **Opening hours are real.** Shops open and close by the clock on your computer, so late
  at night most shops show as closed. Only Girinagar Medicals is open 24 hours.
- **Orders run on a demo clock.** No shop or delivery partner app exists yet, so an order
  moves through its stages on its own in about a minute. "Skip to next step" jumps ahead.
- **Change location** to see different shops. Whitefield has none, to show the empty state.
- **Nothing leaves the browser.** Clearing site data resets the cart, login and orders.

## Connecting the backend later

The UI reads everything through a few functions, so the backend can replace them one at a time:

| Today (sample data) | Later (API) |
|---|---|
| `PRODUCTS`, `STORES` in `lib/data.ts` | `GET /products`, `GET /stores?lat=&lng=` |
| `stockAt(storeId, productId)` | Inventory service |
| `planOrder()` in `lib/select.ts` | Order service (keep the same result shape) |
| `actions.placeOrders()` in `lib/state.ts` | `POST /orders` |
| `progress()` in `lib/orders.ts` | Order status over Socket.IO |

## CI/CD pipeline

Every push to `main` runs the Deploy workflow (`.github/workflows/cd.yml`):

1. **Check** (GitHub's machine): `npm ci`, type-check, unit tests, `next build`.
2. **Package** (GitHub's machine): build the Docker image, tag it with the commit ID,
   push it to `ghcr.io`, scan it for known vulnerabilities.
3. **Deploy** (your laptop, as a self-hosted runner): roll the image out to minikube and
   wait until the new copies pass their health checks.
4. **Verify**: call `/api/health` inside the cluster and confirm it reports this commit.
   If Deploy or Verify fails, the previous version is restored automatically.

The Deploy job is off until the repository variable `DEPLOY_ENABLED` is set to `true`.
Pull requests run the Check workflow only (`.github/workflows/ci.yml`).

To run it by hand on minikube:

```bash
docker build -t localrush-web:local .
minikube image load localrush-web:local
kubectl apply -f k8s/
kubectl port-forward -n localrush service/localrush-web 8080:80
```

## Map

The Shops page draws its own map: tiles come from OpenStreetMap, and the markers, 5 km ring
and popup are LocalRush's own. OpenStreetMap's tile server is fine for a project demo; for a
real launch, switch the tile address in `components/ShopMap.tsx` to a paid tile provider.

## Fonts

Bricolage Grotesque and Figtree, both under the SIL Open Font Licence. The font files and
licences are in `app/fonts/`.
