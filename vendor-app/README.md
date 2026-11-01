# LocalRush Vendor (phone app)

The shop owner's app for LocalRush, made with React Native and Expo (SDK 58). It uses the same
server as the LocalRush website in the folder above, so an order placed on the website arrives
in the app, and everything the owner does in the app shows up on the website straight away:
on the customer's tracking page, on the delivery partners' phones and on the shop dashboard.

What a shop owner can do:

- **Log in** with their mobile number (any 4-digit code works: no SMS is sent yet).
- **Get new orders**. While the app is open, an order placed with the shop appears the moment
  the customer places it, the **phone buzzes**, and a banner shows what was ordered. An order left waiting for over two
  minutes turns red.
- **Accept** an order or **turn it down** (LocalRush then offers it to the next shop nearby),
  tick the items while packing, and tap **Packed and ready**: delivery partners nearby are told
  at once. The app then shows which partner is coming to collect it, and when it is delivered.
- **Call the customer** about an order, for example when an item has run out.
- **Pause the shop** when it is too busy, and switch it back on.
- **Change stock and prices**, mark a product out of stock, start selling a product from the
  LocalRush list, or **add a new product**.
- See **sales** for today, the last 7 days and all time: what sold, at what price, and every
  delivered order.

## Run it on your phone

You need the laptop with this project, an Android phone (or an iPhone), and both on the **same Wi-Fi**.
The laptop needs Node.js 22.13 or newer (24.3 or newer on Node 24, or Node 26): `node -v` shows it.

1. **Start the LocalRush server** on the laptop, in the project folder (one level up):

   ```bash
   npm run dev
   ```

2. **Start the app**, in a second terminal:

   ```bash
   cd vendor-app
   npm install
   npx expo start
   ```

   If the delivery partner app is already running in another terminal, start this one with
   `npx expo start --port 8082` instead.

3. On the phone, install **Expo Go** from the Play Store (or the App Store). Scan the QR code that
   `npx expo start` shows: in Expo Go on Android, on iPhone with the Camera app.

4. The app finds the server by itself: the laptop's Wi-Fi address, port 3000. The login screen
   says **Connected to LocalRush** when it can reach it. If not, tap **Change** and enter the
   address, for example `http://192.168.1.5:3000`. On Windows, `ipconfig` shows the laptop's
   address as "IPv4 Address" under Wi-Fi.

5. Log in as a demo shop: tap **Sri Lakshmi Provision Store** (`9000000001`), then **Log in**.
   **Show all 15 shops** lists the rest.

## Show a whole order

| Where | Do this |
|---|---|
| Phone | Log in as Sri Lakshmi Provision Store. The Orders tab says **Taking orders** |
| Laptop, `localhost:3000` | As a customer at PES University, order milk and bread |
| Phone | The phone buzzes: **New order**. Tap **Accept**, tick the items, then **Packed and ready** |
| Laptop, `localhost:3000/partner` (or the partner app) | As Ravi K. (`9100000001`): go online and take the delivery |
| Phone | The order shows **Ravi K. is coming to collect it** |
| Partner | Pick it up and deliver it with the customer's code |
| Phone | **Delivered** under Finished today; the **Sales** tab shows what it sold for |
| Phone, **Products** tab | Change a price or the stock, then look at the shop on the website: it has changed |

If the order goes to a different shop, log in as that shop instead: the demo shops are on the
login screen. Ordering from right next to the shop, or with **Fastest** chosen at checkout,
keeps it with the nearest shop.

## If something does not work

- **"Cannot reach the LocalRush server"**: check that `npm run dev` is running, that the phone and
  laptop are on the same Wi-Fi, and that the address is right. On Windows, allow **Node.js** through
  the firewall for private networks (Windows asks the first time; if you said no, find Node.js under
  *Windows Security → Firewall & network protection → Allow an app through firewall*), and set the
  Wi-Fi network to **Private**. College and office Wi-Fi often blocks phones from reaching laptops:
  turn on the phone's hotspot and connect the laptop to it instead.
