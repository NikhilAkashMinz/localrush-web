# LocalRush

A hyperlocal quick-commerce platform that delivers from existing neighbourhood shops within
5 km. One Next.js app holds all three sides of it, plus the server:

- **Customer website**: browse shops near you, order, and track the delivery live.
- **Shop dashboard** (`/dashboard`): orders arrive by themselves; accept, pack, hand over; manage stock and prices.
- **Delivery partner screen** (`/partner`): go online, take a packed order, deliver it with the customer's door code.
- **Backend** (`/api/...`): accounts, the catalogue, stock, orders and live updates, stored in MongoDB.

Built with Next.js (App Router), React, TypeScript, three.js and MongoDB.

## Run it

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

With nothing else set up, the server keeps its data **in memory**: everything works, and it
resets to the sample shops when you stop the server. That is the quickest way to try it.

### Run it with the real database

1. Start MongoDB. With Docker Desktop running:

   ```bash
   docker run -d --name localrush-mongo -p 27017:27017 -v localrush-mongo:/data/db mongo:8.0
   ```

2. Copy `.env.example` to `.env.local` and remove the `#` in front of `MONGODB_URI`.
3. Run `npm run dev` again.

The first start fills an empty database with the sample shops, products, stock and the demo
accounts. Open http://localhost:3000/api/health: it should say `"storage":"mongo"` and
`"database":"connected"`. Orders and stock now survive a restart.

To start again from the sample data: `docker exec localrush-mongo mongosh localrush --eval "db.dropDatabase()"`, then restart the site.

Other commands:

```bash
npm test            # unit tests: store selection, map maths and the whole API
npm run typecheck   # TypeScript check without building
npm run build       # production build; then "npm start"
```

`npm test` uses the in-memory database. To run the API tests against a real MongoDB, point
`TEST_MONGODB_URI` at a database that may be emptied (never the one with your real data).
In PowerShell:

```powershell
$env:TEST_MONGODB_URI = "mongodb://localhost:27017/localrush_test"
npm test
Remove-Item Env:TEST_MONGODB_URI
```

The Check workflow on GitHub does this on every push, with a throwaway MongoDB.

## Try all three sides at once

The customer site, the shop dashboard and the delivery screen each have their own login page
and their own login cookie. One browser can stay logged in to all three at once, and logging
in or out of one never changes the other two. Open three tabs:

| Tab | Open | Log in with |
|---|---|---|
| Customer | `localhost:3000` then Log in | Any name and any new 10-digit mobile number |
| Shop owner | `localhost:3000/dashboard` | Choose a shop from the list (Sri Lakshmi is `9000000001`) |
| Delivery partner | `localhost:3000/partner` | Choose a partner from the list (Ravi K. is `9100000001`) |

Any 4-digit code logs in (no SMS is sent yet). Each login only accepts its own kind of
account: a shop owner's number is refused on the customer login, and so on. Then:

1. **Partner**: switch to Online.
2. **Customer**: keep the location on PES University, add milk and bread, check out.
   Checkout shows which shop was picked. The tracking page shows the order's 4-digit
   delivery code straight away.
3. **Shop owner**: the order appears under New with a chime. Press Accept, then Packed and ready.
4. **Partner**: the job appears. Take it, press "I have picked it up", then enter the
   delivery code for that order. Each order has its own code.
5. **Customer**: the tracking page moved through every step without a refresh.

An order appears only on the dashboard of the shop it was sent to. Milk and bread near PES
University go to Sri Lakshmi; a notebook goes to Campus Xerox & Stationery, and so on. If
checkout picked a different shop, the customer's tracking page has an "Open that shop's
dashboard" link, and the dashboard login lists every shop. The numbers are:

| Mobile | Shop | Mobile | Shop |
|---|---|---|---|
| 9000000001 | Sri Lakshmi Provision Store | 9000000009 | 4th Block Pharma |
| 9000000002 | Hosakerehalli Daily Needs | 9000000010 | Gandhi Bazaar Fruit Stall |
| 9000000003 | Kathriguppe Fresh Mart | 9000000011 | JP Nagar Kirana Corner |
| 9000000004 | Girinagar Medicals | 9000000012 | RR Nagar Home Needs |
| 9000000005 | Campus Xerox & Stationery | 9000000013 | Vijayanagar Stationers & Mobiles |
| 9000000006 | Ring Road Electronics | 9000000014 | Basavanagudi Stores |
| 9000000007 | BSK Bakery & Sweets | 9000000015 | Koramangala Organic Co-op |
| 9000000008 | Jayanagar Super Bazaar | | |

