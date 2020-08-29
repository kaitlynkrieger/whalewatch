import RandomWords from "lib/RandomWords";
import {
  getUserByPhoneNumber,
  getMostRecentSighting,
  getAllActiveSubscribers,
} from "lib/Db";
import Constants from "lib/Constants";
import Secrets from "lib/Secrets";

export default async function handler(req, res) {
 const {
    query: { secret },
  } = req;
  if (secret !== Secrets.DebugURLSecret) {
    res.end("Invalid.");
    return;
  }
  let recent = await getMostRecentSighting();
  let allSubs = await getAllActiveSubscribers(true);
  let person = await getUserByPhoneNumber(Constants.AdminPhoneNumbers[0]);

  res.end(
    "OK, Most recent: " +
      JSON.stringify(recent) +
      "\nAll subs: " +
      JSON.stringify(allSubs.length) +
      "\nUser by number: " +
      JSON.stringify(person)
  );
}