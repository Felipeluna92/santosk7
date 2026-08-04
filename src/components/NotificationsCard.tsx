import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BellRing, BellOff, Download, Loader2, ShieldAlert, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getPushConfig,
  removePushSubscription,
  runAccountsHealthCheck,
  savePushSubscription,
  sendTestPush,
} from "@/lib/push.functions";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

export function NotificationsCard() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  const config = useQuery({ queryKey: ["push-config"], queryFn: () => getPushConfig() });

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) return;

    setInstalled(window.matchMedia("(display-mode: standalone)").matches);

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(Boolean(sub)))
      .catch(() => setSupported(false));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const save = useMutation({
    mutationFn: (input: { endpoint: string; p256dh: string; auth: string; label: string }) =>
      savePushSubscription({ data: input }),
  });
  const remove = useMutation({
    mutationFn: (endpoint: string) => removePushSubscription({ data: { endpoint } }),
  });
  const test = useMutation({
    mutationFn: () => sendTestPush(),
    onSuccess: (r) =>
      r.sent > 0
        ? toast.success("Notificação de teste enviada.")
        : toast.error("Nenhum aparelho recebeu. Ative as notificações primeiro."),
  });
  const check = useMutation({
    mutationFn: () => runAccountsHealthCheck(),
    onSuccess: (r) =>
      r.down > 0
        ? toast.error(`${r.down} conta(s) com problema. Veja a notificação enviada.`)
        : toast.success(`Tudo certo: ${r.checked} conta(s) respondendo à API oficial.`),
    onError: (e: Error) => toast.error(e.message),
  });

  async function enable() {
    if (!config.data?.publicKey) {
      toast.error("Chave de notificação não configurada no servidor.");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permissão de notificação negada pelo navegador.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.data.publicKey),
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await save.mutateAsync({
        endpoint: json.endpoint ?? sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        label: navigator.userAgent.slice(0, 120),
      });
      setEnabled(true);
      toast.success("Notificações ativadas neste aparelho.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ativar as notificações.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await remove.mutateAsync(sub.endpoint);
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast.success("Notificações desativadas neste aparelho.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <BellRing className="h-4 w-4" /> Monitoramento e notificações
      </h2>
      <p className="mb-3 text-[11px] text-muted-foreground">
        O servidor verifica as contas a cada 10 minutos usando a API oficial da Meta. Se uma conta cair,
        tiver o token expirado ou sofrer restrição de permissão, você recebe uma notificação no aparelho —
        mesmo com o app fechado.
      </p>

      {!supported ? (
        <p className="flex items-center gap-2 rounded-md border border-warning/25 bg-warning/5 p-2.5 text-[11px] text-muted-foreground">
          <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
          Este navegador não suporta notificações push. No iPhone, instale o app na tela de início primeiro.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <Button size="sm" variant="secondary" onClick={disable} disabled={busy}>
              <BellOff className="h-4 w-4" /> Desativar neste aparelho
            </Button>
          ) : (
            <Button size="sm" onClick={enable} disabled={busy || !config.data?.ready}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              Ativar notificações
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
            Enviar teste
          </Button>
          <Button size="sm" variant="outline" onClick={() => check.mutate()} disabled={check.isPending}>
            {check.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Verificar contas agora
          </Button>
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <h3 className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold">
          <Smartphone className="h-3.5 w-3.5" /> Instalar o app
        </h3>
        {installed ? (
          <p className="text-[11px] text-muted-foreground">App já instalado neste aparelho.</p>
        ) : installEvent ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await installEvent.prompt();
              setInstallEvent(null);
            }}
          >
            <Download className="h-4 w-4" /> Instalar no aparelho
          </Button>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No Android/Chrome: menu ⋮ → “Instalar app” ou “Adicionar à tela inicial”. No iPhone/Safari:
            Compartilhar → “Adicionar à Tela de Início”.
          </p>
        )}
      </div>
    </div>
  );
}
