/**
 * Generate the NeoHabitat book of records from the database.
 * Intended to be run as a batch job periodically (at least once per day.)
 * 
 * NOTE: Though the text-bookofrecords file is generated by default into
 * the db/Text directory, the generated version is not checked into git.
 * This file is always dynamically generated.
 * 
 * By: Randy Farmer April 2017
 */

const	File		= require('fs').promises;
const	Trace 		= require('winston');
const	MongoClient	= require('mongodb').MongoClient;
const	Assert 		= require('assert');

const	DefDefs		= { mongo: 'neohabitatmongo:27017/elko', trace: 'error', book: '../db/Text/text-bookofrecords.json'};
var		Defaults 	= DefDefs;

try {
 var userDefs = JSON.parse(File.readFileSync("defaults.elko"));
 Defaults = { mongo: userDefs.mongo || DefDefs.mongo,  trace: userDefs.trace || DefDefs.trace, book: userDefs.book || DefDefs.book};
} catch (e) {
 Trace.debug("Missing/invalid defaults.elko configuration file. Proceeding with factory defaults.");
}

const 	Argv		= require('yargs')
.usage('Usage: $0 [options]')
.help('help')
.option('help',  { alias: '?', describe: 'Get this usage/help information'})
.option('trace', { alias: 't', default: Defaults.trace, describe: 'Trace level name. (see: npm winston)'})
.option('mongo', { alias: 'm', default: Defaults.mongo, describe: 'Mongodb server URL'})
.option('book',	 { alias: 'b', default: Defaults.book,  describe: 'JSON output file for The Book of Records.'})
.argv;

Trace.level = Argv.trace;

const HS$lifetime          		=   1;
const HS$max_lifetime      		=   2;
const HS$deaths            		=   3;
const HS$treasures         		=   4;
const HS$mail_send_count   		=   5;
const HS$mail_recv_count   		=   6;
const HS$grabs             		=   7;
const HS$kills             		=   8;
const HS$escapes           		=   9;
const HS$body_changes      		=  10;
const HS$max_wealth        		=  11;
const HS$travel            		=  12;
const HS$max_travel        		=  13;
const HS$teleports         		=  14;
const HS$explored          		=  15;
const HS$online_time       		=  16;
const HS$talkcount         		=  17;
const HS$wealth            		=  18;
const HS$ghost_count       		=  19;
const HS$esp_send_count    		=  20;
const HS$esp_recv_count    		=  21;
const HS$requests          		=  22;

const blankline = "                                        ";

function pad (text, center) {
	if (center) {
		var pad = (40 - text.length) / 2;
		return (blankline.substring(0, pad) + text + blankline).substring(0,40);
	}
	return (text + blankline).substring(0, 40);
}

function sortByStat(userRecords, statID, valueFunc) {
	if (undefined === valueFunc) {
		valueFunc = function(userRecords, name, statID) {return userRecords[name][statID]; };
	}
	var table = [];
	for (name in userRecords) {
		table.push({value:valueFunc(userRecords, name, statID), name: name});
	}
	return table.sort(function(a, b) { return b.value - a.value; });
}

function makeLeaderboard(userRecords, statID, prefix, postfix, valueFunc) {
	var table = sortByStat(userRecords, statID, valueFunc);
	var list = "";
	for (var i = 0; i < 10; i++) {
		var details = "";
		if (i < table.length) {
			var stats = userRecords[table[i].name];
			if (stats[statID]) {
				details = (prefix == postfix) ?  "" :  " " + prefix + stats[statID] + postfix;
				list += pad( "" + (i+1) + ". " + (table[i].name + blankline).substring(0,12) + details);
			} else {
				list += pad("" + (i+1) + ".");
			}
		} else {
			list += pad("" + (i+1) + ".");
		}
	}
	return list;
}

