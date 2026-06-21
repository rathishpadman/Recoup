import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { LoginForm } from "./login-form.tsx";

export default function LoginPage() {
  return (
    <main className="state-shell">
      <section className="state-panel" aria-labelledby="login-heading">
        <div className="state-mark" aria-hidden="true">
          <ShieldCheck size={22} weight="duotone" />
        </div>
        <p className="micro">Recoup</p>
        <h1 id="login-heading">Choose your recovery workspace</h1>
        <p>Sign in with a demo user ID to open the role-scoped cockpit surface for the reviewer persona.</p>
        <LoginForm />
      </section>
    </main>
  );
}
