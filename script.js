/* TODO:
 - Reload if navigating via history to ensure up to date playlist/tracks
 - Switch play button to a stop when playing
 - Sort the tracks to ensure correct order
 */

// Global state
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
    const r = await fetch("http://localhost:8080/katkot/");
    return (await r.json()).map((o) => {
        return o['name']
    });
}

/**
 * Return the break with the time closest to current clock. Does not
 * handle times around midnight
 */
function getClosest(breaks) {
    let closestBreak = undefined;
    let closestDistance = undefined;

    const now = new Date();
    breaks.forEach((breakTimeString) => {
        const h = parseInt(breakTimeString.substring(0, 2));
        const m = parseInt(breakTimeString.substring(2,4));
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
 */
async function getBreakContents(breakTime) {
    const r = await fetch(`http://localhost:8080/katkot/${breakTime}/`);
    const data = await r.json();
    return data.map((track) => {
        track['url'] = `http://localhost:8080/katkot/${breakTime}/${track.name}`;
        return track;
    })
}

/* Creating the DOM elements */

function createTrack(track) {
    const container = document.createElement('div');

    const label = document.createElement('span');
    label.innerText = track.name;
    container.appendChild(label);

    container.appendChild(document.createElement("br"));

    const audio = document.createElement('audio');
    audio.oncanplaythrough = (context) => {
        numLoading -= 1;

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
 * Seconds to a MM:SS format
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

function main() {
    getBreaks().then((breaks) => {
        const closest = getClosest(breaks);
        //const closest = "1900";

        document.getElementById("selectedBreak").innerText = closest;
        return getBreakContents(closest);
    }).then((breakContents) => {
        numLoading = breakContents.length;
        for (const track of breakContents) {
            createTrack(track);
        }
    });
}

main();