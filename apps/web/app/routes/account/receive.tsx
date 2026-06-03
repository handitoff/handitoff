import { useState } from "react";
import { Link } from "react-router";
import { Check, Pencil, X } from "lucide-react";
import { useAccount } from "../../components/account/context";
import {
  CopyField,
  EmptyState,
  OnlineDot,
  Panel,
  PanelLabel,
  SectionHeading,
  Switch,
  ToggleRow,
} from "../../components/account/ui";
import { Button } from "../../components/ui/button";
import {
  formatBytes,
  formatRelativeTime,
  isValidHandle,
  normalizeHandleInput,
  PLAN_ENTITLEMENTS,
  receiveLinkFor,
  updateAccountProfile,
  type ReceiveRequest,
} from "../../lib/account";

export default function AccountReceive() {
  const { user } = useAccount();
  const available = PLAN_ENTITLEMENTS[user.plan].receiveLink;

  return (
    <div className="flex flex-col gap-12">
      <SectionHeading
        eyebrow="Receive"
        title="Your receive link"
        description="Give people one link to send files to you — handitoff.io/to/yourname. They send from their browser, you approve, files move. No account needed on their end."
      />
      {available ? <ReceiveActive /> : <ReceiveLocked />}
    </div>
  );
}

// ── Active (Pro) ─────────────────────────────────────────────────────────────