function generateRecords(userRecords) {
	pages = [];
	pages.push(
			pad("The Book of Records - " + (new Date()).toString().substring(0, 15), true) + 
			pad(" 1. Contents") +
			pad(" 2. WEALTHIEST") +
			pad(" 3. ALL-TIME WEALTHIEST") +
			pad(" 4. LONGEST LIVED") +
			pad(" 5. ALL-TIME LONGEST LIVED") +
			pad(" 6. MOST TIMES KILLED") +
			pad(" 7. MOST DANGEROUS") +
			pad(" 8. MOST OUTSPOKEN") +
			pad(" 9. BIGGEST CHAMELEON") +
			pad("10. MOST TELEPATHIC") +
			pad("11. MOST ACTIVE") +
			pad("12. MOST SEDATE") +
			pad("13. MOST TRAVELLED") +
			pad("14. ALL-TIME MOST TRAVELLED") +
			pad("15. MOST ACTIVE TELEPORTER") );
	pages.push (
			pad("WEALTHIEST: The 10 Avatars with the", true) + 
			pad("largest bank accounts today.", true) +
			blankline +
			makeLeaderboard(userRecords, HS$wealth, "($", ")") );
	pages.push(
			pad("ALL-TIME WEALTHIEST: The 10 largest", true) + 
			pad("bank balances ever achieved.", true) +
			blankline +
			makeLeaderboard(userRecords, HS$max_wealth, "($", ")"));
	pages.push(
			pad("LONGEST LIVED: The 10 oldest Avatars", true) + 
			pad("today.", true) +
			blankline +
			makeLeaderboard(userRecords, HS$lifetime, "", " days"));
	pages.push(
			pad("ALL-TIME LONGEST LIVED: The 10 oldest", true) + 
			pad("Avatars that ever were.", true) +
			blankline +
			makeLeaderboard(userRecords, HS$max_lifetime, "", " days"));
	pages.push(
			pad("MOST TIMES KILLED: The 10 most killed", true) + 
			pad("Avatars.", true) +
			blankline +
			makeLeaderboard(userRecords, HS$deaths, "", " deaths"));
	pages.push(
			pad("MOST DANGEROUS: The 10 Avatars who have", true) + 
			pad("killed the largest number of their", true) +
			pad("fellow Avatars.", true) +
			makeLeaderboard(userRecords, HS$kills, "", " kills"));
	pages.push(
			pad("MOST OUTSPOKEN: The 10 most talkative", true) + 
			pad("Avatars.", true) +
			blankline +
			makeLeaderboard(userRecords, HS$talkcount, "", " balloons"));
	pages.push(
			pad("BIGGEST CHAMELEON: The 10 Avatars who", true) + 
			pad("change their appearance most often.", true) +
			blankline +
			makeLeaderboard(userRecords, HS$body_changes, "", "", function(u,n) { return u[n][HS$body_changes]/u[n][HS$lifetime]; } ));
	pages.push(
			pad("MOST TELEPATHIC: The 10 Avatars with the", true) + 
			pad("greatest usage of ESP.", true) +
			blankline +
			makeLeaderboard(userRecords, HS$esp_send_count, "", "", function(u,n) { return (u[n][HS$esp_send_count]+ u[n][HS$esp_recv_count])/u[n][HS$lifetime]; } ));
	pages.push(
			pad("MOST ACTIVE: The 10 most active", true) + 
			pad("Avatars.", true) + 
			blankline +
			makeLeaderboard(userRecords, HS$travel, "", "", function(u,n) { return u[n][HS$travel]/u[n][HS$lifetime]; } ));
	pages.push(
			pad("MOST SEDATE: The 10 least active", true) + 
			pad("Avatars.", true) + 
			blankline +
			makeLeaderboard(userRecords, HS$travel, "", "", function(u,n) { return -(u[n][HS$travel])/u[n][HS$lifetime]; } ));
	pages.push(
			pad("MOST TRAVELLED: The 10 Avatars alive", true) + 
			pad("today who have moved around the most.", true) +
			blankline +
			makeLeaderboard(userRecords, HS$travel, "", " regions"));
	pages.push(
			pad("ALL-TIME MOST TRAVELLED: The 10", true) + 
			pad("Avatars that traveled the world.", true) +
			blankline +
			makeLeaderboard(userRecords, HS$max_travel, "", " regions"));
	pages.push(
			pad("MOST ACTIVE TELEPORTER: The 10 Avatars", true) + 
			pad("alive today who have TelePorted most.", true) +
			blankline +
			makeLeaderboard(userRecords, HS$teleports, "", " ports"));
	return pages;
}



const processUserStats = async (users) => {
	var userRecords = {};
	users.forEach((user) => {
		var user = users[i];
		var name = user.name;
		if (user.mods.length === 0) {
			return;
		}
		var stats = user.mods[0].stats;
		if (undefined !== stats) {
			userRecords[name] = stats;
		}
	});
	var bookofrecords = {
		ref: "text-bookofrecords",
		pages: generateRecords(userRecords),
	}
	await File.writeFile(Argv.book, JSON.stringify(bookofrecords, null, 4));
}

const dbName = 'elko';

const generateBookOfRecords = async () => {
	const client = await MongoClient.connect("mongodb://" + Argv.mongo);
	let db = client.db(dbName);
	const users = await db.collection('odb').find({"ref": {$regex: "user-*"}});
	const usersArray = await users.toArray();
	if (undefined !== users) {
		await processUserStats(users);
	}
	await client.close();
}

(async function main() {
  await generateBookOfRecords();
}());