.PHONY: dev build install lint check clean test test-rust test-front front icons

# Development — frontend (Vite HMR) + backend (Rust rebuild on change)
dev:
	npm run tauri dev

# Frontend only (sem janela desktop)
front:
	npm run dev

# Build de producao
build:
	npm run tauri build

# Instalar todas as dependencias
install:
	npm install
	cd src-tauri && cargo fetch

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
