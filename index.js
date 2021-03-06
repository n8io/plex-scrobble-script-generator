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
  });
});

const writeBashLine = () => `#!/bin/bash`;
const writePidCheck = () => fs.readFileSync('./pid-check.sh', 'utf-8');
const writePidFooter = () => `rm $PIDFILE`;

const writeSectionHeader = title => `# Library section: ${title}`;

const writeHeader = () => `${writeBashLine()}\n\n${writePidCheck()}`;

const writeSectionBody = librarySectionObj => {
  const lines = [];
  let showId;

  librarySectionObj.Metadata.forEach(o => {
    showId = o.key.split(`/`)[3];
    lines.push(`SHOWS+=(['${showId}']='${o.title.replace(/[']/, ``)}')`);
  });

  return lines.join('\n');
}

const writeInit = (plexIp, plexToken) => {
  const lines = [];

  lines.push(`PLEX_IP='${plexIp}'`);
  lines.push(`PLEX_TOKEN='${plexToken}'`);
  lines.push(`SHOWS=()`);
  lines.push(``);

  return lines.join('\n');
};

const writeBody = results => {
  const init = writeInit(PLEX_IP, PLEX_TOKEN);
  const body = results.map((librarySection, sectionIndex) => {
    const sectionHeader = writeSectionHeader(librarySection.MediaContainer.title1);
    const showTitles = config[sectionIndex].shows.map(title => normalizeShowTitle(title));

    printShows(librarySection.MediaContainer);

    librarySection.MediaContainer.Metadata = librarySection.MediaContainer.Metadata.filter(s => showTitles.indexOf(normalizeShowTitle(s.title)) > -1);

    const sectionBody = writeSectionBody(librarySection.MediaContainer);

    return `${sectionHeader}\n${sectionBody}\n`;
  }).join('\n');

  return `${init}\n${body}`;
}

const writeFooter = () => {
  const lines = [];

  lines.push('for SHOWID in ${!SHOWS[@]}; do');
  lines.push('  echo -n "Marking show ${SHOWS[${SHOWID}]} (${SHOWID}) as watched..."');
  lines.push('  curl --fail --silent --show-error -X OPTIONS -H "Cache-Control: no-cache" -H "X-Plex-Token: ${PLEX_TOKEN}" "http://${PLEX_IP}:32400/:/scrobble?key=${SHOWID}&identifier=com.plexapp.plugins.library" --connect-timeout 2');
  lines.push('  echo "done."');
  lines.push('done');
  lines.push('');
  lines.push(writePidFooter());

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

const getProperSortTitle = title => {
  const tt = (title || '');
  const startsWithArticle = tt.toLowerCase().startsWith('the ');

  if (startsWithArticle) {
    return `${tt.substring(4)}, The`;
  }

  return tt;
};

const printShows = librarySection => {
  if (!process.env.DEBUG) return;

  console.log(`\n  # Library section: ${librarySection.title1}\n`);
  const shows = [];

  librarySection.Metadata.forEach(show => {
    shows.push({
      id: show.key.split(`/`)[3],
      title: show.title,
      sortTitle: getProperSortTitle(show.title)
      });
    });

    shows
      .sort((a, b) => {
        const sortA = a.sortTitle;
        const sortB = b.sortTitle;

        if (sortA < sortB) return -1;
        if (sortA > sortB) return 1;

        return 0;
      })
      .forEach(show => {
        console.log(`    ${show.sortTitle} (${show.id})`);
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

    const header = writeHeader();
    const body = writeBody(results);
    const footer = writeFooter();
    const output = `${header}\n${body}\n${footer}\n`;

    writeScriptToFile(OUTPUT_FILE, output);

    console.log(`\nSuccess! See ${OUTPUT_FILE} for details.`.green);
  })
  .catch(err => {
    throw err;
  })
  ;
