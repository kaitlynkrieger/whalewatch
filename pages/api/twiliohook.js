const moment = require("moment-timezone");
import { withIronSession } from "next-iron-session";
import Secrets from "lib/Secrets";
import Constants from "lib/Constants";
import RandomWords from "lib/RandomWords";
import { FilterRE } from "lib/Filter";
import {
  getUserByPhoneNumber,
  createUser,
  createSightingEntry,
  updateUser,
  updateSighting,
  getMostRecentSighting,
  deleteUser,
} from "../../lib/Db";
const MessagingServiceSID = process.env["TWILIO_MESSAGING_SERVICE"];
const accountSid = process.env["TWILIO_ACCOUNT_SID"];
const authToken = process.env["TWILIO_AUTH_TOKEN"];
const twilioClient = require("twilio")(accountSid, authToken);

const MessagingResponse = require("twilio").twiml.MessagingResponse;

const API_HOST = process.env['API_HOST'];

const LastSightingThreshold = 4 * 60 * 60 * 1000; // in millis

const Regions = {
  StinsonBolinas: "stinson-bolinas",
};

const Patterns = {
  Unsubscribe: new RegExp("^(stop|unsubscribe)"),
  Weekend: new RegExp("weekend"),
  Anytime: new RegExp("anytime"),
  Subscribe: new RegExp("^(start|subscribe)"),
  Sighting: new RegExp("whale"),
  MessageReaction: new RegExp("^(laughed|emphasized|liked)"),
  Help: new RegExp("help"),
  Reset: new RegExp("_reset"),
  CancelSighting: new RegExp("^(cancel|no|nevermind)"),
  Yes: new RegExp("^(yes|yep|ok|yeah|y)"),
  ContactCard: new RegExp("^(contactcard)"),
  Thanks: new RegExp("thank"),
};

const ResponseText = {
  DidntUnderstand: `The whales didn’t recognize the phrase you just entered.

Reply “whale” to report a sighting in the Stinson/Bolinas area.

Or reply “subscribe” to get alerts when neighbors report whales.`,
  Welcome: `Welcome to West Marin Whale alerts. You’ll now get a text whenever someone reports a whale in the Stinson/Bolinas area.

To report a whale sighting, text “whale” to this number. We suggest adding this number to your contacts now; we're sending you the contact card.

P.S. If you’re only in West Marin on weekends, reply “weekend” to limit alerts to Sat & Sun. And you can always “unsubscribe.”

More info at www.westmarinwhales.org`,
  AlreadySubscribed: `Looks like you’re already signed up to get whale alerts. :-)`,

  UnrecognizedText: `Welcome to West Marin Whale alerts. Our system didn't understand the text you just entered, sorry.

Reply “whale” to report a sighting in the Stinson/Bolinas area.

Reply “subscribe” to get alerts when neighbors report whales.

Or visit www.westmarinwhales.org`,
  SightingDetails: (details) => `Exciting!

Where should we tell people to look? For example: “Straight out from The Siren”, or “Near shore in front of the Calles.”`,
  AskForName: `Last question: what’s your first name so we can credit your sighting?`,
  SightingConfirmation: `Thank you so much! We’ll spread the word and credit you. It might take up to 5 minutes for everyone to get the text.

Enjoy the whale :-)`,
  WeekendPreferenceConfirmation: `Roger that. If you change your mind, just text "anytime" to this number. Have a nice day!`,
  AnytimePreferenceConfirmation: `You'll now get all local alerts. If you change your mind, just text "weekend" to limit alerts to Sat & Sun.`,
  CancelSighting: `No problem. Feel free to ping us if you see another whale. :-)`,
  TooSoon: (details) =>
    `Thanks for reporting a whale! Folks are on the lookout since we sent an alert ${details.minutesAgo}. We currently limit alerts to every 4 hours, but please let us know if you see a whale in the future.`,
  DifferentWhale: (
    details
  ) => `Thank you! Just to check...We alerted folks ${details.minutesAgo} about a whale that someone saw “${details.sightingDetails}.”

Are you pretty sure this is a different whale?`,
  WantToSubscribe: `P.S. It looks like you’re not signed up to get text messages when other people see whales. Reply "subscribe" if you want alerts.`,
  //TODO WhaleAlert: `Dynamic content + unsubscribe etc.`,
  UnsubscribeConfirmation: `Got it. You will no longer receive any messages. You can still report a Stinson/Bolinas whale sighting by texting “whale” to this number.`,
  OffHours: `Our whale watchers are sleeping right now. Please report between 8am and 8pm.`,
  AdminConfirmation: (details) =>
    `${details.fromName} reported a whale ${details.where}. Notify everyone? Respond with "${details.keyword}"`,
  AdminMessageSent: "Notified our whale watchers!",
  AdminMessageError: "Something went wrong; maybe the keywords didn't match?",
  AdminMessageAlreadySent: "We already notified about this one.",
  WordFilterMatched: `Oops, the whales didn't like what you wrote. Can you try something else?`,
  SomeoneAlreadyReported: (
    details
  ) => `It looks like you and ${details.reporter} may have reported the same whale at almost the same time.

Currently our system sends out only one alert, but we’re still super grateful for your text!`,
  YoureWelcome: `It's our pleasure! Enjoy the whales 🐋🐋`,
};

