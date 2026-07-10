export function EvidenceCollage() {
  return (
    <aside
      aria-label="Recoup product visual preview"
      className="relative overflow-hidden rounded-[18px] border border-border/70 bg-card p-2 shadow-sm"
      data-testid="recoup-landing-hero-visual-frame"
      style={{
        background:
          "radial-gradient(420px 240px at 82% 12%, var(--atmos-mint) 0%, transparent 72%), radial-gradient(360px 220px at 8% 96%, var(--atmos-sand) 0%, transparent 74%), var(--card)"
      }}
    >
      <img
        alt="Recoup agentic order-to-cash visual: evidence flows through governed approval"
        className="block aspect-[16/9] w-full rounded-[14px] object-cover"
        data-testid="recoup-landing-hero-visual"
        src="/recoup-agentic-hero-visual.png"
      />
    </aside>
  );
}
