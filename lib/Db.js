const { Pool } = require('pg')

const PGPool = new Pool();

export async function getAllActiveSubscribers(filterWeekenders) {
  const dayOfWeek = new Date().getDay();
  const isWeekend = (dayOfWeek === 6 || dayOfWeek === 7);
  let shouldFilterWeekenders = filterWeekenders && isWeekend;

  let weekendOnly = filterWeekenders ? "AND weekend_only = false" : "";
  let res = await PGPool.query(`SELECT phonenumber FROM members WHERE subscribed = true ${weekendOnly}`).catch((err) => {
    console.error(err);
    throw err;
  });
  return res["rows"];
}

export async function createSightingEntry(user, details, keyword) {
  let res = await PGPool.query(`INSERT INTO sightings(phonenumber, name, keyword, details, ts) VALUES($1, $2, $3, $4, $5) RETURNING *`,
  [user.phonenumber, user.name, keyword, details, new Date()]);
  return res["rows"][0];
}
export async function getMostRecentSighting() {
  let res = await PGPool.query(`SELECT * FROM sightings ORDER BY ts DESC LIMIT 1`);
  return res["rows"] ? res["rows"][0] : null;
}
export async function getUserByPhoneNumber(phoneNumber) {
  let res = await PGPool.query(`SELECT * FROM members WHERE phonenumber = $1`, [phoneNumber]);
  return res["rows"] ? res["rows"][0] : null;
}
export async function createUser(phoneNumber, name, isSubscribed) {
  let res = await PGPool.query(`INSERT INTO members(phonenumber, subscribed, name) VALUES($1, $2, $3) RETURNING *`, [phoneNumber, isSubscribed, name]);
  return res["rows"][0];
}
export async function updateUser(document, updateObject) {
  var query = ['UPDATE members'];
  query.push('SET');
  var set = [];
  Object.keys(updateObject).forEach(function (key, i) {
    set.push(key + ' = ($' + (i + 1) + ')');
  });
  query.push(set.join(', '));
  query.push(`WHERE phonenumber = '${document.phonenumber}'`);
  let fullQuery = query.join(" ");

  let values = Object.keys(updateObject).map((key) => updateObject[key]);
  let res = await PGPool.query(fullQuery, values);
  return res;
}
export async function updateSighting(document, updateObject) {
  var query = ['UPDATE sightings'];
  query.push('SET');
  var set = [];
  Object.keys(updateObject).forEach(function (key, i) {
    set.push(key + ' = ($' + (i + 1) + ')');
  });
  query.push(set.join(', '));
  query.push(`WHERE id = '${document.id}'`);
  let fullQuery = query.join(" ");

  let values = Object.keys(updateObject).map((key) => updateObject[key]);
  let res = await PGPool.query(fullQuery, values);
  return res;
}
export async function deleteUser(document) {
  let res = await PGPool.query('DELETE FROM members WHERE phonenumber = $1', [document.phonenumber]);
  return res;
}
