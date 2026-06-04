import { useState } from "react";
import { Link } from "react-router";
import { useAccount } from "../../components/account/context";
import { MaskedEmail, Panel, PanelLabel, SectionHeading } from "../../components/account/ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import type { OAuthProvider } from "../../lib/account";
import { signOut, updateAccountProfile } from "../../lib/account";

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: "Google",
  github: "GitHub",
  apple: "Apple",
};

export default function AccountSettings() {
  const { user } = useAccount();
  const [name, setName] = useState(user.name);
  const [saved, setSaved] = useState(false);

  const dirty = name !== user.name;

  const save = () => {
    updateAccountProfile({ name })
      .then(() => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1800);
      })
      .catch(() => undefined);
  };

  return (
    <div className="flex flex-col gap-12">
      <SectionHeading
        eyebrow="Settings"
        title="Account settings"
        description="Your profile and connected sign-in."
      />

      {/* Profile */}
      <section className="flex flex-col gap-5">
        <SectionHeading title="Profile" />
        <Panel className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Profile name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <div className="flex h-11 w-full items-center rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm">
              <MaskedEmail
                id="email"
                email={user.email}
                className="min-w-0 flex-1 truncate text-zinc-200"
              />
            </div>
            <p className="text-xs text-zinc-500">
              From your {PROVIDER_LABEL[user.provider]} account. Click to reveal.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" onClick={save} disabled={!dirty}>
              Save changes
            </Button>
            {saved && (
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-300">
                Saved
              </span>
            )}
          </div>
        </Panel>
      </section>

      {/* Connected account */}
      <section className="flex flex-col gap-5">
        <SectionHeading title="Sign-in" />
        <Panel className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <PanelLabel>Connected with</PanelLabel>
            <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-100">
              <span>{PROVIDER_LABEL[user.provider]} ·</span>
              <MaskedEmail email={user.email} className="min-w-0 truncate text-zinc-100" />
            </div>
          </div>
          <Button asChild variant="secondary" size="sm">
            <button
              type="button"
              onClick={() => {
                void signOut().finally(() => window.location.assign("/"));
              }}
            >
              Sign out
            </button>
          </Button>
        </Panel>
      </section>

      {/* Account data */}
      <section className="flex flex-col gap-5">
        <SectionHeading title="Your data" />
        <Panel className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-zinc-400">
            handitoff doesn't store your files. Transfers happen directly between devices and aren't
            kept on our servers. Your account holds your profile, handle, and session metadata only.
          </p>
          <Link
            to="/privacy"
            className="w-fit font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400 underline underline-offset-4 transition-colors hover:text-zinc-50"
          >
            Read the privacy policy
          </Link>
        </Panel>
      </section>

      {/* Danger zone */}
      <section className="flex flex-col gap-5">
        <SectionHeading title="Delete account" />
        <div className="flex flex-col gap-5 rounded-2xl border border-red-900/50 bg-red-950/15 p-6 md:flex-row md:items-center md:justify-between md:p-7">
          <p className="max-w-lg text-sm leading-relaxed text-zinc-400">
            Permanently delete your account, your handle, and all session metadata. This can't be
            undone.
          </p>
          <DeleteAccountDialog />
        </div>
      </section>
    </div>
  );
}

function DeleteAccountDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="shrink-0">
          Delete account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently removes your account, releases your handle, and deletes your session
            metadata. This action can't be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive">Delete account</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
