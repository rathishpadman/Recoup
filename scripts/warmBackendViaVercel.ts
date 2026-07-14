const warmBackendUrl = process.env.RECOUP_WARM_BACKEND_URL?.trim();
const warmBackendSecret = process.env.RECOUP_WARM_BACKEND_SECRET?.trim();

if (warmBackendUrl === undefined || warmBackendUrl.length === 0) {
  console.error("RECOUP_WARM_BACKEND_URL is required.");
  process.exit(1);
}
if (warmBackendSecret === undefined || warmBackendSecret.length === 0) {
  console.error("RECOUP_WARM_BACKEND_SECRET is required.");
  process.exit(1);
}

const response = await fetch(warmBackendUrl, {
  cache: "no-store",
  headers: {
    authorization: `Bearer ${warmBackendSecret}`
  },
  method: "GET"
});
const body = await response.text();
console.log(`warm-backend status=${response.status.toString()}`);
if (body.length > 0) {
  console.log(body);
}
if (!response.ok) {
  process.exit(1);
}
