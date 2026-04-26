# Timing breakdown completo via isahc — V2 candidate

Status: parking lot · adiada do epic 24 (Onda 4) · 2026-04-26

---

## Contexto

O bloco HTTP V1 ship com `total_ms` + `ttfb_ms` apenas. Os campos `dns_ms`, `connect_ms`, `tls_ms` em `httui-core/src/executor/http/types.rs::TimingBreakdown` ficam `None` — o cliente HTTP atual (`reqwest 0.12` com `rustls-tls`) não expõe esses sub-timings, e os caminhos pra extraí-los exigem código de transporte que não vale o ROI no V1.

Este doc captura a investigação completa pra que a decisão seja revisitável quando a demanda aparecer.

---

## O que `isahc` resolve

`isahc` liga em `libcurl`, e `libcurl` expõe via `curl_easy_getinfo` os campos exatos que queremos:

- `CURLINFO_NAMELOOKUP_TIME` → DNS
- `CURLINFO_CONNECT_TIME` → TCP connect
- `CURLINFO_APPCONNECT_TIME` → handshake TLS (subtrair `connect_time`)
- `CURLINFO_STARTTRANSFER_TIME` → TTFB
- `CURLINFO_TOTAL_TIME` → total

A API Rust é `isahc::ResponseExt::metrics() -> Option<&Metrics>`, com métodos `name_lookup_time()`, `connect_time()`, `secure_connect_time()`, `transfer_start_time()`, `total_time()`. Battle-tested há 25+ anos no `libcurl` — números lidos direto do kernel + lib TLS, sem heurística.

Cobre tudo o que faltou no V1, **incluindo** distinguir `Some(0) (cached)` de `None (não medido)` corretamente — connection-pool reuse aparece com DNS/Connect = 0 reportado pelo próprio libcurl.

---

## Custos da migração

| Custo | Detalhe | Estimativa |
|---|---|---|
| Perde rustls | isahc 1.5+ tem feature `rustls`, mas é menos exercitada que reqwest+rustls. Default vai pra nativetls (Secure Transport macOS, SChannel Windows, OpenSSL Linux) — comportamento de cert validation pode variar entre OSes. | risco médio, validar |
| Multipart manual | `reqwest::multipart::Form` (~30 LOC em `mod.rs:328-363`) precisa virar construção de body manual (boundary, Content-Type por part, CRLFs) ou puxar crate auxiliar (`mpart-async`). | +50-80 LOC |
| libcurl como dep C | macOS/Linux usam system libcurl OK (pkg-config). Windows precisa vendor — feature `static-curl` da isahc compila libcurl from source: build time +1-2min, binário +2-3MB. | atrapalha CI |
| Cancel mid-body | Hoje `tokio::select!` em volta de `req.send()` aborta o future. isahc usa libcurl multi handle internamente — drop libera, mas precisa testar se cancel realmente fecha o socket TCP (não só o future Rust). | +1 teste de integração |
| Tokio compat | isahc usa `futures::AsyncRead`, não `tokio::AsyncRead`. Streaming precisa `tokio_util::compat`. | trivial |
| Portar testes | 30+ testes em `httui-core/src/executor/http/mod.rs` usam wiremock + esperam shape específico de erro classificado (`[timeout]`, `[connection_failed]`). `classify_reqwest_error` precisa virar `classify_isahc_error` com mapeamento equivalente. | ~1h |

**Total estimado:** ~1 dia focado pra rewrite limpo + portar testes + validar nos 3 OSes (macOS arm64, macOS x86_64, Linux x86_64, Windows x86_64 — Tauri target matrix).

Comparar com **V1 escolhido** (split TTFB em reqwest puro): ~10 LOC, zero risco, encaixa no refactor de streaming já planejado.

---

## Quando reavaliar

Critérios pra promover esta migração de "parking lot" pra epic ativo:

1. **Telemetria de uso da tab Timing** — se >20% dos usuários ativos abrem a tab Timing por sessão e timing parcial (`total + ttfb` apenas) gera reclamação concreta, é sinal.
2. **Demanda explícita por DNS slow / TLS slow debugging** — se aparecer issue/feedback "minha API parece lenta, queria ver onde está o gargalo" e a resposta "ttfb foi 2s, mas não sei se foi DNS, TCP ou TLS" não satisfaz.
3. **Conexões cold dominam o workflow** — se análise mostrar que <50% dos requests reusam pool (workflows com hosts variados), os campos extras passam a ter valor real (em vez de `Some(0)` 90% do tempo).
4. **httui-tui ou outro frontend headless quer expor timings** — projeto irmão `/Users/joao/gandarfh/httui-notes/httui-tui/` pode querer expor timings em CLI/TUI mode, e o ROI muda.

---

## Esqueleto de migração (referência futura)

```rust
// httui-core/Cargo.toml — substitui reqwest
isahc = { version = "1.7", features = ["rustls", "json"] }
tokio-util = { version = "0.7", features = ["compat"] }

// httui-core/src/executor/http/mod.rs — client builder
use isahc::{config::*, prelude::*, HttpClient};

let client = HttpClient::builder()
    .timeout(Duration::from_secs(30))
    .redirect_policy(if flags.follow_redirects {
        RedirectPolicy::Limit(10)
    } else {
        RedirectPolicy::None
    })
    .ssl_options(if !flags.verify_ssl {
        SslOption::DANGER_ACCEPT_INVALID_CERTS | SslOption::DANGER_ACCEPT_INVALID_HOSTS
    } else {
        SslOption::NONE
    })
    .build()?;

// extraindo timing breakdown completo
let response = client.send_async(req).await?;
let metrics = response.metrics().expect("metrics enabled by default");

let timing = TimingBreakdown {
    total_ms: metrics.total_time().as_millis() as u64,
    dns_ms: Some(metrics.name_lookup_time().as_millis() as u64),
    connect_ms: Some(
        (metrics.connect_time() - metrics.name_lookup_time()).as_millis() as u64
    ),
    tls_ms: Some(
        (metrics.secure_connect_time() - metrics.connect_time()).as_millis() as u64
    ),
    ttfb_ms: Some(metrics.transfer_start_time().as_millis() as u64),
    connection_reused: metrics.name_lookup_time().is_zero()
        && metrics.connect_time().is_zero(),
};
```

Multipart precisa de body construído manualmente — `multipart-rfc7578` ou implementação inline.

---

## Decisão registrada

- **Data:** 2026-04-26
- **Decisão:** V1 (epic 24 Onda 4) ship com split TTFB em reqwest puro — `total_ms` + `ttfb_ms` apenas.
- **Razão:** custo de migração (~1 dia + dep C + perda rustls) desproporcional ao valor (3 sub-fields que serão `Some(0)` na maioria dos requests pool-reused).
- **Revisor:** quando algum dos 4 critérios acima aparecer, reabrir esta análise.
