This is the code that powers westmarinwhales.org.

To start it up:
```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The following environment variables must be set (ideally in an `.env.development` and `.env.production`):

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE=
PGUSER=
PGPASSWORD=
PGDATABASE=
ADMIN_PHONE_NUMBERS=/*comma separated list of numbers eg +16505551234,+14155551234*/
SEND_MESSAGE_SECRET=/*generate a random string here */
COOKIE_SECRET=/* generate a random string here */
DEBUG_URL_SECRET=/* you can view some debug info at http://yourhost/api/debug/THIS_SECRET/ */
API_HOST=/* if using ngrok can be https://yourtunnel.ngrok.io */
```
