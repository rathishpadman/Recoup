export async function refreshDavidCreditReadModel(): Promise<boolean> {
  try {
    const response = await fetch("/api/credit", {
      cache: "no-store",
      method: "POST"
    });

    return response.ok;
  } catch {
    return false;
  }
}
