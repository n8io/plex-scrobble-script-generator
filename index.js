const OUTPUT_FILE = `scrobble.sh`;
const PLEX_IP = `192.168.0.29`;

const plex = require(`plex-api`);
const client = new plex(PLEX_IP);
const fs = require(`fs`);
const cwd = require(`cwd`);
const outFile = cwd(OUTPUT_FILE);
const config = require(cwd(`scrobble.json`));
const adultShitShows = config.adult.map(show => normalizeShowTitle(show));
const kidShows = config.kids.map(show => normalizeShowTitle(show));
const lines = [];
const promises = [];
const adultShowsPromise = new Promise((resolve, reject) => {
	client
		.query(`/library/sections/5/all`)
		.then(result => resolve(result))
		.catch(err => reject(err))
		;
});
const kidsShowPromise = new Promise((resolve, reject) => {
	client
		.query(`/library/sections/4/all`)
		.then(result => resolve(result))
		.catch(err => reject(err))
		;
});

promises.push(adultShowsPromise);
promises.push(kidsShowPromise);

Promise
	.all(promises)
	.then(results => {
		const aShowsObj = results[0];
		const kShowsObj = results[1];

		aShowsObj._children = aShowsObj._children.filter(s => adultShitShows.indexOf(normalizeShowTitle(s.title)) > -1);
		kShowsObj._children = kShowsObj._children.filter(s => kidShows.indexOf(normalizeShowTitle(s.title)) > -1);

		lines.push(`#!/bin/bash`)
		lines.push(`PLEX_IP='${PLEX_IP}'`);
		lines.push(`SHOWS=()`);
		lines.push(``);
		lines.push(`# Adult Shit Shows`);
		writeOut(aShowsObj);
		lines.push(``);
		lines.push(`# Kids Shows`);
		writeOut(kShowsObj);
		lines.push(``);
		writeFooter();

		fs.writeFileSync(outFile, lines.join(`\n`), 'utf-8');
	})
	.catch(err => throwErr)
	;

function writeOut(obj) {
	let showId;
	obj._children.forEach(o => {
		showId = o.key.split(`/`)[3];
		lines.push(`SHOWS+=(['${showId}']='${o.title.replace(/[']/, ``)}')`);
	});
}

function writeFooter() {
	lines.push('for SHOWID in ${!SHOWS[@]}; do');
	lines.push('  echo -n "Marking show ${SHOWS[${SHOWID}]} (${SHOWID}) as watched..."');
	lines.push('  curl -X OPTIONS -H "Cache-Control: no-cache" "http://${PLEX_IP}:32400/:/scrobble?key=${SHOWID}&identifier=com.plexapp.plugins.library" --connect-timeout 2 > /dev/null 2>&1');
	lines.push('  echo "done."');
	lines.push('done');
}

function normalizeShowTitle(title) {
	let str = title;

	if (title.indexOf(`, The`) > -1) {
		str = `The ` + title.split(`, The`)[0];
	}

	if (title.indexOf(`, A`) > -1) {
		str = `A ` + title.split(`, A`)[0];
	}

	return str.toLowerCase().replace(/[ '"().!$,]/g, ``);
}

function throwErr(err) {
	throw new Error(`Could not connect to server`);
}
