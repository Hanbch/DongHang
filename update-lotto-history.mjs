/**
 * lotto_history.json 최신 회차 자동 갱신 스크립트 (GitHub Actions / Node)
 * 사용: node update-lotto-history.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const HISTORY_PATH = path.join(ROOT, "lotto_history.json");
const BASE = "https://smok95.github.io/lotto/results";
const MAX_FETCH = 60;

function keyOf(nums) {
	return nums.map(Number).sort((a, b) => a - b).join("-");
}

async function fetchJson(url) {
	const res = await fetch(url, { cache: "no-store" });
	if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
	return res.json();
}

function today() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

async function main() {
	if (!fs.existsSync(HISTORY_PATH)) {
		throw new Error(`not found: ${HISTORY_PATH}`);
	}

	const history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
	const drawSet = new Set(history.draws || []);
	let fromNo = Number(history.latest) || 0;

	const latest = await fetchJson(`${BASE}/latest.json?_=${Date.now()}`);
	const latestNo = Number(latest.draw_no) || 0;
	if (!latestNo) throw new Error("latest parse fail");

	console.log(`local latest=${fromNo}, remote latest=${latestNo}, draws=${drawSet.size}`);

	if (latestNo <= fromNo) {
		console.log("already up to date");
		return;
	}

	let start = fromNo + 1;
	if (latestNo - fromNo > MAX_FETCH) {
		start = latestNo - MAX_FETCH + 1;
		console.warn(`gap too large, fetching from ${start}`);
	}

	let added = 0;
	for (let n = start; n <= latestNo; n++) {
		try {
			const row = await fetchJson(`${BASE}/${n}.json`);
			if (!row || !row.numbers) continue;
			const key = keyOf(row.numbers);
			if (!drawSet.has(key)) {
				drawSet.add(key);
				added++;
				console.log(`+ ${n}: ${key}`);
			}
		} catch (err) {
			console.warn(`skip ${n}:`, err.message);
		}
	}

	history.latest = latestNo;
	history.count = drawSet.size;
	history.updated = today();
	history.draws = Array.from(drawSet);

	fs.writeFileSync(HISTORY_PATH, JSON.stringify(history), "utf8");
	console.log(`saved: latest=${history.latest}, count=${history.count}, added=${added}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
