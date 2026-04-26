# Encryption at rest for `notes.db` — V2 candidate

Status: parking lot · adiada do epic 16 (L173) · 2026-04-26

---

## Contexto

`notes.db` (SQLite no app data dir) hoje é **plaintext + file mode `0600`**. Senhas e secret env vars não vivem nele — vão pro OS keychain. O modelo de ameaças cobre user-mode same-user processes (mode `0600` basta) e delega disk imaging / lost device pro FileVault / BitLocker / LUKS.

Este doc captura a investigação completa pra que a decisão seja revisitável quando a demanda aparecer.

---

## O que SQLCipher resolveria

Encriptaria os dados Tier 2/3 que hoje ficam plaintext no `notes.db`:

- Connection metadata (host, port, username, database name)
- Env variable **keys** (não os values secretos — esses já estão no keychain)
- `block_results` cache (response bodies inteiros — podem incluir tokens echoed pelo servidor)
- `chat history` (`messages`, `sessions`)
- `query_log` (audit log com queries executadas)
- `app_config`, `block_settings`, `block_examples`, `block_run_history`

Threat coverage que ganharíamos:
- **Lost device sem FDE**: laptop roubado com FileVault/BitLocker desativado. Hoje tudo acima é legível com `sqlite3 notes.db`. Com SQLCipher, precisa do OS keychain.
- **Disk imaging por root/admin process**: hoje root lê tudo. Com SQLCipher, root ainda pode (pode ler keychain também), mas atacante precisa juntar dois artefatos.
- **Vault em sync (Git/iCloud/Dropbox)**: se `notes.db` for sincronizado pra fora do disco local, plaintext fica exposto no provider. Com SQLCipher, fica encriptado no remote.

---

## Custos da migração

| Custo | Detalhe | Estimativa |
|---|---|---|
| Build complexity (Windows CI) | `bundled-sqlcipher-vendored-openssl` precisa OpenSSL + perl + nasm no runner. Issue rusqlite #1025 documenta o atrito. | alta |
| Build time | Vendored OpenSSL adiciona ~60-90s ao build de cada plataforma. | média |
| Binary size | +1-2 MB por plataforma. | baixa |
| Perf overhead | 5-15% read/write (Zetetic benchmarks). KDF lento na primeira query (~100ms+ com PBKDF2 default — mitigado usando raw key hex de 64 chars em vez de passphrase). | baixa-média |
| Cross-compile mac universal (arm64+x86_64) | Cada arch precisa do seu libcrypto vendorado. Build duplica. | média |
| Migration de DBs em prod | `ATTACH plain.db AS plaintext KEY ''; sqlcipher_export('encrypted');` em ~30 LOC + swap atômico. Downtime de migração ~segundos pra DBs <50MB. Backup `.db.bak` por 1 release pra rollback. | média |
| Manutenção sqlx + SQLCipher | sqlx 0.8 não tem feature flag dedicada — caminho idiomático é puxar `libsqlite3-sys = { features = ["bundled-sqlcipher"] }` direto. Não é blessed pelo upstream sqlx; quebrar com upgrade é possível. Tauri plugins-workspace #2528 ainda aberta (mar/2025). | recurring |

**Total estimado:** ~2-3 dias de trabalho focado pra rewrite + Windows CI fix + migration script + portar testes + validar nos 3 OSes (macOS arm64, macOS x86_64, Linux x86_64, Windows x86_64).

Comparar com **V1 escolhido** (file mode `0600` + secrets out-of-band no keychain): zero LOC, zero overhead, zero CI pain. Cobre o threat model documentado em `docs/SECURITY.md`.

---

## Alternativas rejeitadas

- **SQLite SEE oficial** (US$ 2000 perpetual license). Sem suporte sqlx pronto — build complexity igual ao SQLCipher, mais o cheque. Sem upside técnico vs SQLCipher edition community.
- **SQLCipher dynamic (system libcrypto)** — UX ruim pra desktop app. Usuário pode receber DLL/dylib not found ao instalar.
- **Encriptar só `block_results` em vez do DB inteiro** — overhead de implementar layer de crypto em cima do storage existente, sem economizar muito (response bodies são >50% do volume).

---

## Comparação com competitors

- **Insomnia**: explicitamente *not encrypted at rest*. Design choice, foco é E2EE em transit. Local Vault é só "fica no disco".
- **Postman**: encripta secrets/env vars (storage proprietário), mas o banco local geral não é SQLCipher-style.
- **Bruno / HTTPie Desktop**: plain files / plain DB.

Encriptar `notes.db` colocaria httui-notes acima do baseline da categoria, mas **não é tablestakes**.

---

## Critérios pra reabrir

Quando algum dos três sinais abaixo aparecer, esta análise volta pra ativa:

1. **Compliance / contractual driver** — primeiro cliente enterprise pedindo SOC2/ISO27001 onde encryption-at-rest é checklist item, ou regulação (HIPAA/GDPR data-residency claim) entrar no roadmap. Aí o ROI muda de "nice" pra "blocking sale".
2. **Sync / cloud feature shipping** — se `httui-notes` ganhar sync de vault entre máquinas (S3, iCloud Drive nativo, sync server próprio), o DB sai do disco local controlado pelo `0600` e exposição em terceiros (provider, backup snapshots) torna encryption-at-rest necessário.
3. **Incidente concreto** — bug report ou disclosure mostrando que `block_results` ou `query_log` vazaram secret material recuperável (ex.: token echoed em response cacheado + laptop roubado sem FDE). Um único caso documentado vira sinal forte.

---

## Esqueleto de migração (referência futura)

```toml
# httui-core/Cargo.toml — adicionar dep direta de libsqlite3-sys
# pra SQLCipher ser linkado antes do sqlx detectar.
[dependencies]
libsqlite3-sys = { version = "0.30", features = [
    "bundled-sqlcipher-vendored-openssl",
] }
sqlx = { version = "0.8", features = [...] }
```

```rust
// On db init, before any query:
use sqlx::Executor;
let key_hex = keychain::get_or_create("db:master:key", 32)?; // hex 64 chars
sqlx::query(&format!(r#"PRAGMA key = "x'{}'"#, key_hex))
    .execute(&pool)
    .await?;
// Optional: PRAGMA cipher_memory_security = OFF; for perf
```

```rust
// One-shot migration of an existing plaintext DB:
let plain = SqlitePool::connect("sqlite:notes.db").await?;
plain.execute(
    "ATTACH DATABASE 'notes.encrypted.db' AS encrypted KEY \"x'{key_hex}'\";"
).await?;
plain.execute("SELECT sqlcipher_export('encrypted');").await?;
plain.execute("DETACH DATABASE encrypted;").await?;
// Atomically swap files; keep .db.bak for rollback.
```

Windows CI: instalar OpenSSL (FireDaemon binaries) e setar `OPENSSL_DIR` no env do runner antes do `cargo build`.

---

## Decisão registrada

- **Data:** 2026-04-26
- **Decisão:** V1 (epic 16) ship sem encryption-at-rest no `notes.db`. File mode `0600` + secrets no OS keychain cobrem o threat model documentado.
- **Razão:** custo de migração (Windows CI, +2MB binário, 5-15% perf, complexidade de manutenção sqlx + libsqlite3-sys override) desproporcional ao valor — competitors da categoria (Insomnia, Postman, Bruno) operam no mesmo nível.
- **Revisor:** quando algum dos 3 critérios acima aparecer, reabrir esta análise.
