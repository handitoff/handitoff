import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useDevices } from "../../components/account/devices-context";
import { EmptyState, Panel, SectionHeading } from "../../components/account/ui";
import { Button } from "../../components/ui/button";
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
import { formatRelativeTime } from "../../lib/account";
import { devicePlatformLabel, type AccountDevice } from "../../lib/devices";
import { cn } from "../../lib/utils";

export default function AccountDevices() {
  const { devices, online } = useDevices();

  // This device first, then online devices, then by most-recently-seen.
  const sorted = [...devices].sort((a, b) => {
    if (a.thisDevice !== b.thisDevice) return a.thisDevice ? -1 : 1;
    if (a.online !== b.online) return a.online ? -1 : 1;
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
  });

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Devices"
        title="Your devices"
        description="Devices signed into your account. When two are online, start a handoff between them without scanning a QR — the other device just approves it."
      />

      {!online ? (
        <Panel className="flex items-center gap-3 border-zinc-800 bg-zinc-900/50">
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
          <p className="text-[13px] leading-relaxed text-zinc-400">
            Reconnecting to presence… your devices show as online once the connection is back.
          </p>
        </Panel>
      ) : null}

      {sorted.length === 0 ? (
        <EmptyState
          title="No devices yet"
          description="Sign in on another device with handitoff open and it'll appear here, ready for instant handoffs."
        />
      ) : (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800">
          {sorted.map((device) => (
            <DeviceRow key={device.id} device={device} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceRow({ device }: { device: AccountDevice }) {
  const { startHandoff, renameDevice, removeDevice, outgoing } = useDevices();
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(device.label);
  const [saving, setSaving] = useState(false);

  const platform = devicePlatformLabel(device);
  const handoffPending = outgoing?.targetDeviceId === device.id;

  const commitRename = () => {
    const next = label.trim();
    if (next === "" || next === device.label) {
      setRenaming(false);
      setLabel(device.label);
      return;
    }
    setSaving(true);
    renameDevice(device.id, next)
      .then(() => setRenaming(false))
      .catch(() => setLabel(device.label))
      .finally(() => setSaving(false));
  };

  return (
    <div className="flex flex-col gap-3 bg-zinc-950 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {renaming ? (
          <div className="flex items-center gap-2">
            <input
              value={label}
              autoFocus
              onChange={(event) => setLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename();
                if (event.key === "Escape") {
                  setRenaming(false);
                  setLabel(device.label);
                }
              }}
              maxLength={80}
              aria-label="Device name"
              className="h-8 w-48 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 text-sm text-zinc-50 outline-none focus-visible:border-zinc-500"
            />
            <button
              type="button"
              onClick={commitRename}
              disabled={saving}
              aria-label="Save name"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setLabel(device.label);
              }}
              aria-label="Cancel rename"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-100">{device.label}</span>
            {device.thisDevice ? (
              <span className="rounded-full border border-zinc-700 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-400">
                This device
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setLabel(device.label);
                setRenaming(true);
              }}
              aria-label={`Rename ${device.label}`}
              className="text-zinc-600 transition-colors hover:text-zinc-300"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
          {platform !== "" ? <span>{platform}</span> : null}
          {platform !== "" ? <span aria-hidden="true">·</span> : null}
          <span className={cn(device.online ? "text-emerald-400" : "text-zinc-500")}>
            {device.online ? "Online" : `Last seen ${formatRelativeTime(device.lastSeenAt)}`}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!device.thisDevice && device.online ? (
          <Button
            size="sm"
            type="button"
            onClick={() => startHandoff(device)}
            disabled={outgoing !== undefined}
          >
            {handoffPending ? "Requested…" : "Start handoff"}
          </Button>
        ) : null}
        {!device.thisDevice ? (
          <RemoveDeviceDialog
            device={device}
            onConfirm={() => {
              void removeDevice(device.id).catch(() => undefined);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function RemoveDeviceDialog({
  device,
  onConfirm,
}: {
  device: AccountDevice;
  onConfirm: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" type="button">
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {device.label}?</DialogTitle>
          <DialogDescription>
            This forgets the device from your account. It can sign in again to re-register, but it
            won't be offered for handoffs until it does.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive" onClick={onConfirm}>
              Remove device
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