const FlowState = {
  WaitingForDetails: "waiting-for-details",
  WaitingForName: "waiting-for-name",
  WaitingForDifferentWhale: "waiting-for-different-whale",
  PromptedForSubscription: "prompted-subscription",
};

const SessionStateKeys = {
  FlowState: "flow-state",
  PendingDetails: "pending-details",
  ReportStartTime: "report-start-time",
};

function writeResponse(res, str, includeVCard) {
  const response = new MessagingResponse();
  const message = response.message();
  message.body(str);
  if (includeVCard) {
    const mediaMessage = response.message();
    mediaMessage.media(
      "https://westmarinwhales.s3-us-west-2.amazonaws.com/westmarinwhales.vcf"
    );
  }
  res.setHeader("Content-Type", "text/xml");
  console.log("Responding: ", response.toString());
  res.end(response.toString());
}

async function handleUnsubscribe(req, res, phoneNumber) {
  let doc = await getUserByPhoneNumber(phoneNumber)
    .then(async (doc) => {
      await updateUser(doc, { subscribed: false });
    })
    .catch((err) => {
      if (!err.requestResult || err.requestResult.statusCode !== 404) {
        writeResponse(
          res,
          "Sorry, we're having some trouble right now. Please try again in a minute."
        );
      }
    });
  writeResponse(res, ResponseText.UnsubscribeConfirmation);
}

async function handleSubscribe(req, res, phoneNumber) {
  // save to DB
  let existing = await getUserByPhoneNumber(phoneNumber);
  if (existing) {
    if (existing.subscribed) {
      writeResponse(res, ResponseText.AlreadySubscribed);
    } else {
      await updateUser(existing, { subscribed: true });
      writeResponse(res, ResponseText.Welcome, true);
    }
    return;
  } else {
    await createUser(phoneNumber, null, true);
    writeResponse(res, ResponseText.Welcome, true);
  }
}

async function handleAdminConfirmation(req, res, phoneNumber, text) {
  let mostRecent = await getMostRecentSighting();
  console.log(API_HOST, mostRecent.keyword, text.toLowerCase());
  if (mostRecent.keyword === text.toLowerCase()) {
    if (mostRecent.notified) {
      writeResponse(res, ResponseText.AdminMessageAlreadySent);
      return;
    }
    console.log("Notifying", API_HOST + "/api/sendmessage");
    let payload = JSON.stringify({
      secret: Secrets.SendMessageSecret,
      fromName: mostRecent.name,
      details: mostRecent.details,
      when: mostRecent.ts.getTime(),
      reallySend: true,
    });
    await updateSighting(mostRecent, { notified: true });
    console.log(payload);
    await fetch(API_HOST + "/api/sendmessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
    });
    writeResponse(res, ResponseText.AdminMessageSent);
  } else {
    writeResponse(res, ResponseText.AdminMessageError);
  }
}