- **Expo Go says the project is incompatible**: this app uses Expo SDK 58, and Expo Go only opens
  apps made for its own SDK. Update Expo Go from the Play Store. If the Play Store still has the
  Expo Go for SDK 57, switch the app to SDK 57 instead: in `vendor-app`, run
  `npx expo install expo@^57.0.0 --fix` and then `npx expo start` again. When a later Expo Go asks
  for a newer SDK, run `npx expo install expo@latest --fix`.
- **The QR code shows the wrong address** (for example `172.x.x.x`, which comes from Docker or WSL,
  instead of the Wi-Fi address that `ipconfig` shows): in PowerShell, give Expo the Wi-Fi address
  first, then start it:

  ```powershell
  $env:REACT_NATIVE_PACKAGER_HOSTNAME = "192.168.1.5"
  npx expo start
  ```

  The app then also finds the server at that address.
- **`npx expo start --tunnel`**: the app still loads, but it cannot work out the server address.
  Enter it on the login screen; the phone must still be able to reach the laptop on port 3000.
- **No LIVE at the top of the app**: the app still works, but checks for changes every 4 seconds
  instead of hearing about them at once. The live connection stays open to the laptop all the
  time, and some Wi-Fi networks, VPNs and battery savers cut connections like that; the phone's
  hotspot usually works. Pull down on a list to refresh it at any time.
- **No buzz**: alerts come while the app is open. Alerts with the app closed need push
  notifications, which this project does not have yet. Keep the app open on the counter.

## Build an APK to install (optional)

With a free Expo account:

```bash
npx eas-cli@latest build -p android --profile preview
```

EAS builds it online and gives you a link to download the APK. The APK talks to the server over
plain `http://` on your Wi-Fi, which `expo-build-properties` allows in `app.json`.

## Check the code

```bash
npm run typecheck
```

## How it talks to the server

The app uses the website's API (`/api/...`), the same calls as the shop dashboard. It logs in on
the shop seat and gets a token instead of a cookie (it sends `X-LocalRush-Client: app` when
logging in), then sends `Authorization: Bearer <token>` and `X-LocalRush-Seat: shop` with every
request. The token works only for shop owner requests, for 30 days. While the app is open it
keeps a live connection to `/api/live`, the same one the website uses: the moment an order
arrives or changes, or stock and prices change, the server says so and the app reads it at
once. **LIVE** shows at the top while it is connected; without it, the app checks every 4
seconds.

| Call | What for |
|---|---|
| `GET /orders` | The shop's orders |
| `POST /orders/:id/accept`, `reject`, `pack` | Accept, turn down, packed and ready |
| `GET /catalog` | Products, the shop's stock and prices, and whether it is paused |
| `PUT /shop/stock` | `{ pid, price, stock }` |
| `POST /shop/products` | A new product |
| `PUT /shop/paused` | `{ paused }` |
| `GET /shop/sales?period=today\|week\|all` | Sales |
| `GET /live` | The live connection: a short message whenever something changes |

| File | What it does |
|---|---|
| `App.tsx` | Start-up: the login screen or the main screens |
| `src/store.tsx` | Everything the app knows: login, orders, stock, the server address, new-order alerts |
| `src/api.ts` | Every call to the server |
| `src/live.ts` | The live connection: hears about changes the moment they happen |
| `src/catalog.ts` | Categories, stock levels and shop hours (Indian time, like the website) |
| `src/config.ts` | Working out the server address from Expo |
| `src/screens/` | Login, Orders, Products (with the product and new product sheets), Sales, Shop |
| `src/ui.tsx`, `src/theme.ts` | Buttons, cards, fields, banners and the LocalRush colours |

`src/config.ts`, `src/theme.ts` and much of `src/ui.tsx` are the same as in the delivery partner
app (`../partner-app`). Each app keeps its own copy so that it can be started on its own.
