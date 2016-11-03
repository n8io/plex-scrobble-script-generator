const colors = require('colors');
const PlexApi = require(`plex-api`);
const fs = require(`fs`);
const cwd = require(`cwd`);

require('dotenv-safe').load({
  allowEmptyValues: false,
	silent: true
});

const APP_ID = process.env.APP_ID || '80fde5fb-c7a8-45cf-b0ed-8518e03bb2f7';
const LIBRARY_SECTION_FILE_PATH = cwd(process.env.LIBRARY_SECTION_FILE_PATH || 'library-sections.json');
const PLEX_IP = process.env.PLEX_IP;
const PLEX_TOKEN = process.env.PLEX_TOKEN;
const apiOptions = {
	hostname: PLEX_IP,
  token: PLEX_TOKEN,
  options: {
    identifier: APP_ID,
		product: `Auto-scrobble all the shit shows`,
		version: `v${process.env.npm_package_version}`
  }
};
const client = new PlexApi(apiOptions);

const config = require(LIBRARY_SECTION_FILE_PATH);
const OUTPUT_FILE = cwd(process.env.OUTPUT_FILE || `scrobble.sh`);
const promises = config.map(librarySection => {
	return new Promise((resolve, reject) => {
		console.log(`Pulling Plex library section: ${librarySection.title || librarySection.id}...`);
		client
			.query(`/library/sections/${librarySection.id}/all`)
			.then(result => resolve(result), err => reject(err))
			.catch(err => reject(err))
			;
	})
});

const writeSectionHeader = title => {
	return `# Library section: ${title}`;
};

const writeSectionBody = librarySectionObj => {
	const lines = [];
	let showId;
	librarySectionObj._children.forEach(o => {
		showId = o.key.split(`/`)[3];
		lines.push(`SHOWS+=(['${showId}']='${o.title.replace(/[']/, ``)}')`);
	});

	return lines.join('\n');
}

const writeHeader = (plexIp, plexToken) => {
  const lines = [];

	lines.push(`#!/bin/bash`)
	lines.push(`PLEX_IP='${plexIp}'`);
	lines.push(`PLEX_TOKEN='${plexToken}'`);
	lines.push(`SHOWS=()`);
	lines.push(``);

	return lines.join('\n');
};

const writeFooter = () => {
  const lines = [];

	lines.push('for SHOWID in ${!SHOWS[@]}; do');
	lines.push('  echo -n "Marking show ${SHOWS[${SHOWID}]} (${SHOWID}) as watched..."');
	lines.push('  curl --fail --silent --show-error -X OPTIONS -H "Cache-Control: no-cache" -H "X-Plex-Token: ${PLEX_TOKEN}" "http://${PLEX_IP}:32400/:/scrobble?key=${SHOWID}&identifier=com.plexapp.plugins.library" --connect-timeout 2');
	lines.push('  echo "done."');
	lines.push('done');

	return lines.join('\n');
};

const writeScriptToFile = (filePath, message) => fs.writeFileSync(filePath, message, 'utf-8');

const normalizeShowTitle = title => {
	let str = title;

	if (title.indexOf(`, The`) > -1) {
		str = `The ` + title.split(`, The`)[0];
	}

	if (title.indexOf(`, A`) > -1) {
		str = `A ` + title.split(`, A`)[0];
	}

	return str.toLowerCase().replace(/[ '"().!$,]/g, ``);
};

const printShows = librarySection => {
  if (!process.env.DEBUG) return;

  console.log(`\n  # Library section: ${librarySection.title1}\n`);
	const shows = [];

  librarySection._children.forEach(show => {
		shows.push({
			id: show.key.split(`/`)[3],
			title: show.title
		});
  });

	shows
		.sort((a, b) => {
			if (a.title < b.title) return -1;
			if (a.title > b.title) return 1;

			return 0;
		})
		.forEach(show => {
			console.log(`    ${show.title} (${show.id})`);
		});
};

const throwErr = err => {
	throw new Error(`Could not connect to server`);
};

Promise
	.all(promises)
	.then((results, err) => {
    if (err) {
      throw err;
    }

		console.log(`Building scrobble script...`);

		const header = writeHeader(PLEX_IP, PLEX_TOKEN);
		const body = results.map((librarySection, sectionIndex) => {
			const sectionHeader = writeSectionHeader(librarySection.title1);
			const showTitles = config[sectionIndex].shows.map(title => normalizeShowTitle(title));

			printShows(librarySection);

			librarySection._children = librarySection._children.filter(s => showTitles.indexOf(normalizeShowTitle(s.title)) > -1);

			const sectionBody = writeSectionBody(librarySection);

			return `${sectionHeader}\n${sectionBody}\n`;
		}).join('\n');
		const footer = writeFooter();
		const output = `${header}\n${body}\n${footer}\n`;

		writeScriptToFile(OUTPUT_FILE, output);

		console.log(`\nSuccess! See ${OUTPUT_FILE} for details.`.green);
	})
	.catch(err => {
		throw err;
	})
	;
