"use client";

export function LogoutButton() {
  async function signOut(): Promise<void> {
    await fetch("/api/demo-logout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <button
      aria-label="Sign out"
      onClick={() => {
        void signOut();
      }}
      title="Sign out"
      type="button"
    >
      Sign out
    </button>
  );
}
