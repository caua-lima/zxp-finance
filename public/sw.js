// Service worker mínimo — só existe pra receber push notification e abrir
// o app quando clicada. Nada de cache offline aqui (não é o objetivo).

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { title: "Financeiro", body: event.data ? event.data.text() : "" };
  }

  const titulo = dados.title || "Financeiro";
  const opcoes = {
    body: dados.body || "",
    icon: "/api/icon?size=192",
    badge: "/api/icon?size=192",
    data: { url: dados.url || "/saldo" },
  };

  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/saldo";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if (cliente.url.includes(self.location.origin) && "focus" in cliente) {
          cliente.navigate(url);
          return cliente.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
