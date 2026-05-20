import { useState } from "react";
import { AlertTriangle, Copy, KeyRound, Loader2, Plus, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/codepulse/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelHeader } from "@/components/codepulse/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCreateDeviceToken, useDeviceTokens, useRevokeDeviceToken } from "@/hooks/use-device-tokens";
import type { DeviceToken } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function DeviceTokensSection() {
  const listQ = useDeviceTokens();
  const createM = useCreateDeviceToken();
  const revokeM = useRevokeDeviceToken();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [generatePhase, setGeneratePhase] = useState<"form" | "reveal">("form");
  const [tokenName, setTokenName] = useState("Mobile device");
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<DeviceToken | null>(null);

  function resetGenerateDialog() {
    setGeneratePhase("form");
    setRevealedToken(null);
    setTokenName("Mobile device");
  }

  function handleGenerateOpenChange(next: boolean) {
    if (!next && generatePhase === "reveal") {
      return;
    }
    setGenerateOpen(next);
    if (!next) {
      resetGenerateDialog();
    }
  }

  async function handleSubmitGenerate() {
    const name = tokenName.trim() || "Mobile device";
    try {
      const data = await createM.mutateAsync(name);
      setRevealedToken(data.token);
      setGeneratePhase("reveal");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create token.");
    }
  }

  function handleSavedAcknowledge() {
    setGenerateOpen(false);
    resetGenerateDialog();
  }

  async function copyToken() {
    if (!revealedToken) return;
    try {
      await navigator.clipboard.writeText(revealedToken);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Could not copy — select the token and copy manually.");
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    try {
      await revokeM.mutateAsync(revokeTarget.id);
      toast.success("Token revoked.");
      setRevokeTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke token.");
    }
  }

  const tokens = listQ.data ?? [];

  return (
    <>
      <section id="device-tokens" className="scroll-mt-24">
        <Panel>
          <PanelHeader
            title="Device tokens"
            hint="Bearer tokens for the CodePulse mobile app. The secret is shown only once when you create a token."
            action={
              <Button
                type="button"
                size="sm"
                className="shrink-0 gap-2 bg-zinc-100 text-zinc-900 hover:bg-white"
                onClick={() => {
                  resetGenerateDialog();
                  setGenerateOpen(true);
                }}
              >
                <Plus className="size-4" />
                Generate new token
              </Button>
            }
          />
          {listQ.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
              <Loader2 className="size-4 animate-spin" />
              Loading tokens…
            </div>
          ) : listQ.isError ? (
            <p className="py-8 text-center text-sm text-red-400">
              {listQ.error instanceof Error ? listQ.error.message : "Could not load device tokens."}
            </p>
          ) : tokens.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No device tokens yet"
              body="Create a token here, then paste it into the mobile app once. You can revoke access anytime from this list."
              action={
                <Button
                  type="button"
                  size="sm"
                  className="gap-2 bg-zinc-100 text-zinc-900 hover:bg-white"
                  onClick={() => {
                    resetGenerateDialog();
                    setGenerateOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  Generate your first token
                </Button>
              }
            />
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800/60">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/60 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Name</TableHead>
                    <TableHead className="text-zinc-400">Created</TableHead>
                    <TableHead className="text-zinc-400">Last used</TableHead>
                    <TableHead className="w-[120px] text-right text-zinc-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.map((t) => {
                    const revoked = Boolean(t.revokedAt);
                    return (
                      <TableRow
                        key={t.id}
                        className={cn(
                          "border-zinc-800/60",
                          revoked && "bg-zinc-950/50 text-zinc-500",
                        )}
                      >
                        <TableCell className="font-medium text-zinc-200">
                          <span className="inline-flex items-center gap-2">
                            {t.name}
                            {revoked ? <Badge tone="default">Revoked</Badge> : null}
                          </span>
                        </TableCell>
                        <TableCell className="text-zinc-400">{formatTs(t.createdAt)}</TableCell>
                        <TableCell className="text-zinc-400">{formatTs(t.lastUsedAt)}</TableCell>
                        <TableCell className="text-right">
                          {!revoked ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                              disabled={revokeM.isPending}
                              onClick={() => setRevokeTarget(t)}
                            >
                              Revoke
                            </Button>
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <Card className="mt-6 border-zinc-800 bg-zinc-950/40 p-4">
            <div className="flex gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-zinc-900 ring-1 ring-zinc-800">
                <Smartphone className="size-4 text-zinc-400" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-zinc-200">Using CodePulse on mobile?</h4>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  Generate a device token on this page while signed in on the web. Open the mobile app, paste the token
                  when prompted, and store it in the app&apos;s secure storage — the server never shows the secret
                  again after you leave this dialog.
                </p>
              </div>
            </div>
          </Card>
        </Panel>
      </section>

      <Dialog open={generateOpen} onOpenChange={handleGenerateOpenChange}>
        <DialogContent
          className={cn(
            "border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-lg",
            generatePhase === "reveal" && "[&>button.absolute.right-4]:hidden",
          )}
          onPointerDownOutside={(e) => {
            if (generatePhase === "reveal") e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (generatePhase === "reveal") e.preventDefault();
          }}
        >
          {generatePhase === "form" ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-zinc-100">Generate device token</DialogTitle>
                <DialogDescription className="text-zinc-500">
                  Choose a label so you can tell devices apart in the list below.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="device-token-name" className="text-zinc-400">
                  Name
                </Label>
                <Input
                  id="device-token-name"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="Mobile device"
                  autoComplete="off"
                  className="border-zinc-800 bg-zinc-900 font-mono text-sm text-zinc-100"
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  className="border-zinc-700 text-zinc-300"
                  onClick={() => handleGenerateOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-zinc-100 text-zinc-900 hover:bg-white"
                  disabled={createM.isPending}
                  onClick={() => void handleSubmitGenerate()}
                >
                  {createM.isPending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    "Generate token"
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-zinc-100">Copy your token now</DialogTitle>
                <DialogDescription className="text-zinc-500">
                  This credential grants access to your CodePulse account until you revoke it.
                </DialogDescription>
              </DialogHeader>
              <Alert variant="destructive" className="border-red-500/40 bg-red-500/10 text-red-100">
                <AlertTriangle className="size-4 text-red-400" />
                <div>
                  <AlertTitle className="text-red-200">Save this now</AlertTitle>
                  <AlertDescription className="text-red-200/90">
                    You will not see this token again after you close this dialog. Copy it to a safe place or paste it
                    into the mobile app before continuing.
                  </AlertDescription>
                </div>
              </Alert>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input readOnly value={revealedToken ?? ""} className="font-mono text-xs text-zinc-100 border-zinc-800 bg-zinc-900" />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0 gap-2 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                    onClick={() => void copyToken()}
                  >
                    <Copy className="size-4" />
                    Copy
                  </Button>
                </div>
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  Anyone with this token can use the API as you until it is revoked from this settings page.
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  className="w-full bg-zinc-100 text-zinc-900 hover:bg-white sm:w-auto"
                  onClick={handleSavedAcknowledge}
                >
                  I&apos;ve saved it
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke device token?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {revokeTarget ? (
                <>
                  The token <span className="font-medium text-zinc-200">{revokeTarget.name}</span> will stop working
                  immediately. Apps using it will need a new token.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800">
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={revokeM.isPending}
              onClick={() => void confirmRevoke()}
            >
              {revokeM.isPending ? "Revoking…" : "Revoke token"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
