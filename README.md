# LocalRush

A hyperlocal quick-commerce platform that delivers from existing neighbourhood shops within
5 km. One Next.js app holds all three sides of it, plus the server:

- **Customer website**: browse shops near you, order, and follow the delivery partner on a live
  map as they ride to you. Your order history is kept with your mobile number.
- **Shop dashboard** (`/dashboard`): orders arrive by themselves; accept, pack, hand over; manage
  stock and prices; see everything the shop has sold, with prices.
- **Delivery partner screen** (`/partner`): go online, take a packed order, deliver it with the
  customer's door code, and see what each delivery pays and what you have earned.
- **Delivery partner phone app** (`partner-app/`): the same for partners on their phones, made with
  React Native and Expo. New jobs buzz the phone, directions open in Google Maps, and the
  phone's GPS is shared with the customer while their order is on its way.
- **Vendor phone app** (`vendor-app/`): the shop dashboard on the shop owner's phone, made the
  same way. New orders buzz the phone; accept, pack, turn down, pause the shop, change stock and
  prices, add products, and see sales.
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
account: a shop owner's number is refused on the customer login, and so on. You never need to
log out of one to use another: a logged-in customer can open both other screens from
**Account** (click your name at the top), and from the links at the bottom of every page. Then:

1. **Partner**: switch to Online.
2. **Customer**: keep the location on PES University, add milk and bread, check out.
   Checkout shows which shop was picked. The tracking page shows the order's 4-digit
   delivery code straight away.
3. **Shop owner**: the order appears under New with a chime. Press Accept, then Packed and ready.
4. **Partner**: the job appears with what it pays. Take it, press "I have picked it up", then
   enter the delivery code for that order. Each order has its own code. Your earnings update.
5. **Customer**: the tracking page moved through every step without a refresh.
6. **Shop owner**: open **Sales** to see the items sold, how many and at what price.
7. **Customer**: log out and log in again with the same number. Your orders are all still there.

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

## Delivery partner phone app

`partner-app/` is the delivery partner's app for Android and iPhone, made with React Native and
Expo. It uses this server, so it works alongside the website. With `npm run dev` running:

```bash
cd partner-app
npm install
npx expo start
```

Scan the QR code with **Expo Go** on a phone that is on the same Wi-Fi as the laptop, and log in
as Ravi K. (`9100000001`). The app finds the server by itself. `partner-app/README.md` has the
whole demo and what to do if the phone cannot reach the laptop.

