import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Check, CheckCheck, Clock, FileText, ImageOff, Loader2, MapPin } from "lucide-react";
import type { Message } from "@/hooks/use-messages";

const MEDIA_BUCKET = "whatsapp-media";
const SIGNED_URL_TTL = 60 * 60;

/**
 * Resolve a chave salva em media_bucket_key para uma URL acessível pelo
 * navegador. O bucket "whatsapp-media" (Supabase Storage) é privado — dado de
 * paciente/LGPD — então a URL é assinada sob demanda com a sessão do usuário
 * (policy de SELECT só para authenticated) e expira em 1h.
 *
 * Quem sobe o arquivo é o workflow n8n "Uazapi -> Redeoto (Recebimento)",
 * logo depois de gravar a mensagem; por isso a chave pode chegar alguns
 * segundos depois da mensagem em si.
 */
function useMediaUrl(bucketKey: string | null) {
  return useQuery({
    queryKey: ["media-url", bucketKey],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(bucketKey as string, SIGNED_URL_TTL);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !!bucketKey,
    staleTime: (SIGNED_URL_TTL - 5 * 60) * 1000,
    retry: 1,
  });
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Tique de status estilo WhatsApp — só faz sentido pra mensagem ENVIADA
 * (o lead não "recebe confirmação de leitura" da mensagem que ele mesmo
 * mandou). Vem de automation_messages.status, atualizado pelo workflow de
 * recebimento do n8n a cada evento `messages_update` da Uazapi.
 */
function StatusTicks({ status }: { status: Message["status"] }) {
  if (status === "failed") {
    return <span title="Falha no envio">⚠️</span>;
  }
  if (status === "read") {
    return <CheckCheck className="h-3.5 w-3.5 text-sky-300" aria-label="Lida" />;
  }
  if (status === "delivered") {
    return <CheckCheck className="h-3.5 w-3.5" aria-label="Entregue" />;
  }
  if (status === "sent") {
    return <Check className="h-3.5 w-3.5" aria-label="Enviada, ainda não entregue" />;
  }
  return <Clock className="h-3 w-3" aria-label="Enviando" />;
}

function MediaPending({ label, loading }: { label: string; loading?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-black/10 px-2.5 py-2 text-xs opacity-80">
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        <ImageOff className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>{loading ? `${label} — carregando…` : `${label} — arquivo não disponível`}</span>
    </div>
  );
}

function MessageMedia({ message }: { message: Message }) {
  const { data: url, isLoading } = useMediaUrl(message.media_bucket_key);

  if (message.message_type === "image") {
    if (!url) return <MediaPending label="Foto" loading={isLoading} />;
    return (
      <img src={url} alt="Imagem enviada" className="max-w-full rounded-lg max-h-64 object-cover" />
    );
  }

  if (message.message_type === "audio") {
    if (!url)
      return (
        <MediaPending
          label={`Áudio ${formatDuration(message.media_duration_seconds)}`}
          loading={isLoading}
        />
      );
    return <audio controls preload="none" src={url} className="w-full max-w-[260px] h-9" />;
  }

  if (message.message_type === "video") {
    if (!url) return <MediaPending label="Vídeo" loading={isLoading} />;
    return <video controls preload="none" src={url} className="max-w-full rounded-lg max-h-64" />;
  }

  if (message.message_type === "document") {
    if (!url) return <MediaPending label="Documento" loading={isLoading} />;
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-lg bg-black/10 px-2.5 py-2 text-xs underline"
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        Abrir documento
      </a>
    );
  }

  if (message.message_type === "location") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-black/10 px-2.5 py-2 text-xs">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        Localização compartilhada
      </div>
    );
  }

  return null;
}

export function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === "outbound";
  const hasMedia = message.message_type !== "text";

  return (
    <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 space-y-1.5",
          isOutbound
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-secondary rounded-bl-sm",
        )}
      >
        {hasMedia && <MessageMedia message={message} />}
        {message.body && <p className="text-sm whitespace-pre-wrap">{message.body}</p>}
        <div
          className={cn(
            "flex items-center gap-1.5 text-[10px]",
            isOutbound ? "opacity-80 justify-end" : "text-muted-foreground",
          )}
        >
          {message.is_from_bot && <span>🤖 bot</span>}
          {!message.is_from_bot && isOutbound && message.sender_name && (
            <span>{message.sender_name}</span>
          )}
          <span>{formatTime(message.created_at)}</span>
          {isOutbound && <StatusTicks status={message.status} />}
        </div>
      </div>
    </div>
  );
}