async function handleNotificationMessageSend(
  req,
  res,
  userDocument,
  sightingDetails,
  startTime
) {
  // as a last check, see if we notified in the meantime
  let mostRecent = await getMostRecentSighting();
  console.log(mostRecent && mostRecent.ts.getTime(), startTime);
  if (!mostRecent || mostRecent.ts.getTime() < startTime) {
    let randomWord = RandomWords({ exactly: 1, maxLength: 5 })[0];
    await createSightingEntry(userDocument, sightingDetails, randomWord);
    Constants.AdminPhoneNumbers.forEach(async (phone) => {
      await twilioClient.messages
        .create({
          body: ResponseText.AdminConfirmation({
            fromName: userDocument.name,
            where: sightingDetails,
            keyword: randomWord,
          }),
          messagingServiceSid: MessagingServiceSID,
          to: phone,
        })
        .catch((err) => console.error(err));
    });
    var responseText = ResponseText.SightingConfirmation;
    if (!userDocument.subscribed) {
      await setSessionState(
        req,
        SessionStateKeys.FlowState,
        FlowState.PromptedForSubscription
      );
      responseText = responseText + "\n\n" + ResponseText.WantToSubscribe;
    }
    await clearSessionState(req);
    writeResponse(res, responseText);
  } else {
    await clearSessionState(req);
    writeResponse(
      res,
      ResponseText.SomeoneAlreadyReported({ reporter: mostRecent.name })
    );
  }
}

async function handleSetName(req, res, phoneNumber, text) {
  if (FilterRE.test(text)) {
    writeResponse(res, ResponseText.WordFilterMatched);
    return;
  }
  var existing = await getUserByPhoneNumber(phoneNumber);
  if (!existing) {
    existing = await createUser(phoneNumber, text, false);
  } else {
    await updateUser(existing, { name: text });
    existing.name = text;
  }
  let details = req.session.get(SessionStateKeys.PendingDetails);
  let startTime = req.session.get(SessionStateKeys.ReportStartTime);
  await clearSessionState(req);
  await handleNotificationMessageSend(req, res, existing, details, startTime);
}

async function handleRequestSightingDetails(req, res, phoneNumber) {
  let user = await getUserByPhoneNumber(phoneNumber);
  let name = user && user.name;
  let thankYou = name ? `Thanks, ${name}!` : "Thank you";
  await setSessionState(
    req,
    SessionStateKeys.FlowState,
    FlowState.WaitingForDetails
  );
  await setSessionState(req, SessionStateKeys.PendingDetails, null);
  await setSessionState(
    req,
    SessionStateKeys.ReportStartTime,
    new Date().getTime()
  );
  writeResponse(res, ResponseText.SightingDetails({ thankYou: thankYou }));
}

async function handleSighting(req, res, phoneNumber) {
  let localTime = moment.tz(new Date().getTime(), "America/Los_Angeles");
  let pacificHour = localTime.hours();
  if (pacificHour < 8 || pacificHour >= 20) {
    writeResponse(res, ResponseText.OffHours);
    return;
  }
  let mostRecent = await getMostRecentSighting();
  let thresholdTs = new Date().getTime() - LastSightingThreshold;
  if (mostRecent && mostRecent.ts.getTime() > thresholdTs) {
    let deltaMinutes =
      (new Date().getTime() - mostRecent.ts.getTime()) / 1000 / 60;
    var minutesAgo;
    if (deltaMinutes < 60) {
      minutesAgo = `${Math.floor(deltaMinutes)} minutes ago`;
    } else {
      let hours = Math.floor(deltaMinutes / 60);
      minutesAgo = hours === 1 ? "1 hour ago" : `${hours} hours ago`;
    }
    writeResponse(
      res,
      ResponseText.TooSoon({
        minutesAgo: minutesAgo,
      })
    );
  } else {
    Constants.AdminPhoneNumbers.forEach(async (phone) => {
      await twilioClient.messages
        .create({
          body: "Someone just said whale! be ready to approve or debug",
          messagingServiceSid: MessagingServiceSID,
          to: phone,
        })
        .catch((err) => console.error(err));
    });
    return await handleRequestSightingDetails(req, res, phoneNumber);
  }
}

async function handleDifferentWhale(req, res, phoneNumber) {
  return await handleRequestSightingDetails(req, res, phoneNumber);
}

async function handleSightingDetails(req, res, phoneNumber, text) {
  let user = await getUserByPhoneNumber(phoneNumber);
  if (!user || !user.name) {
    await setSessionState(
      req,
      SessionStateKeys.FlowState,
      FlowState.WaitingForName
    );
    await setSessionState(req, SessionStateKeys.PendingDetails, text);
    writeResponse(res, ResponseText.AskForName);
  } else {
    // fail-safe; make sure we're not about to send a strange message
    let pendingDetails = req.session.get(SessionStateKeys.PendingDetails);
    let messageText = pendingDetails || text;
    if (
      Patterns.Subscribe.test(messageText) ||
      Patterns.Unsubscribe.test(messageText)
    ) {
      writeResponse(res, ResponseText.DidntUnderstand);
      return;
    }
    if (FilterRE.test(text)) {
      writeResponse(res, ResponseText.WordFilterMatched);
      return;
    }
    let startTime = req.session.get(SessionStateKeys.ReportStartTime);
    await handleNotificationMessageSend(req, res, user, messageText, startTime);
  }
}