While a delivery is on its way, the app sends the phone's GPS position every few seconds and
the customer follows the partner on a live map (see [Live tracking](#live-tracking)).

## Vendor phone app

`vendor-app/` is the shop owner's app, made the same way, on the same server. With
`npm run dev` running:

```bash
cd vendor-app
npm install
npx expo start
```

Scan the QR code with **Expo Go** and log in as Sri Lakshmi Provision Store (`9000000001`), or
any demo shop listed on the login screen. Orders placed on the website arrive in the app by
themselves and buzz the phone: accept, pack and mark them ready, and delivery partners are told
at once. Stock, prices, new products, pausing the shop and sales are all there too, and every
change shows up on the website straight away. `vendor-app/README.md` has the whole demo.

To run both phone apps at once, start the second one with `npx expo start --port 8082`.

## How an order moves

```
placed ──accept──▶ accepted ──pack──▶ packed ──claim──▶ assigned ──pickup──▶ picked ──deliver──▶ delivered
  │                                    (shop)            (partner)                    (needs door code)
  ├─ cancel (customer) ──▶ cancelled
  └─ reject (shop) ──▶ moved to the next-best shop, or rejected if there is none
```

- Each step is one conditional database update ("change it only if it is still in the step I
  expect"), so two people pressing at once cannot both win.
- The partner's pay is fixed at **claim**: ₹20 per delivery plus ₹5 per km, counting the ride
  to the shop and on to the customer. Moving after taking the job does not change it.
- Stock is taken when the order is placed and given back on cancel or reject, also with a
  conditional update, so the last item cannot be sold twice.
- The door code is sent only to the customer. The server checks it on delivery.

## Live updates

The website and both phone apps are kept in step in real time. Every open page, and each phone
app while it is open, keeps one connection to `/api/live` (server-sent events). Whenever
something changes, the server sends a short "something changed" message within about a second,
and the page or app re-reads its data. So an order placed on the website buzzes the vendor app
at once, "Packed and ready" in the vendor app reaches the partner app at once, and the
partner's steps show up straight away on the shop's screens and the customer's tracking page.

| Who | Hears about |
|---|---|
| Customer pages | the catalogue, and orders placed with their mobile number, including each new GPS position of their delivery partner |
| Shop dashboard and vendor app | the catalogue (stock, prices, paused), and the shop's orders |
| Partner screen and partner app | packed orders waiting for a partner, and the partner's own deliveries |

The phone apps log in with a token, which they send with the stream request; they read the
stream with XMLHttpRequest, as React Native's fetch cannot read a reply while it is arriving.
If the connection drops, the browser or app reconnects by itself and checks every 4 to 5
seconds meanwhile. The Live light on the dashboard, and **LIVE** at the top of each app, show
that the live connection is up.

## Live tracking

The customer's order page has a **Live map**: real streets (OpenStreetMap), the shop, the
customer's address and, once a delivery partner has taken the order, the partner on a scooter.
It opens by itself when a partner takes the order; the 3D view is one tap away.

- **Where the position comes from.** The partner app sends the phone's GPS position with
  `PUT /api/partner { place, gps: true }`. While a delivery is under way it sends one every
  15 m (or every 15 seconds when standing still), at most every 3 seconds. While waiting for
  jobs it sends one only every 60 m or once a minute, to save battery.
- **How it reaches the customer.** Each position wakes the customer's live connection, so the
  order page has it within about a second (0.5 to 1 s when tested). The scooter glides to the
  new spot, an arrow on it points the way the partner is going, and the way they have come
  since taking the order is drawn behind them. The map can be dragged and zoomed; the target
  button shows the whole delivery again.
- **Distance and time.** "Ravi K. is 620 m from you" and "About 2 min away", and the headline
  at the top of the page, come from where the partner really is (by road, at about 20 km/h).
  On the way to the shop, the time counts the ride to the shop and on to the customer.
- **When the phone goes quiet.** After a minute with no new position the map says **LAST
  SEEN** instead of **LIVE**. After 10 minutes the server stops sending the position. Without
  GPS (a partner who chose an area), the map shows an estimate after pick-up and says so.
- **Privacy.** Only the customer of that order sees the partner, only while that order is on
  its way, and only the route since the partner took that order. Shops and other customers
  never get it, and the route is deleted when the delivery is done.

### Show it indoors: `npm run demo:ride`

Real GPS needs the partner's phone outside. To show live tracking in a room, a script can play
the partner: it logs in as Ravi K. the way the partner app does and, while he has a delivery
under way, sends a position every 2 seconds, riding to the shop and then on to the customer.
The buttons are still pressed by you.

1. Start the site with `npm run dev`, and in a second terminal `npm run demo:ride`.
2. Customer: at PES University, order milk and bread, and stay on the order page.
3. Shop owner (`/dashboard`, Sri Lakshmi): Accept, then Packed and ready.
4. Partner (`/partner`, Ravi K.): take the delivery. The customer's page switches to the live
   map and the scooter starts to move.
5. When the script says **at the shop**, press "I have picked it up". When it says **at the
   customer's door**, enter the customer's code.

`npm run demo:ride -- --speed 40` changes the speed (km/h), `--phone 9100000002` uses another
demo partner, `--server http://192.168.1.5:3000` another server, and `--once` stops after one
delivery. If Ravi K. is also logged in to the partner app with GPS on, his phone's position mixes
with the script's: in the app, choose an area instead (Account, Your location, Change).

## API

All under `/api`. The login is a signed, HTTP-only cookie, one per kind of account
(`lr_customer`, `lr_shop`, `lr_partner`). Each request says which side it is for in the
`X-LocalRush-Seat` header, which the website takes from the page address, and the server
reads only that cookie. A request without the header is judged by the page it came from.

The phone apps log in with `X-LocalRush-Client: app` and get a signed token in the reply
instead of a cookie: the partner app on the partner seat, the vendor app on the shop seat. They
send it as `Authorization: Bearer <token>`; a token works only on the seat it was issued for.

| Method and path | Who | What |
|---|---|---|
| `GET /catalog` | everyone | Products, shops, stock and prices |
| `GET /demo` | everyone | The ready-made shop owner and partner accounts (demo only) |
| `GET /nearby-shops?lat=&lng=` | everyone | Real shops within 5 km that are not on LocalRush, from OpenStreetMap |
| `POST /auth/login` | everyone | `{ name, phone, code }`; only this seat's kind of account. The app also gets a `token` |
| `POST /auth/logout` | | |
| `GET /me`, `PATCH /me` | logged in | Current user; change name |
| `DELETE /me/addresses/:id` | logged in | Remove a saved address |
| `GET /orders` | logged in | Customer: own orders. Shop: its orders. Partner: own deliveries and jobs nearby |
| `POST /orders` | customer | Place an order: `{ cart, place, line, tag, payment, mode }` |
| `GET /orders/:id` | logged in | One order. A customer's order on its way includes `rider`: the partner's latest GPS position and `trail`, the way they have come since taking it, while it is fresh (10 minutes). `GET /orders` does the same |
| `POST /orders/:id/:action` | by role | `accept`, `reject`, `pack` (shop); `claim`, `pickup`, `deliver` (partner); `cancel` (customer) |
| `PUT /shop/stock` | shop owner | `{ pid, price, stock }` |
| `POST /shop/products` | shop owner | Add a new product |
| `PUT /shop/paused` | shop owner | `{ paused }` |
| `GET /shop/sales?period=` | shop owner | What the shop sold: totals, each product with quantity and price, and the orders. `period` is `today`, `week` or `all` |
| `PUT /partner` | partner | `{ online, place, gps }`. `gps: true` marks a position from the phone's GPS |
| `GET /partner/earnings?period=` | partner | What the partner earned: totals, pay waiting on the current delivery, cash collected, and the deliveries |
| `GET /live` | everyone | Server-sent events |
| `GET /health` | everyone | Version, storage mode, database state |

## Where things live

```
app/                 Pages, one folder per address, and globals.css
app/dashboard/       Shop dashboard: order board, stock, and sales
app/partner/         Delivery partner screen
app/api/             /api/health, and [...path] which hands every other /api call to server/api.ts
components/          Shell (header, cart, search), StaffShell (dashboard frame), cards, map, 3D wrappers,
                     RealMap.tsx (Google's real 3D map on the home page),
                     LiveTrackMap.tsx (the live map on the order page, with livemap.css)
scenes/              three.js scenes: radius.ts (home), pack.ts (product), track.ts (tracking)
server/api.ts        The HTTP routes
server/service.ts    The rules: who may do what, order steps, stock
server/memory.ts     Storage in memory (no database needed; also used by the tests)
server/mongo.ts      Storage in MongoDB
server/live.ts       The live stream
server/session.ts    Login cookie, and the phone apps' login token
server/seed.ts       What a new database starts with
lib/select.ts        Smart store selection (used by the page and by the server)
lib/nearby.ts        Distance, opening hours, delivery time for each shop
lib/orders.ts        Order shape and steps, and the partner pay rule, shared by pages and server
lib/reports.ts       Shop sales and partner earnings, worked out from delivered orders
lib/state.ts         What the browser holds: cart and location (saved), user and orders (from the server)
lib/api.ts, live.ts  How pages call the server and listen for changes
lib/google.ts        Loading Google Maps, and finding the real shops near a place with Google
lib/realshops.ts     Real shops that are not on LocalRush: their shape, and loading them from the server
lib/mapmath.ts       Street map maths: map tiles and positions, for the Shops map and the live map
server/osm.ts        Real shops near a place from OpenStreetMap, saved per area
partner-app/         The delivery partner phone app (React Native and Expo), with its own README
vendor-app/          The shop owner phone app (React Native and Expo), with its own README
tests/               Unit tests (Node's built-in test runner)
scripts/             simulate-ride.mjs: npm run demo:ride, a pretend partner riding with GPS
k8s/                 Kubernetes: namespace, database, deployment, service, autoscaler
.github/             The Check and Deploy workflows (GitHub Actions)
Dockerfile           How the app is packaged into an image
```

MongoDB collections: `products`, `stores`, `inventory` (one row per shop and product, with
price and stock), `users`, `orders`, `counters` (the change counters behind live updates),
`cache` (real shops from OpenStreetMap, one document per area of about 1 km).

## How the data is kept

The mobile number is the customer's identity, and an order is the permanent record of a sale.
Everything else is worked out from the orders.

- **users**: one account per mobile number (a unique index on `phone`). Logging in again with
  the same number finds the same account; nothing is created twice.
- **orders**: each order keeps who ordered (`customerPhone`, `customerName`), which shop sold it,
  every line with the product's **name, pack size, quantity and the price it sold for** (copied
  at the time of the order, so history never changes if the catalogue does), the delivery fee
  and total, and for the partner `pickupKm` and `partnerPay`. `deliveredAt` records the handover.
- **Customer history** is looked up by `customerPhone`, not by account id, so the number always
  brings its orders back.
- **Shop sales** are the shop's delivered orders, added up by product (`lib/reports.ts`).
  Revenue is the item value; the delivery fee is not the shop's.
- **Partner earnings** are the sum of `partnerPay` over the partner's delivered orders. Cash
  collected at the door is shown separately: it is the customers' payment, handed over.

Indexes on `orders`, one for each question the site asks: `{ customerPhone, createdAt }` (a
customer's history), `{ storeId, createdAt }` and `{ storeId, status, createdAt }` (a shop's
board and sales), `{ status, partnerId }` (jobs waiting for a partner), `{ partnerId, status,
createdAt }` (a partner's deliveries and earnings), plus `{ customerId, createdAt }`. They are
created when the site starts, so an existing database gains new ones on the next restart.

Orders from before this change have no saved product names or partner pay. They still show:
names come from the catalogue, and pay is worked out from the ride to the customer.

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
- **The scooter on the live map is the partner's real GPS position** while the partner app
  shares it (or while `npm run demo:ride` plays the partner). Without GPS, and in the 3D view,
  the position between steps is an estimate; the steps themselves are always real.
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

Real SMS codes, real payments, alerts on the partner's and the shop owner's phones while the
apps are closed (push notifications), shop sign-up (shops and owners come from the seed data),
and an admin view across all shops. The partner's GPS is shared only while the partner app is
open (no location in the background yet), and the live map draws a straight dashed line for the
way still to go, not a route along the roads.

## Map

The Shops page draws its own map: tiles come from OpenStreetMap, and the markers, 5 km ring
and popup are LocalRush's own. OpenStreetMap's tile server is fine for a project demo; for a
real launch, switch the tile address in `components/ShopMap.tsx` to a paid tile provider.

### Real shops on the map

Besides LocalRush's own shops (the pins), the Shops page shows the **real shops around you**
as small coloured dots: grocery and convenience stores, supermarkets, dairies, fruit and
vegetable shops, bakeries, pharmacies, electronics, mobile and stationery shops listed on
OpenStreetMap within 5 km. Around PES University that is about 270 shops. Tap a dot, or a row
in "Other real shops near you", for its address, opening hours when known, and directions.
The home page lists the nearest ones under "More shops near you". They are not on LocalRush,
so nothing can be ordered from them; untick "Other real shops" to hide them.

They come from OpenStreetMap's free Overpass service, so no key or account is needed. That
service is shared and often slow or busy, so:

- The server searches once per area of about 1 km and saves the answer in the `cache`
  collection. Every later visit, by anyone, even after a restart, shows it at once.
- A saved area more than a day old is searched again in the background, while the saved shops
  keep showing.
- If the service is busy, the server waits a few seconds and tries again, then a mirror. If all
  fail, the page tries once more by itself, then says OpenStreetMap is busy.
- Only the middle of the 1 km area is sent to OpenStreetMap, never the customer's exact spot.

OpenStreetMap lists fewer shops than Google Maps in some areas; anyone can add missing ones at
openstreetmap.org. With a Google key (below), the home page's 3D map shows Google's shops
instead. Google's terms do not allow its shops on a map that is not Google's, which is why the
Shops page uses OpenStreetMap's.

## Real 3D map (Google Maps)

With a Google Maps API key, the home page shows **Google's real 3D map of your location**
(including "Use my current location") instead of LocalRush's own 3D scene. On it:

- **You**: the gold star.
- **LocalRush shops**: coloured pins with their names. Tap one, then "Open shop" to order.
- **Other shops near you on Google Maps**: white pins, up to the 20 nearest groceries,
  supermarkets, pharmacies, bakeries, electronics and book shops. Google allows at most 20
  per search. Tap one for its address and "Open in Google Maps". They are also listed under
  "More shops near you". They are not on LocalRush, so nothing can be ordered from them.

Without a key, or if Google refuses it, the home page keeps LocalRush's own 3D scene and says
why. Nothing else changes.

### Getting a key

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and
   turn on billing for it (Google asks for a card even for the free allowance).
2. Under **APIs & Services → Library**, enable **Maps JavaScript API** and **Places API (New)**.
3. Under **APIs & Services → Credentials**, choose **Create credentials → API key**.
4. Edit the key and restrict it. Under **Application restrictions**, choose **Websites** and add
   `http://localhost:3000/*` (plus `http://localhost:8080/*` for minikube, and your real
   address if you have one). Under **API restrictions**, allow only the two APIs above. The
   key is visible to anyone who opens the site, so these restrictions are what protect it.
5. Put it in `.env.local` and restart `npm run dev`:

   ```
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-key
   ```

For the Docker image, pass it when building (`docker build --build-arg
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-key ...`). The Deploy workflow passes the repository
secret `GOOGLE_MAPS_API_KEY` if you add one.

### What it costs

- The 3D map (`Map3DElement`) is in Preview at Google, which is free for now; Google says it
  will be charged once it is generally available.
- Each shop search is one Places **Nearby Search** call. The site asks only for fields in the
  "Pro" tier, which has 5,000 free calls a month. It does not ask for ratings or opening hours,
  because those move every call to the dearer "Enterprise" tier. The site searches once per
  place and remembers the answer for 30 minutes (anywhere within about 100 m), so reloading
  the page does not search again.

Google has full photorealistic 3D buildings only for some cities. Elsewhere the map is
satellite imagery laid over the real terrain, still tilted and turnable.

## Fonts

Bricolage Grotesque and Figtree, both under the SIL Open Font Licence. The font files and
licences are in `app/fonts/`.
