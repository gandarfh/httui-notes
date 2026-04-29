# httui Landing Page — Estrutura de Secoes

Mapa completo de secoes, ordem, e hierarquia visual.

---

## Layout Geral

```
[Nav fixa no topo]
  Logo (httui) | GitHub link | Download button

[Hero]                          — fullscreen, fundo escuro, media centralizada
[Problem Statement]             — fundo claro, 3 cards
[Core Features]                 — alternating layout (media esquerda/direita)
  - HTTP Blocks                 — media direita
  - Database Blocks             — media esquerda
  - E2E Test Blocks             — media direita
  - Block References            — media esquerda
[Editor Features]               — grid 2x3 de cards com icones
[AI Integration]                — fundo escuro, media grande
[Storage & Philosophy]          — fundo claro, 3 cards com icones
[Comparison Table]              — tabela responsiva
[Technical Highlights]          — fundo escuro, grid 2x2
[Getting Started]               — fundo claro, 4 steps numerados + GIF
[Footer]                        — fundo escuro, links + badges
```

---

## Responsividade

### Desktop (>1024px)
- Hero: headline esquerda + media direita (ou media centralizada)
- Core Features: alternating 50/50 layout
- Cards: grids 2x3 ou 3 colunas
- Comparison table: tabela completa

### Tablet (768-1024px)
- Core Features: stack vertical (texto + media)
- Cards: grid 2x2
- Comparison table: scroll horizontal

### Mobile (<768px)
- Tudo stack vertical
- Cards: 1 coluna
- Comparison table: cards individuais por ferramenta
- Nav: hamburger menu

---

## Paleta de cores sugerida

Baseada no dark mode do app:

| Token | Hex | Uso |
|-------|-----|-----|
| bg-dark | #0d1117 | Hero, secoes escuras |
| bg-light | #161b22 | Secoes claras (no dark theme) |
| bg-card | #1c2128 | Cards |
| accent | #58a6ff | Links, CTAs, highlights |
| accent-secondary | #3fb950 | Success, HTTP GET |
| text-primary | #e6edf3 | Headlines |
| text-secondary | #8b949e | Body text |
| border | #30363d | Separadores, card borders |
| method-get | #3fb950 | GET badge |
| method-post | #58a6ff | POST badge |
| method-put | #d29922 | PUT badge |
| method-delete | #f85149 | DELETE badge |

---

## Animacoes sugeridas

1. **Hero media:** fade-in + slight scale on load
2. **Cards:** fade-in on scroll (IntersectionObserver)
3. **Core Features:** media slide-in from alternating sides
4. **Comparison table checkmarks:** staggered fade-in
5. **Getting Started steps:** sequential reveal
6. **Code snippets:** typewriter effect no `{{alias.response.id}}`

---

## SEO / Meta

```html
<title>httui — Your API docs, alive</title>
<meta name="description" content="Desktop editor where markdown meets execution. Write docs, run HTTP requests, query databases, test APIs — all in the same file. Open source.">
<meta property="og:title" content="httui — Your API docs, alive">
<meta property="og:description" content="Desktop markdown editor with executable HTTP, database, and E2E test blocks. Local-first, open source.">
<meta property="og:image" content="https://httui.com/og-image.png">
<meta property="og:url" content="https://httui.com">
<meta name="twitter:card" content="summary_large_image">
```

**og-image.png specs:** 1200x630px, dark background, logo + headline + screenshot miniatura

---

## Dominio & Hosting

- **Dominio:** httui.com
- **Hosting:** GitHub Pages
- **Deploy:** GitHub Actions (build on push to `gh-pages` branch ou `/docs` folder)
- **CNAME:** arquivo `CNAME` com `httui.com` no root do deploy
- **SSL:** automatico via GitHub Pages + custom domain

### Opcoes de setup:

**Opcao A — Branch `gh-pages`:**
```
landing-page/          # source
  -> build ->
gh-pages branch        # deploy (GitHub Pages source)
```

**Opcao B — Repo separado:**
```
httui.com/             # repo separado
  index.html
  assets/
  CNAME
```

**Opcao C — `/docs` folder no repo principal:**
```
docs/landing/          # GitHub Pages aponta para /docs/landing
```

Recomendo **Opcao B** (repo separado) para manter o repo do app limpo.