async function handleWeekendPreference(req, res, phoneNumber, text) {
  let sendOnlyWeekends = Patterns.Weekend.test(text.toLowerCase());
  let existing = await getUserByPhoneNumber(phoneNumber);
  await updateUser(existing, {
    weekend_only: sendOnlyWeekends,
  });
  if (sendOnlyWeekends) {
    writeResponse(res, ResponseText.WeekendPreferenceConfirmation);
  } else {
    writeResponse(res, ResponseText.AnytimePreferenceConfirmation);
  }
}

async function handleCancelSighting(req, res, phoneNumber, text) {
  await setSessionState(req, SessionStateKeys.FlowState, null);
  writeResponse(res, ResponseText.CancelSighting);
}

async function handleThankYou(req, res, phoneNumber, text) {
  writeResponse(res, ResponseText.YoureWelcome);
}

async function setSessionState(req, key, value) {
  req.session.set(key, value);
  await req.session.save();
}

async function clearSessionState(req) {
  Object.values(SessionStateKeys).forEach((key) => {
    req.session.set(key, null);
  });
  await req.session.save();
}

async function handleReset(req, res, phoneNumber) {
  await setSessionState(req, SessionStateKeys.FlowState, null);
  let document = await getUserByPhoneNumber(phoneNumber);
  if (document) {
    await deleteUser(document);
  }
  writeResponse(res, "State reset");
}

async function handleContactCard(req, res, phoneNumber) {
  writeResponse(res, "Add to your address book", true);
}

async function handler(req, res) {
  const twilioMsg = req.body;
  const msgBody = twilioMsg.Body.trim();
  const msgBodyLower = msgBody.toLowerCase();
  const fromPhone = twilioMsg.From;
  const flowState = req.session.get(SessionStateKeys.FlowState);

  var fn;
  console.log("Handling incoming message", fromPhone, msgBody);
  if (Patterns.Reset.test(msgBodyLower)) {
    fn = handleReset;
  } else if (Patterns.ContactCard.test(msgBodyLower)) {
    fn = handleContactCard;
  } else if (
    Patterns.Weekend.test(msgBodyLower) ||
    Patterns.Anytime.test(msgBodyLower)
  ) {
    fn = handleWeekendPreference;
  } else if (
    (flowState === FlowState.WaitingForDetails ||
      flowState === FlowState.WaitingForDifferentWhale ||
      flowState === FlowState.WaitingForName) &&
    Patterns.CancelSighting.test(msgBodyLower)
  ) {
    fn = handleCancelSighting;
  } else if (flowState === FlowState.WaitingForDetails) {
    fn = handleSightingDetails;
  } else if (flowState === FlowState.WaitingForName) {
    fn = handleSetName;
  } else if (flowState === FlowState.WaitingForDifferentWhale) {
    if (Patterns.Yes.test(msgBodyLower)) {
      fn = handleDifferentWhale;
    } else {
      fn = handleCancelSighting;
    }
  } else if (Patterns.Unsubscribe.test(msgBodyLower)) {
    fn = handleUnsubscribe;
  } else if (Patterns.Subscribe.test(msgBodyLower)) {
    fn = handleSubscribe;
  } else if (Patterns.Sighting.test(msgBodyLower) && !Patterns.MessageReaction.test(msgBodyLower)) {
    fn = handleSighting;
  } else if (Patterns.Thanks.test(msgBodyLower)) {
    fn = handleThankYou;
  } else if (Patterns.Help.test(msgBodyLower)) {
    // do nothing, handled on the Twilio side
  } else if (Constants.AdminPhoneNumbers.indexOf(fromPhone) !== -1) {
    fn = handleAdminConfirmation;
  } else {
    writeResponse(res, ResponseText.DidntUnderstand);
    return;
  }
  fn && (await fn(req, res, fromPhone, msgBody));
}

export default withIronSession(handler, {
  password: Secrets.CookieSecret,
  cookieName: "whalecookie2",
  cookieOptions: {
    secure: false,
  },
  // if your localhost is served on http:// then disable the secure flag
});