// Service worker mínimo — recebe push e abre o app no lugar certo.
// Nada de cache offline aqui (não é o objetivo).
//
// Segurança (auditoria N07): a URL que vem no push só é usada se for um
// caminho do próprio app numa lista conhecida; qualquer outra coisa abre a
// central de notificações. A janela reaproveitada é comparada por ORIGEM
// exata (antes era `includes`, que aceitava origem parecida).

const ROTAS_PERMITIDAS = ["/", "/saldo", "/fatura", "/checklist", "/comissoes", "/notificacoes"];

function rotaSegura(url) {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return "/notificacoes";
  const caminho = url.split(/[?#]/)[0];
  return ROTAS_PERMITIDAS.includes(caminho) ? caminho : "/notificacoes";
}

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = {};
  }

  const titulo = typeof dados.title === "string" && dados.title ? dados.title : "ZXP Finance";
  const opcoes = {
    body: typeof dados.body === "string" ? dados.body : "Você tem um aviso novo.",
    icon: "/api/icon?size=192",
    badge: "/api/icon?size=192",
    // mesmo aviso chegando duas vezes (retry) substitui em vez de empilhar
    tag: typeof dados.id === "string" ? dados.id : undefined,
    data: { url: rotaSegura(dados.url) },
  };

  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(rotaSegura(event.notification.data && event.notification.data.url), self.location.origin);
  event.waitUntil(
    (async () => {
      const lista = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const cliente of lista) {
        if (new URL(cliente.url).origin === self.location.origin && "focus" in cliente) {
          await cliente.focus();
          if ("navigate" in cliente) await cliente.navigate(destino.href);
          return;
        }
      }
      await clients.openWindow(destino.href);
    })()
  );
});

// O navegador trocou a inscrição (expirou/rotacionou): revoga a antiga no
// servidor provando posse. O app recadastra a nova no próximo acesso, com
// a sessão de quem está logado (ver usePushNotifications — reparo).
self.addEventListener("pushsubscriptionchange", (event) => {
  const antiga = event.oldSubscription;
  if (!antiga) return;
  event.waitUntil(
    fetch("/api/push/revogar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: antiga.endpoint }),
    }).catch(() => {})
  );
});
