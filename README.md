This is the backend code that powers [West Marin Whales](https://westmarinwhales.org), a whale watching notification service we built for West Marin. It can be easily adapted to create a community notification service of your own.

The front-end at westmarinwhales.org is just a static page on Squarespace and isn't included here.

To start it up:
```bash
npm install 
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. It's built on [Next.JS](https://nextjs.org/) so please see those docs for further information.

The following environment variables must be set (ideally in an `.env.development` and `.env.production` file; Next.JS will automatically pick those up):

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
