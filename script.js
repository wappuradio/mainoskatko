/* TODO:
 - Switch play button to a stop when playing
 - Sort the tracks to ensure correct order
 */

// Store the number of tracks which have been added but have not yet loaded.
// - used to determine when the last track has loaded
let numLoading = undefined;

/**
 *  Loading breaks
 *  Expect a nginx server with JSON format autoindex enabled.
 *
 *  Structure:
 *  katkot/
 *    1400/
 *      001 - Alkujingle.mp3
 *      002 - Mainos - firmaA.flac
 *      003 - Loppujingle.mp3
 *    1500/
 *      001 - Alkujingle.mp3
 *      002 - Mainos - firmaB.flac
 *      003 - Loppujingle.mp3
 */
async function getBreaks() {
    const r = await fetch("/katkot/");
    return (await r.json()).map((o) => {
        return o['name']
    });
}

/**
 * Return the break with the time closest to current time. Does not
 * handle times around midnight, which is accepted since ad breaks are
 * limited to around office hours.
 */
function getClosest(breaks) {
    let closestBreak = undefined;
    let closestDistance = undefined;

    const now = new Date();
    breaks.forEach((breakTimeString) => {
        const h = parseInt(breakTimeString.substring(0, 2));
        const m = parseInt(breakTimeString.substring(2,4));

        // Construct a new date/time today, but with a HH:MM:00
        // timestamp from the given break time
        let breakTime = new Date();
        breakTime.setHours(h, m, 0);

        const distance = Math.abs(now - breakTime);

        if (!closestBreak || distance < closestDistance) {
            closestDistance = distance;
            closestBreak = breakTimeString;
        }
    })

    return closestBreak;
}

/**
 * Fetch metadata about files related to a specific break
 *
 * Expects a JSON array with objects that have a `name` property
 * which corresponds to the filename in the directory.
 */
async function getBreakContents(breakTime) {
    const r = await fetch(`/katkot/${breakTime}/`);
    const data = await r.json();
    return data.map((track) => {
        track['url'] = `/katkot/${breakTime}/${track.name}`;
        return track;
    })
}

/* Creating the DOM elements */

/**
 * Create a new <audio> tag which loads the give track. The file is set to
 * preload, and to trigger an event when loaded.
 */
function createTrack(track) {
    const container = document.createElement('div');

    const label = document.createElement('span');
    label.innerText = track.name;
    container.appendChild(label);

    container.appendChild(document.createElement("br"));

    const audio = document.createElement('audio');
    audio.oncanplaythrough = (context) => {
        numLoading -= 1;
        // The numLoading was initialized to the number of tracks. Decrement the number here
        // and if the counter reaches zero, we know that all tracks are loaded and we are ready for playback.
        if (numLoading === 0) {
            breakLoaded();
        }
    };
    audio.src = track.url;
    audio.title = track.name;
    audio.preload = "auto";
    audio.controls = true;

    audio.onended = trackFinished;
    audio.ontimeupdate = trackTimeUpdated;
    container.appendChild(audio);

    container.appendChild(document.createElement("br"));

    document.getElementById("player").appendChild(container);
}

/**
 * Event handler: Last track has loaded. Sum up the duration and update the UI.
 */
function breakLoaded() {
    const totalDuration = getSumDuration();
    document.getElementById('progress').innerText = formatTime(0);
    document.getElementById('duration').innerText = formatTime(totalDuration);
    document.getElementById('remaining').innerText = formatTime(totalDuration);
    const playButton = document.getElementById('masterPlay');
    playButton.onclick = startPlaying;
    playButton.style.visibility = 'visible';
}

/* Playback */

/**
 * Play button pressed. Start playback from the first track
 */
async function startPlaying() {
    const tracks = document.getElementsByTagName("audio");
    const firstTrack = tracks[0];
    await firstTrack.play();
}

/**
 * A track finished playing. Start the next track if such exists.
 */
async function trackFinished(event) {
    const finishedTitle = event.target.title;
    const nextTrack = findNext(finishedTitle);
    if (nextTrack) {
        await nextTrack.play();
    }
}

/**
 * Find the track which is supposed to play after the given track
 */
function findNext(title) {
    const tracks = document.getElementsByTagName("audio");
    let passed = false;
    for (const track of tracks) {
        if (passed) {
            return track;
        }
        if (track.title === title) {
            passed = true;
        }
    }
}

/* Visualization */

/**
 * Seconds to an MM:SS format
 */
function formatTime(timeSeconds) {
    let wholeSeconds = Math.round(timeSeconds);
    const m = Math.floor(wholeSeconds / 60).toString().padStart(2, '0');
    const s = (wholeSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`
}

/**
 * Sum up the durations of all the loaded tracks
 */
function getSumDuration() {
    const tracks = document.getElementsByTagName("audio");
    let totalDuration = 0;
    for (const track of tracks) {
        totalDuration += track.duration;
    }
    return totalDuration;
}

/**
 * Sum up the progress of all the loaded tracks
 */
function getSumProgress() {
    const tracks = document.getElementsByTagName("audio");
    let totalProgress = 0;
    for (const track of tracks) {
        totalProgress += track.currentTime;
    }
    return totalProgress;
}

/**
 * Event: The elapsed time on a track has been updated.
 */
async function trackTimeUpdated(event) {
    const totalDuration = getSumDuration();
    const totalProgress = getSumProgress();

    const remaining = totalDuration - totalProgress;
    document.getElementById('progress').innerText = formatTime(totalProgress);
    document.getElementById('remaining').innerText = formatTime(remaining);
}

/**
 * Check if the currently selected break is still relevant, or if a new one should be loaded
 */
function checkBreak(breaks, oldClosest) {
    if(getClosest(breaks) != oldClosest) {
        document.getElementById("oldBreak").style.visibility = "visible";
        const dialog = document.getElementById("refreshDialog");
        dialog.showModal();
    }
}

function main() {

    // List the break times
    getBreaks().then((breaks) => {
        const closest = getClosest(breaks);
        document.getElementById("selectedBreak").innerText = closest;

        breakCheckIntervalId = setInterval(() => {
            checkBreak(breaks, closest);
        }, 2*60*1000);

        // ... and get the tracks associated with the closest break
        return getBreakContents(closest);
    }).then((breakContents) => {
        // initialize the counter which is used to determine when all tracks are loaded
        numLoading = breakContents.length;

        // And create <audio> elements which actually load the tracks.
        for (const track of breakContents) {
            createTrack(track);
        }

        // breakLoaded() is called when all tracks are loaded via the oncanplaythrough event and numLoading counter.
    });
}

/*
 * Check if we arrived at the page via back/forward history. The contents might not be up to date,
 * so better reload the page to be sure we have up to date data.
 */
const perfEntries = performance.getEntriesByType("navigation");
if (perfEntries[0].type === "back_forward") {
    console.log("History traversal detected, reloading to refresh data");
    location.reload();
}

main();
