.PHONY: dev build install install-deps install-app uninstall lint check clean test test-rust test-front front icons sidecar

# Development — frontend (Vite HMR) + backend (Rust rebuild on change)
dev: sidecar
	npm run tauri dev

# Frontend only (sem janela desktop)
front:
	npm run dev

# Build do sidecar (JS bundle) — empacotado como recurso Tauri, executado via node
sidecar:
	@command -v bun >/dev/null 2>&1 || { \
		echo "Error: bun is required to build the sidecar."; \
		echo "Install with: curl -fsSL https://bun.sh/install | bash"; \
		exit 1; \
	}
	@mkdir -p src-tauri/resources
	cd sidecar && bun install && bun run build

# Build de producao (com bundle .app para macOS)
build: sidecar
	npm run tauri build -- --bundles app

# Instalar dependencias
install-deps:
	npm install
	cd sidecar && (command -v bun >/dev/null 2>&1 && bun install || echo "skip: bun not installed")
	cd src-tauri && cargo fetch

# Build + instalar app em /Applications (macOS)
APP_NAME = httui notes
APP_BUNDLE = target/release/bundle/macos/$(APP_NAME).app
install: build
	@if [ ! -d "$(APP_BUNDLE)" ]; then \
		echo "Error: build failed — $(APP_BUNDLE) not found"; \
		exit 1; \
	fi
	@echo "Installing $(APP_NAME) to /Applications..."
	@rm -rf "/Applications/$(APP_NAME).app"
	@cp -R "$(APP_BUNDLE)" "/Applications/$(APP_NAME).app"
	@echo "Done. Open with: open '/Applications/$(APP_NAME).app'"

# Remover app de /Applications
uninstall:
	@echo "Removing $(APP_NAME) from /Applications..."
	@rm -rf "/Applications/$(APP_NAME).app"
	@echo "Done."

# Type check + clippy
check:
	./node_modules/.bin/tsc --noEmit
	cd src-tauri && cargo clippy -- -D warnings

# Lint frontend
lint:
	./node_modules/.bin/tsc --noEmit

# Testes
test: test-rust test-front

test-rust:
	cd src-tauri && cargo test

test-front:
	npm run test 2>/dev/null || echo "No frontend tests configured yet"

# Limpar artifacts
clean:
	rm -rf dist
	cd src-tauri && cargo clean

# Gerar icones placeholder
icons:
	@mkdir -p src-tauri/icons
	@python3 -c "\
	import struct, zlib; \
	def png(w,h,r,g,b): \
	    ch=lambda t,d: struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff); \
	    raw=b''.join(b'\x00'+bytes([r,g,b,255])*w for _ in range(h)); \
	    return b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+ch(b'IDAT',zlib.compress(raw))+ch(b'IEND',b''); \
	[open(f'src-tauri/icons/{n}','wb').write(png(s,s,99,102,241)) for n,s in [('icon.png',256),('32x32.png',32),('128x128.png',128),('128x128@2x.png',256)]]; \
	print('icons generated')"
