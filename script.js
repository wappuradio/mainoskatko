// Global state
let numLoading = undefined;

async function getBreaks() {
    const r = await fetch("http://localhost:8080/katkot/");
    const breaks = (await r.json()).map((o) => {
        return o['name']
    });
    return breaks;
}

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

async function getBreakContents(breakTime) {
    const r = await fetch(`http://localhost:8080/katkot/${breakTime}/`);
    const data = await r.json();
    return data;
}

function createTrack(breakTime, file) {
    const container = document.createElement('div');

    const label = document.createElement('span');
    label.innerText = file.name;
    container.appendChild(label);

    container.appendChild(document.createElement("br"));

    const audio = document.createElement('audio');
    audio.oncanplaythrough = (context) => {
        numLoading -= 1;

        if (numLoading === 0) {
            breakLoaded();
        }
    };
    audio.src = `http://localhost:8080/katkot/${breakTime}/${file.name}`;
    audio.title = file.name;
    audio.preload = "auto";
    audio.controls = true;
    audio.onended = trackFinished;
    container.appendChild(audio);

    container.appendChild(document.createElement("br"));

    document.getElementById("player").appendChild(container);
}

function formatTime(timeSeconds) {
    let wholeSeconds = Math.round(timeSeconds);
    const m = Math.floor(wholeSeconds / 60).toString();
    const s = (wholeSeconds % 60).toString();
    return `${m}:${s}`
}

function breakLoaded() {
    let totalDuration = 0;
    const tracks = document.getElementsByTagName("audio");
    for (const track of tracks) {
        totalDuration += track.duration;
    }
    document.getElementById('duration').innerText = formatTime(totalDuration);
    const playButton = document.getElementById('masterPlay');
    playButton.onclick = startPlaying;
    playButton.style.visibility = 'visible';
}

async function startPlaying() {
    const tracks = document.getElementsByTagName("audio");
    const firstTrack = tracks[0];
    await firstTrack.play();
}

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

async function trackFinished(event) {
    const finishedTitle = event.target.title;
    const nextTrack = findNext(finishedTitle);
    if (nextTrack) {
        await nextTrack.play();
    }
}

async function main() {
    const breaks = await getBreaks();
    const closest = getClosest(breaks);
    //const closest = "1900";

    document.getElementById("selectedBreak").innerText = closest;

    const breakContents = await getBreakContents(closest);
    numLoading = breakContents.length;
    for (const file of breakContents) {
        createTrack(closest, file);
    }
    //console.log(breakContents);
}

main().then();