function ReceiveActive() {
  const { receive, setReceive, requests, setRequests, liveReceive } = useAccount();
  const online = receive.receiveMode && receive.online;

  const respond = (id: string) => setRequests((prev) => prev.filter((r) => r.id !== id));

  return (
    <>
      {/* Link + receive mode */}
      <Panel className="flex flex-col gap-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <PanelLabel>Receive mode</PanelLabel>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-base tracking-tight text-zinc-50 lowercase md:text-lg">
                {receive.receiveMode ? "Accepting files" : "Not accepting files"}
              </span>
              <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                <OnlineDot online={online} />
                {online ? "Online" : receive.receiveMode ? "Tab closed" : "Off"}
              </span>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-zinc-400">
              {receive.receiveMode
                ? "People with your link can request to send files while this tab is open."
                : "Your receive link is not accepting files right now."}
            </p>
          </div>
          <Switch
            checked={receive.receiveMode}
            onChange={(next) => setReceive((prev) => ({ ...prev, receiveMode: next }))}
            label="Receive mode"
          />
        </div>

        <HandleEditor />
      </Panel>

      {/* Sender requirements */}
      <section className="flex flex-col gap-5">
        <SectionHeading
          title="Sender requirements"
          description="Decide what people give you before they can send."
        />
        <Panel className="flex flex-col divide-y divide-zinc-800 py-1">
          <ToggleRow
            title="Require sender name"
            description="Senders identify themselves before requesting."
            checked={receive.requireSenderName}
            onChange={(next) => setReceive((prev) => ({ ...prev, requireSenderName: next }))}
          />
          <ToggleRow
            title="Allow sender message"
            description="Let senders add a short note with their request."
            checked={receive.allowSenderMessage}
            onChange={(next) =>
              setReceive((prev) => ({
                ...prev,
                allowSenderMessage: next,
                requireSenderMessage: next ? prev.requireSenderMessage : false,
              }))
            }
          />
          <ToggleRow
            title="Require sender message"
            description="A note is mandatory before a request can be sent."
            checked={receive.requireSenderMessage}
            disabled={!receive.allowSenderMessage}
            onChange={(next) => setReceive((prev) => ({ ...prev, requireSenderMessage: next }))}
          />
        </Panel>
      </section>

      {/* Incoming requests */}
      <section className="flex flex-col gap-5">
        <SectionHeading
          title="Incoming requests"
          description="Approve a sender once and they can send files for that session. There's no file-by-file approval after that."
        />
        {receive.receiveMode ? (
          requests.length > 0 ? (
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800">
              {requests.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  onRespond={() => respond(request.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No requests waiting"
              description="When someone opens your link and asks to send, they'll appear here for approval."
            />
          )
        ) : (
          <EmptyState
            title="Receive mode is off"
            description="Turn on receive mode to start accepting requests through your link."
            action={
              <Button
                size="sm"
                onClick={() => setReceive((prev) => ({ ...prev, receiveMode: true }))}
              >
                Turn on receive mode
              </Button>
            }
          />
        )}
      </section>

      {/* Active receive sessions */}
      <section className="flex flex-col gap-5">
        <SectionHeading
          title="Active receive sessions"
          description="Senders you've accepted who are connected right now."
        />
        {liveReceive.length > 0 ? (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800">
            {liveReceive.map((session) => (
              <div
                key={session.id}
                className="flex flex-col gap-3 bg-zinc-950 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2 w-2 rounded-full bg-emerald-400"
                      style={{ animation: "ht-pulse-dot 1.6s ease-out infinite" }}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium text-zinc-100">{session.senderName}</span>
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                    {session.fileCount} files · {formatBytes(session.totalSize)} ·{" "}
                    {formatRelativeTime(session.startedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm">
                    Open
                  </Button>
                  <Button variant="ghost" size="sm">
                    End
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No active senders"
            description="Accepted senders show up here while they're connected."
          />
        )}
      </section>

      <ReceiveNote />
    </>
  );
}

function HandleEditor() {
  const { user, setUser } = useAccount();
  const [handle, setHandle] = useState(user.handle ?? "");
  const [draft, setDraft] = useState(handle);
  const [editing, setEditing] = useState(handle === "");
  const [confirmingChange, setConfirmingChange] = useState(false);
  const [error, setError] = useState<string>();

  const normalized = normalizeHandleInput(draft);
  const draftValid = isValidHandle(normalized);
  const unchanged = normalized === handle;
  // Editing an existing handle into a new one — this releases the old link.
  const isChange = handle !== "" && !unchanged;

  const persist = (next: string) => {
    void updateAccountProfile({ handle: next })
      .then((data) => {
        setUser(data.user);
        setHandle(next);
        setDraft(next);
        setEditing(false);
        setConfirmingChange(false);
        setError(undefined);
      })
      .catch(() =>
        setError("Could not save that handle. It may already be taken — try another."),
      );
  };

  const handleSave = () => {
    if (!draftValid || unchanged) return;
    // Claiming a fresh handle is immediate; changing one needs confirmation
    // because the old link is released right away with no redirect.
    if (isChange) {
      setConfirmingChange(true);
      return;
    }
    persist(normalized);
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-3 border-t border-zinc-800 pt-6">
        <PanelLabel>{handle === "" ? "Claim your handle" : "Change your handle"}</PanelLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex h-9 flex-1 items-center rounded-lg border border-zinc-800 bg-zinc-950 px-3">
            <span className="font-mono text-sm text-zinc-500">handitoff.io/to/</span>
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value.toLowerCase());
                setConfirmingChange(false);
                setError(undefined);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="yourname"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent font-mono text-sm text-zinc-50 outline-none placeholder:text-zinc-600"
              aria-label="Receive handle"
            />
          </div>
          {!confirmingChange && (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={!draftValid || unchanged}>
                <Check className="h-4 w-4" />
                {handle === "" ? "Claim" : "Save"}
              </Button>
              {handle !== "" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(handle);
                    setEditing(false);
                    setError(undefined);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Use 3-32 lowercase letters, numbers, or hyphens. Start and end with a letter or number.
        </p>
        {confirmingChange && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-900/60 bg-amber-950/30 p-3.5">
            <p className="text-[13px] leading-relaxed text-amber-200">
              Changing your handle releases{" "}
              <span className="font-mono text-amber-100">{receiveLinkFor(handle)}</span> immediately.
              That link stops working right away — there's no redirect to{" "}
              <span className="font-mono text-amber-100">{receiveLinkFor(normalized)}</span>.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" size="sm" onClick={() => persist(normalized)}>
                Release &amp; change
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmingChange(false)}>
                Keep current handle
              </Button>
            </div>
          </div>
        )}
        {error !== undefined && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-zinc-800 pt-6">
      <div className="flex items-center justify-between gap-3">
        <PanelLabel>Your link</PanelLabel>
        <button
          type="button"
          onClick={() => {
            setDraft(handle);
            setEditing(true);
            setConfirmingChange(false);
            setError(undefined);
          }}
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400 transition-colors hover:text-zinc-50"
        >
          <Pencil className="h-3 w-3" />
          Change
        </button>
      </div>
      <CopyField prefix="handitoff.io/to/" value={handle} copyValue={receiveLinkFor(handle)} />
    </div>
  );
}

function RequestCard({ request, onRespond }: { request: ReceiveRequest; onRespond: () => void }) {
  const meta: string[] = [];
  if (request.fileCount !== undefined) meta.push(`${request.fileCount} files`);
  if (request.totalSize !== undefined) meta.push(formatBytes(request.totalSize));

  return (
    <div className="flex flex-col gap-4 bg-zinc-950 p-5 md:flex-row md:items-start md:justify-between md:gap-6">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-medium text-zinc-100">
            {request.senderName ?? "Anonymous sender"}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            {formatRelativeTime(request.requestedAt)}
          </span>
        </div>
        {request.message !== undefined && (
          <p className="max-w-lg text-sm leading-relaxed text-zinc-400">“{request.message}”</p>
        )}
        {meta.length > 0 && (
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            {meta.join("  ·  ")}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" onClick={onRespond}>
          <Check className="h-4 w-4" />
          Accept
        </Button>
        <Button variant="secondary" size="sm" onClick={onRespond}>
          <X className="h-4 w-4" />
          Reject
        </Button>
      </div>
    </div>
  );
}

function ReceiveNote() {
  return (
    <p className="flex items-start gap-3 text-sm leading-relaxed text-zinc-400">
      <span
        className="mt-0.5 shrink-0 rounded-full border border-zinc-700 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400"
        aria-hidden="true"
      >
        Note
      </span>
      <span>
        Receive links are live sessions, not a cloud inbox. People can send while you're online and
        receive mode is on. There's no offline storage — yet.
      </span>
    </p>
  );
}

// ── Locked (not Pro) ─────────────────────────────────────────────────────────

function ReceiveLocked() {
  const { user } = useAccount();

  return (
    <>
      {/* Claiming or changing a handle is allowed on any plan — turning the link
          on to actually receive files is what needs Pro. */}
      <Panel className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <PanelLabel>Your handle</PanelLabel>
          <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
            Reserve your personal link name now, or change it anytime. Turning the link on to
            actually receive files is part of Pro.
          </p>
        </div>
        <HandleEditor />
      </Panel>

      <Panel className="flex flex-col gap-7 border-zinc-700 bg-zinc-900 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-4">
          <span className="w-fit rounded-full border border-zinc-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
            handitoff Pro
          </span>
          <h3 className="max-w-md font-display text-lg leading-tight tracking-tight text-zinc-50 lowercase md:text-xl">
            Receive links are part of Pro.
          </h3>
          <p className="max-w-md text-sm leading-relaxed text-zinc-400">
            {user.handle !== undefined
              ? `Your handle handitoff.io/to/${user.handle} is reserved. Upgrade to turn the link on and start receiving files.`
              : "Upgrade to claim your personal link and let clients send files from their browser — no account on their end."}
          </p>
          <Button asChild size="sm" className="w-fit">
            <Link to="/account/plan">See plans</Link>
          </Button>
        </div>

        {/* Preview of the live link object. */}
        <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          </div>
          <div className="mt-5 font-mono text-sm text-zinc-100">
            <span className="text-zinc-500">handitoff.io/to/</span>
            {user.handle ?? "yourname"}
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
            <OnlineDot online={false} />
            Receive mode off
          </div>
        </div>
      </Panel>
    </>
  );
}
