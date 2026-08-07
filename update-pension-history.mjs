/**
 * pension_history.json 최신 회차 자동 갱신 (GitHub Actions / Node)
 * 사용: node update-pension-history.mjs
 * 소스: https://lottis.kr/pension/{회차} JSON-LD
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 스크립트와 pension_history.json 모두 저장소 루트에 있음
const ROOT = __dirname;
const HISTORY_PATH = path.join(ROOT, "pension_history.json");
const MAX_FETCH = 40;
const KEY_RX =
	/"value":"(\d)"\},\{"@type":"PropertyValue","name":"[^"]*","value":"(\d), (\d), (\d), (\d), (\d), (\d)"/;

function today() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

async function fetchText(url) {
	const res = await fetch(url, {
		cache: "no-store",
		headers: { "User-Agent": "Mozilla/5.0 LuckyLottoBot/1.0" }
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
	return res.text();
}

function parseRound(html) {
	const m = html.match(KEY_RX);
	if (!m) return null;
	return `${m[1]}-${m[2]}${m[3]}${m[4]}${m[5]}${m[6]}${m[7]}`;
}

async function detectLatest() {
	const html = await fetchText(`https://lottis.kr/pension?_=${Date.now()}`);
	const matches = [...html.matchAll(/\/pension\/(\d+)/g)].map((x) => Number(x[1]));
	const max = matches.length ? Math.max(...matches) : 0;
	if (!max) throw new Error("latest detect fail");
	return max;
}

async function main() {
	if (!fs.existsSync(HISTORY_PATH)) {
		throw new Error(`not found: ${HISTORY_PATH}`);
	}

	const history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
	const drawSet = new Set(history.draws || []);
	const fromNo = Number(history.latest) || 0;
	const latestNo = await detectLatest();

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
			const html = await fetchText(`https://lottis.kr/pension/${n}`);
			const key = parseRound(html);
			if (!key) {
				console.warn(`skip ${n}: parse fail`);
				continue;
			}
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
