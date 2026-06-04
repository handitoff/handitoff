import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { OnlineDot } from "../../components/account/ui";
import { Button } from "../../components/ui/button";
import {
  getAccountData,
  isValidHandle,
  normalizeHandleInput,
  updateAccountProfile,
  type AccountUser,
} from "../../lib/account";
import { getDeviceRegistration, registerDevice } from "../../lib/devices";
import { seoMeta } from "../../lib/seo";

export function meta() {
  return seoMeta({
    title: "Welcome to handitoff",
    description: "Set up your handitoff account.",
    path: "/account/welcome",
    noIndex: true,
  });
}

// First login (spec §12): claim handle → name this device → land on Receive.
export default function AccountWelcome() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AccountUser | undefined>();
  const [step, setStep] = useState(0);
  const [handle, setHandle] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getAccountData({ signal: controller.signal })
      .then((data) => {
        setUser(data.user);
        setHandle(data.user.handle ?? "");
        // Pre-fill with the device's inferred name; the user can refine it.
        setDeviceName(data.user.defaultDeviceName ?? getDeviceRegistration().label);
      })
      .catch(() => navigate("/account"));
    return () => controller.abort();
  }, [navigate]);

  const finish = () => {
    setSaving(true);
    const trimmedDeviceName = deviceName.trim();
    Promise.all([
      updateAccountProfile({ handle: handle.trim() === "" ? null : normalizeHandleInput(handle) }),
      // Apply the chosen name to this device, not an account-wide default.
      trimmedDeviceName === ""
        ? Promise.resolve()
        : registerDevice(getDeviceRegistration(trimmedDeviceName)),
    ])
      .then(() => navigate("/account/receive"))
      .catch(() => setSaving(false));
  };

  const steps = [
    { n: "01", label: "Claim handle" },
    { n: "02", label: "Name device" },
    { n: "03", label: "Receive" },
  ];

  const handleValid = isValidHandle(handle);
  const deviceValid = deviceName.trim().length >= 1;

  if (user === undefined) {
    return (
      <AppShell>
        <main className="flex flex-1 items-center justify-center px-6 py-24 text-sm text-zinc-500">
          Loading account...
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl }}>
      <main className="flex flex-1 items-center justify-center px-6 py-16 md:py-24">
        <div className="flex w-full max-w-lg flex-col gap-10">
          {/* Step indicator */}
          <ol className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em]">
            {steps.map((s, i) => (
              <li key={s.n} className="flex items-center gap-3">
                <span className={i <= step ? "text-zinc-50" : "text-zinc-600"}>
                  {s.n} {s.label}
                </span>
                {i < steps.length - 1 && (
                  <span className="text-zinc-700" aria-hidden="true">
                    ·
                  </span>
                )}
              </li>
            ))}
          </ol>

          {step === 0 && (
            <Step
              eyebrow="Welcome to handitoff"
              title="Claim your receive link"
              description="Pick a handle. This becomes your personal link people can use to send files to you."
            >
              <div className="flex h-11 items-center rounded-lg border border-zinc-800 bg-zinc-950 px-3.5">
                <span className="font-mono text-sm text-zinc-500">handitoff.io/to/</span>
                <input
                  value={handle}
                  autoFocus
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleValid && setStep(1)}
                  placeholder="username"
                  autoCapitalize="off"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm text-zinc-50 outline-none placeholder:text-zinc-600"
                  aria-label="Receive handle"
                />
              </div>
              <p className="text-xs text-zinc-500">
                Use 3-32 lowercase letters, numbers, or hyphens. Start and end with a letter or
                number.
              </p>
              <StepFooter onSkip={finish}>
                <Button size="sm" onClick={() => setStep(1)} disabled={!handleValid}>
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </StepFooter>
            </Step>
          )}

          {step === 1 && (
            <Step
              eyebrow="Almost there"
              title="Name this device"
              description="This is how it'll appear when you start handoffs between your signed-in devices. When you sign in on another device, you can hand files between them without scanning a QR."
            >
              <input
                value={deviceName}
                autoFocus
                onChange={(e) => setDeviceName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && deviceValid && setStep(2)}
                placeholder="Tiago's laptop"
                className="flex h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 text-sm text-zinc-50 outline-none placeholder:text-zinc-600 focus-visible:border-zinc-500"
                aria-label="Device name"
              />
              <StepFooter onBack={() => setStep(0)} onSkip={finish}>
                <Button size="sm" onClick={() => setStep(2)} disabled={!deviceValid}>
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </StepFooter>
            </Step>
          )}

          {step === 2 && (
            <Step
              eyebrow="You're set"
              title="Your link is ready"
              description="Turn on receive mode whenever you want to accept files. We'll take you there now."
            >
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
                <div className="font-mono text-sm text-zinc-100">
                  <span className="text-zinc-500">handitoff.io/to/</span>
                  {handle || "yourname"}
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
                  <OnlineDot online={false} />
                  Receive mode off — turn it on when you're ready
                </div>
              </div>
              <StepFooter onBack={() => setStep(1)}>
                <Button size="sm" onClick={finish} disabled={saving}>
                  Go to Receive
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </StepFooter>
            </Step>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function Step({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">{eyebrow}</p>
      <h1 className="font-display text-2xl leading-[1.02] tracking-tight text-zinc-50 lowercase md:text-3xl">
        {title}
      </h1>
      <p className="text-sm leading-relaxed text-zinc-400">{description}</p>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function StepFooter({
  children,
  onBack,
  onSkip,
}: {
  children: React.ReactNode;
  onBack?: () => void;
  onSkip?: () => void;
}) {
  return (
    <div className="mt-4 flex items-center gap-4">
      {children}
      {onBack !== undefined && (
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      )}
      {onSkip !== undefined && (
        <button
          type="button"
          onClick={onSkip}
          className="ml-auto font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-zinc-200"
        >
          Skip for now
        </button>
      )}
    </div>
  );
}
