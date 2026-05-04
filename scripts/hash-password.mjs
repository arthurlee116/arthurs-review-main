import crypto from "node:crypto";
import { promisify } from "node:util";
import readline from "node:readline/promises";

const scrypt = promisify(crypto.scrypt);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question("Admin password: ");
rl.close();

const salt = crypto.randomBytes(16);
const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
console.log(`scrypt$16384$8$1$${salt.toString("base64")}$${Buffer.from(derived).toString("base64")}`);
