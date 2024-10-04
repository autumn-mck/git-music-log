import { $ } from "bun";

const socket = new WebSocket("wss://music-display.mck.is/now-playing-ws");
let currentSong = {
	artist: "",
	title: "",
	album: "",
	albumArt: "",
	durationMs: 0,
	positionMs: 0,
	playState: 0,
	timestamp: 0,
};

type SongData = {
	artist: string;
	title: string;
	album: string;
	albumArt: string;
	durationMs: number;
	positionMs: number;
	playState: number;
	timestamp: number;
};

socket.onopen = () => {
	console.log("Connected to server");
};

socket.onmessage = async (event) => {
	const data = JSON.parse(event.data) as SongData;
	data.albumArt = ``; // not useful for this script, so just discard it

	// if song isn't playing or "stopped", don't update
	if (data.playState !== 0 && data.playState !== 3) return;

	// only update if song has changed or has looped
	const timePassed = data.timestamp - currentSong.timestamp;
	const timeHadLeft = currentSong.durationMs - currentSong.positionMs;
	const shouldUpdate =
		currentSong.title !== data.title ||
		(timePassed < timeHadLeft + 100 &&
			data.positionMs < 100 &&
			currentSong.playState === 0 &&
			data.playState === 0);

	currentSong = data;
	if (shouldUpdate) {
		await gitInitIfNotExists();
		await gitCommit(data);
		await gitPushIfOriginExists();
	}
};

async function gitInitIfNotExists() {
	const isInsideWorkTree = await $`git rev-parse --is-inside-work-tree`.nothrow().quiet().text();

	if (isInsideWorkTree.trim() !== "true") {
		await $`git init -b main`;
		await $`git add .`;
		await $`git commit -m "Initial commit"`;
	}
}

async function gitCommit(playingData: SongData) {
	let nowPlayingText = genNowPlayingText(playingData);

	const path = "now-playing.txt";
	Bun.write(path, nowPlayingText);

	const diff = await $`git diff --name-only`.quiet().text();
	if (diff.includes(path)) {
		await $`git add ${path}`;
		await $`git commit -m "${nowPlayingText}"`;
	}
}

function genNowPlayingText(playingData: SongData) {
	let nowPlayingText = `Now playing: ${playingData.title}`;
	if (playingData.album) nowPlayingText += ` (${playingData.album})`;
	if (playingData.artist) nowPlayingText += ` - ${playingData.artist}`;
	nowPlayingText += `\n\nAt: ${new Date(playingData.timestamp).toLocaleString()}
${JSON.stringify(playingData)}`;

	if (playingData.playState === 3) nowPlayingText = "Currently offline";
	return nowPlayingText;
}

async function gitPushIfOriginExists() {
	try {
		const remote = await $`git remote -v`.text();
		if (remote.includes("origin")) {
			await $`git push --set-upstream origin main`;
		}
	} catch (e) {
		// don't worry too much, it'll get pushed next time
		console.error(e);
	}
}
