# LocalRush Partner (phone app)

The delivery partner's app for LocalRush, made with React Native and Expo (SDK 58). It uses the
same server as the LocalRush website in the folder above, so an order placed on the website shows
up in the app, and everything the partner does in the app shows up on the website straight away.

What a partner can do:

- **Log in** with their mobile number (any 4-digit code works: no SMS is sent yet).
- **Go online**. While online and the app is open, packed orders at shops within 6 km appear by
  themselves, and the **phone buzzes** with a banner for each new one.
- **Share GPS**. Jobs and distances follow the phone. While a delivery is on its way, the
  customer follows the partner on a live map on their order page, and the delivery screen
  says so. A partner can choose an area from a list instead (the customer then sees an
  estimate).
- **Take a delivery**, see what it pays, get **directions in Google Maps** to the shop and then
  to the customer, tick off the items, and **call the customer**.
- **Hand it over with the customer's 4-digit code**. A wrong code is refused.
- See **earnings** for today, the last 7 days and all time, cash to hand over, and every trip.

## Run it on your phone

You need the laptop with this project, an Android phone (or an iPhone), and both on the **same Wi-Fi**.
The laptop needs Node.js 22.13 or newer (24.3 or newer on Node 24, or Node 26): `node -v` shows it.

1. **Start the LocalRush server** on the laptop, in the project folder (one level up):

   ```bash
   npm run dev
   ```

2. **Start the app**, in a second terminal:

   ```bash
   cd partner-app
   npm install
   npx expo start
   ```

3. On the phone, install **Expo Go** from the Play Store (or the App Store). Scan the QR code that
   `npx expo start` shows: in Expo Go on Android, on iPhone with the Camera app.

4. The app finds the server by itself: the laptop's Wi-Fi address, port 3000. The login screen
   says **Connected to LocalRush** when it can reach it. If not, tap **Change** and enter the
   address, for example `http://192.168.1.5:3000`. On Windows, `ipconfig` shows the laptop's
   address as "IPv4 Address" under Wi-Fi.

5. Log in as a demo partner: tap **Ravi K.** (`9100000001`), then **Log in**. Go online and allow
   location when the phone asks.

## Show a whole delivery

| Where | Do this |
|---|---|
| Phone | Log in as Ravi K. and go online |
| Laptop, `localhost:3000` | As a customer at PES University, order milk and bread |
| Laptop, `localhost:3000/dashboard` | As Sri Lakshmi (`9000000001`): Accept, then Packed and ready |
| Phone | The phone buzzes: **New delivery near you**. Tap **Take this delivery** |
| Phone | **Directions to the shop**, tick the items, **I have picked it up** |
| Laptop, the customer's order page | Shows the delivery code, and the partner on a live map: the scooter moves as the phone moves |
| Phone | Enter that code and **Complete delivery**. The **Earnings** tab shows what it paid |

## If something does not work

- **"Cannot reach the LocalRush server"**: check that `npm run dev` is running, that the phone and
  laptop are on the same Wi-Fi, and that the address is right. On Windows, allow **Node.js** through
  the firewall for private networks (Windows asks the first time; if you said no, find Node.js under
  *Windows Security → Firewall & network protection → Allow an app through firewall*), and set the
  Wi-Fi network to **Private**. College and office Wi-Fi often blocks phones from reaching laptops:
  turn on the phone's hotspot and connect the laptop to it instead.
- **Expo Go says the project is incompatible**: this app uses Expo SDK 58, and Expo Go only opens
  apps made for its own SDK. Update Expo Go from the Play Store. If the Play Store still has the
  Expo Go for SDK 57, switch the app to SDK 57 instead: in `partner-app`, run
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
  notifications, which this project does not have yet.
- **The customer's map does not move**: the phone must be sharing GPS (the delivery screen
  says "can see where you are"), and GPS works badly indoors. Go outside, or show it with
  `npm run demo:ride` on the laptop instead (see the main README); then choose an area in the
  app, so the phone's own position does not mix with the script's.

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

The app uses the website's API (`/api/...`). It logs in on the partner seat and gets a token
instead of a cookie (it sends `X-LocalRush-Client: app` when logging in), then sends
`Authorization: Bearer <token>` and `X-LocalRush-Seat: partner` with every request. The token
works only for delivery partner requests, for 30 days. While the app is open it keeps a live
connection to `/api/live`, the same one the website uses, so a job appears the moment a shop
packs it (**LIVE** shows at the top while it is connected; without it, the app checks every 4
seconds). It sends the phone's GPS position with `PUT /api/partner { place, gps: true }`:
while waiting for jobs, after about 60 m or once a minute; while delivering, after about 15 m
or every 15 seconds (at most every 3 seconds), so the customer's live map moves smoothly.

| File | What it does |
|---|---|
| `App.tsx` | Start-up: the login screen or the main screens |
| `src/store.tsx` | Everything the app knows: login, deliveries, jobs nearby, GPS, the server address |
| `src/api.ts` | Every call to the server |
| `src/live.ts` | The live connection: hears about changes the moment they happen |
| `src/location.ts` | The phone's GPS (expo-location) |
| `src/config.ts` | Working out the server address from Expo |
| `src/screens/` | Login, Deliveries (jobs and the delivery under way), Earnings, Account |
| `src/ui.tsx`, `src/theme.ts` | Buttons, cards, banners and the LocalRush colours |
