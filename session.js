import fs from 'fs';
import path from 'path';
import axios from 'axios';

export async function SessionCode(session, fd) {
  try {
    if (!session) throw new Error("Invalid SESSION_ID format");
    const x = session.includes("~") ? session.split("~")[1] : session;
    const ctx = `https://pastebin.com/raw/${x}`;
    const res = await axios.get(ctx);
    if (!res.data) throw new Error("Session data missing");
    if (!fs.existsSync(fd)) fs.mkdirSync(fd, { recursive: true });
    const n = path.join(fd, "creds.json");
    const conn = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    fs.writeFileSync(n, conn);
    console.log("Session credentials written");
  } catch (error) {
    console.error("SessionCode error:", error?.message || error);
  }
}

