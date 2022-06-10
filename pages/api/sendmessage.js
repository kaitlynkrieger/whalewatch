import Secrets from "lib/Secrets";
import { getAllActiveSubscribers } from "../../lib/Db";

const moment = require("moment-timezone");
const accountSid = process.env["TWILIO_ACCOUNT_SID"];
const authToken = process.env["TWILIO_AUTH_TOKEN"];
const MessagingServiceSID = process.env["TWILIO_MESSAGING_SERVICE"];
const client = require("twilio")(accountSid, authToken);

async function handler(req, res) {
  let body = req.body;
  console.log("Executing sendmessage");
  if (body.secret !== Secrets.SendMessageSecret) {
    res.statusCode = 400;
    res.end("Invalid secret");
    return;
  }
  if (!body.fromName || !body.details) {
    res.statusCode = 400;
    res.end("Missing parameters");
    return;
  }
  let subscribers = await getAllActiveSubscribers(true);
  let timeOfSighting = moment
    .tz(body.when, "America/Los_Angeles")
    .format("h:mma");
  let messageBody = `Ahoy! ${body.fromName} spotted a whale: “${body.details}” (${timeOfSighting})`;
  if (body.reallySend) {
    subscribers.forEach(async (sub) => {
      console.log("Notifying", sub.phonenumber);
      client.messages
        .create({
          body: messageBody,
          messagingServiceSid: MessagingServiceSID,
          to: sub.phonenumber,
        })
        .catch((err) => console.log("Twilio error", err));
      // sleep a little to back off Twilio
      await new Promise(r => setTimeout(r, 100));
    });
  } else {
    console.log(
      "Would have sent message",
      messageBody,
      "to",
      subscribers.length,
      "subscribers"
    );
  }
  res.end("Sent");
}

export default handler;
