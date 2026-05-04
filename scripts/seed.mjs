process.env.DATA_DIR ||= "./data";
process.env.SITE_URL ||= "http://localhost:3000";
process.env.ADMIN_PASSWORD_HASH ||= "scrypt$16384$8$1$c2FsdA==$aGFzaA==";
process.env.SESSION_SECRET ||= "0123456789abcdefghijklmnopqrstuvwxyzABCDEF";

const { seed } = await import("../src/lib/db/seed.ts");

seed();
console.log("Seeded Arthur's Review sample content.");