Delivery partners are `9100000001` to `9100000004`. More things to show:

- **Cannot take it** on the dashboard sends the order to the next-best shop; the customer sees a note.
- **Stock and prices**: change a price or mark something out of stock and the customer site updates.
- **Taking orders** switch: pause the shop and customers see it as closed until it is switched back.
- Two partners online: the first to press "Take this delivery" gets it; the other is told it is gone.

A browser holds one login of each kind. To use two accounts of the same kind at once (two
partners, or two customers), open the second in an Incognito window or a different browser.

## How an order moves

```
placed ──accept──▶ accepted ──pack──▶ packed ──claim──▶ assigned ──pickup──▶ picked ──deliver──▶ delivered
  │                                    (shop)            (partner)                    (needs door code)
  ├─ cancel (customer) ──▶ cancelled
  └─ reject (shop) ──▶ moved to the next-best shop, or rejected if there is none
```

- Each step is one conditional database update ("change it only if it is still in the step I
  expect"), so two people pressing at once cannot both win.
- Stock is taken when the order is placed and given back on cancel or reject, also with a
  conditional update, so the last item cannot be sold twice.
- The door code is sent only to the customer. The server checks it on delivery.

## Live updates

Every open page keeps one connection to `/api/live` (server-sent events). The server sends a
short "something changed" message, and the page re-reads its data. If the connection drops,
the browser reconnects and pages check every 5 seconds meanwhile. The Live light on the
dashboard shows the connection state.

## API

All under `/api`. The login is a signed, HTTP-only cookie, one per kind of account
(`lr_customer`, `lr_shop`, `lr_partner`). Each request says which side it is for in the
`X-LocalRush-Seat` header, which the website takes from the page address, and the server
reads only that cookie. A request without the header is judged by the page it came from.

| Method and path | Who | What |
|---|---|---|
| `GET /catalog` | everyone | Products, shops, stock and prices |
| `GET /demo` | everyone | The ready-made shop owner and partner accounts (demo only) |
| `POST /auth/login` | everyone | `{ name, phone, code }`; only this seat's kind of account |
| `POST /auth/logout` | | |
| `GET /me`, `PATCH /me` | logged in | Current user; change name |
| `DELETE /me/addresses/:id` | logged in | Remove a saved address |
| `GET /orders` | logged in | Customer: own orders. Shop: its orders. Partner: own deliveries and jobs nearby |
| `POST /orders` | customer | Place an order: `{ cart, place, line, tag, payment, mode }` |
| `GET /orders/:id` | logged in | One order |
| `POST /orders/:id/:action` | by role | `accept`, `reject`, `pack` (shop); `claim`, `pickup`, `deliver` (partner); `cancel` (customer) |
| `PUT /shop/stock` | shop owner | `{ pid, price, stock }` |
| `POST /shop/products` | shop owner | Add a new product |
| `PUT /shop/paused` | shop owner | `{ paused }` |
| `PUT /partner` | partner | `{ online, place }` |
| `GET /live` | everyone | Server-sent events |
| `GET /health` | everyone | Version, storage mode, database state |

## Where things live

```
app/                 Pages, one folder per address, and globals.css
app/dashboard/       Shop dashboard: order board and stock
app/partner/         Delivery partner screen
app/api/             /api/health, and [...path] which hands every other /api call to server/api.ts
components/          Shell (header, cart, search), StaffShell (dashboard frame), cards, map, 3D wrappers
scenes/              three.js scenes: radius.ts (home), pack.ts (product), track.ts (tracking)
server/api.ts        The HTTP routes
server/service.ts    The rules: who may do what, order steps, stock
server/memory.ts     Storage in memory (no database needed; also used by the tests)
server/mongo.ts      Storage in MongoDB
server/live.ts       The live stream
server/session.ts    Login cookie
server/seed.ts       What a new database starts with
lib/select.ts        Smart store selection (used by the page and by the server)
lib/nearby.ts        Distance, opening hours, delivery time for each shop
lib/orders.ts        Order shape and steps, shared by pages and server
lib/state.ts         What the browser holds: cart and location (saved), user and orders (from the server)
lib/api.ts, live.ts  How pages call the server and listen for changes
tests/               Unit tests (Node's built-in test runner)
k8s/                 Kubernetes: namespace, database, deployment, service, autoscaler
.github/             The Check and Deploy workflows (GitHub Actions)
Dockerfile           How the app is packaged into an image
```

MongoDB collections: `products`, `stores`, `inventory` (one row per shop and product, with
price and stock), `users`, `orders`, `counters` (the change counters behind live updates).

## Smart store selection

`lib/select.ts` is the core idea of the project. For a cart it:

1. Takes every open shop within 5 km by road.
2. Keeps the shops that have the items in stock, preferring a shop that covers the whole cart.
3. Scores each shop from 0 to 100 on distance, price, workload and delivery time.
4. Picks the highest score. Items no single shop has go to a second shop, chosen the same way.

Checkout shows the scores side by side, and the customer can switch between Balanced,
Fastest and Cheapest. The server runs the same function again on live stock when the order
is placed, so the page can never order something that just sold out. Workload now includes
the orders each shop is really working on.

## Things to know when you demo it

- **Opening hours are real**, in India time. Late at night most shops are closed; only
  Girinagar Medicals is open 24 hours. A closed shop receives no orders.
- **Login accepts any 4-digit code.** There is no SMS provider yet.
- **Payments are a demo.** Choosing UPI moves no money.
- **The scooter on the tracking map is an estimate.** The steps are real (they change when the
  shop and partner press their buttons); the position between steps is not GPS.
- **Change location** to see different shops. Whitefield has none, to show the empty state.

## CI/CD pipeline

Every push to `main` runs the Deploy workflow (`.github/workflows/cd.yml`):

1. **Check** (GitHub's machine): `npm ci`, type-check, unit tests, the API tests again on a
   real MongoDB, `next build`.
2. **Package** (GitHub's machine): build the Docker image, tag it with the commit ID,
   push it to `ghcr.io`, scan it for known vulnerabilities.
3. **Deploy** (your laptop, as a self-hosted runner): start MongoDB in minikube if it is not
   running, roll the new image out, and wait until the new copies pass their health checks.
4. **Verify**: call `/api/health` inside the cluster and confirm it reports this commit and a
   connected database. If Deploy or Verify fails, the previous version is restored.

The Deploy job is off until the repository variable `DEPLOY_ENABLED` is set to `true`.
Pull requests run the Check workflow only (`.github/workflows/ci.yml`).

To run it by hand on minikube:

```bash
docker build -t localrush-web:local .
minikube image load localrush-web:local
kubectl apply -f k8s/
kubectl rollout status deployment/mongo -n localrush --timeout=420s
kubectl rollout restart deployment/localrush-web -n localrush
kubectl port-forward -n localrush service/localrush-web 8080:80
```

Then open http://localhost:8080. In the cluster the site always uses MongoDB
(`k8s/mongo.yaml`), which is what lets two copies of the site share the same orders.

Optional, to sign login cookies with your own secret instead of the built-in demo value
(replace the text in capitals with any long random text):

```bash
kubectl create secret generic localrush-secrets -n localrush --from-literal=session-secret=LONG-RANDOM-TEXT
kubectl rollout restart deployment/localrush-web -n localrush
```

## Not built yet

Real SMS codes, real payments, GPS tracking of the partner, shop sign-up (shops and owners
come from the seed data), and an admin view across all shops.

## Map

The Shops page draws its own map: tiles come from OpenStreetMap, and the markers, 5 km ring
and popup are LocalRush's own. OpenStreetMap's tile server is fine for a project demo; for a
real launch, switch the tile address in `components/ShopMap.tsx` to a paid tile provider.

## Fonts

Bricolage Grotesque and Figtree, both under the SIL Open Font Licence. The font files and
licences are in `app/fonts/`.
